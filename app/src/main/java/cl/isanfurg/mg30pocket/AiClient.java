package cl.isanfurg.mg30pocket;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import java.io.*;

/** User-owned key only: encrypted with Android Keystore, never returned to the WebView. */
final class AiClient {
    private static final String ALIAS="mg30.openai.v1";
    private final SharedPreferences preferences;
    private volatile HttpsURLConnection active;
    AiClient(Context context){preferences=context.getSharedPreferences("ai-private",Context.MODE_PRIVATE);}
    private SecretKey secret() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    synchronized boolean saveKey(String value){
        if(value==null||!value.matches("sk-[A-Za-z0-9_-]{16,500}"))return false;
        try{
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secret());
            String iv=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP),data=Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            return preferences.edit().putString("key",iv+":"+data).commit();
        }catch(Exception ignored){return false;}
    }
    private synchronized String key() throws Exception {
        String saved=preferences.getString("key",null);if(saved==null)throw new IOException("AI_NO_KEY");
        String[] parts=saved.split(":",2);if(parts.length!=2)throw new IOException("AI_NO_KEY");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
    synchronized boolean hasKey(){try{return key().startsWith("sk-");}catch(Exception ignored){return false;}}
    synchronized boolean clearKey(){return preferences.edit().remove("key").commit();}
    void close(){HttpsURLConnection connection=active;if(connection!=null)connection.disconnect();}
    JSONObject generate(String request) throws Exception {
        if(request==null||request.length()>100000)throw new IOException("AI_REQUEST");
        JSONObject input=new JSONObject(request);
        if(input.length()!=3||!input.has("input")||!input.has("instructions")||!input.has("schema")||input.getString("input").length()>90000||input.getString("instructions").length()>3000)throw new IOException("AI_REQUEST");
        JSONObject body=new JSONObject().put("model","gpt-4.1-mini").put("store",false).put("max_output_tokens",6000)
            .put("instructions",input.getString("instructions")).put("input",input.getString("input"))
            .put("text",new JSONObject().put("format",new JSONObject().put("type","json_schema").put("name","mg30_preset").put("strict",true).put("schema",input.getJSONObject("schema"))));
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://api.openai.com/v1/responses").openConnection();active=connection;
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(60000);connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+key());
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            int status=connection.getResponseCode();if(status!=200)throw new IOException("AI_HTTP_"+status);
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;while((count=in.read(buffer))!=-1){if(out.size()+count>1000000)throw new IOException("AI_RESPONSE");out.write(buffer,0,count);}
                return new JSONObject(out.toString("UTF-8"));
            }
        }finally{active=null;connection.disconnect();}
    }
}
