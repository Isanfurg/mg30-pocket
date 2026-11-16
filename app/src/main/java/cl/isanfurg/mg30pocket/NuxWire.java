package cl.isanfurg.mg30pocket;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** Restricted MG-30 framing. Not a generic SysEx console. */
final class NuxWire {
    static boolean supported(String firmware) { return firmware != null && firmware.matches("5\\.0\\.2|6\\.0\\.[25]"); }
    static String identity(byte[] frame) {
        if (frame.length < 12 || (frame[0]&255)!=240 || frame[1]!=67 || frame[2]!=88 || frame[3]!=16 || (frame[frame.length-1]&255)!=247) return null;
        String text = new String(frame,StandardCharsets.US_ASCII);
        if (!text.contains("MG-30") || text.contains("MKII") || text.contains("MK II") || text.contains("MK2")) return null;
        Matcher match = Pattern.compile("v?(5\\.0\\.2|6\\.0\\.[25])\\b").matcher(text);
        return match.find() ? match.group(1) : null;
    }
    static void validate(byte[] b, Set<Integer> armed) {
        int n=b.length;
        if (n<5 || n>222 || (b[0]&255)!=240 || (b[n-1]&255)!=247 || b[1]!=67 || b[2]!=88) throw new IllegalArgumentException("SysEx NUX no válido.");
        for(int i=1;i<n-1;i++)if((b[i]&255)>127)throw new IllegalArgumentException("SysEx necesita datos de 7 bits.");
        if(n==5 && b[3]==0)return;
        if(b[3]!=112)throw new IllegalArgumentException("Cabecera NUX no permitida.");
        if(n==7 && b[4]==21 && b[5]==0)return;
        if(n<15)throw new IllegalArgumentException("Longitud NUX no permitida.");
        int command=b[4],op=b[5],program=b[6],part=b[7];
        if((command==11||command==12)&&op==0&&part<=2&&n==15){for(int i=8;i<14;i++)if(b[i]!=0)throw new IllegalArgumentException("Consulta NUX no válida.");return;}
        if(command==11&&op==1&&part<=2&&n==222&&armed.contains(program))return;
        if(command==7&&op==1&&n==15&&program==part&&armed.contains(program)){for(int i=8;i<14;i++)if(b[i]!=0)throw new IllegalArgumentException("Commit no válido.");return;}
        throw new IllegalArgumentException("Escritura bloqueada: prepara y confirma una carga con respaldo.");
    }
    static Set<Integer> validateBackup(JSONObject bank) throws JSONException {
        if(!"mg30-midi-bank".equals(bank.getString("kind"))||bank.getInt("version")!=1||!"external".equals(bank.getString("assets"))||!supported(bank.getString("firmware")))throw new IllegalArgumentException("Respaldo NUX incompatible.");
        JSONArray records=bank.getJSONArray("records");
        if(records.length()<1||records.length()>128)throw new IllegalArgumentException("Tamaño de respaldo no válido.");
        Set<Integer> slots=new HashSet<>();
        for(int i=0;i<records.length();i++){
            JSONObject record=records.getJSONObject(i);int program=record.getInt("program");
            if(program<0||program>127||!slots.add(program))throw new IllegalArgumentException("Slot no válido o repetido.");
            JSONArray parts=record.getJSONArray("parts");if(parts.length()!=3)throw new IllegalArgumentException("Faltan partes del respaldo.");
            for(int j=0;j<3;j++){
                JSONArray part=parts.getJSONArray(j);if(part.length()!=220)throw new IllegalArgumentException("Parte NUX incompatible.");
                for(int k=0;k<220;k++){Object v=part.get(k);if(!(v instanceof Integer)||(Integer)v<0||(Integer)v>127)throw new IllegalArgumentException("Datos de respaldo no válidos.");}
                if(part.getInt(0)!=67||part.getInt(1)!=88||part.getInt(2)!=112||part.getInt(3)!=11||part.getInt(4)!=2||part.getInt(5)!=program||part.getInt(6)!=j)throw new IllegalArgumentException("El respaldo no coincide con sus slots.");
            }
        }
        return slots;
    }
}
