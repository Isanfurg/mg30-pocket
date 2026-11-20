package cl.isanfurg.mg30pocket;

import android.content.Context;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Test-only wire peer. No USB ports are opened and no hardware is modified. */
public final class FakeNuxBridge {
    private final WebView web;
    private final Context target;
    private final int[] seed;
    private final Map<Integer,int[][]> stored=new HashMap<>();
    private int[][] current;
    private int program=24,scene=0;
    private Set<Integer> armed=new HashSet<>();
    public int writes=0,commits=0,channelMessages=0;
    private boolean fakeAiKey;
    public FakeNuxBridge(WebView web,Context tests,Context target) throws Exception {
        this.web=web;this.target=target;
        try(InputStream input=tests.getAssets().open("preset_07A.json");ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] buffer=new byte[2048];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);
            seed=ints(new JSONObject(output.toString("UTF-8")).getJSONArray("part0"));
        }
        current=copy(record(24));
        guardChecks();
    }
    static int[] ints(JSONArray array)throws JSONException{int[] result=new int[array.length()];for(int i=0;i<result.length;i++)result[i]=array.getInt(i);return result;}
    static JSONArray json(int[] data){JSONArray array=new JSONArray();for(int value:data)array.put(value);return array;}
    static int[][] copy(int[][] data){return Arrays.stream(data).map(int[]::clone).toArray(int[][]::new);}
    static int[] decode(int[] body){int[] raw=new int[142];for(int i=0;i<71;i++){int at=7+i*3,value=body[at]<<14|body[at+1]<<7|body[at+2];raw[i*2]=(value>>8)&255;raw[i*2+1]=value&255;}return raw;}
    static void encode(int[] raw,int[] body){for(int i=0;i<71;i++){int at=7+i*3,value=raw[i*2]<<8|raw[i*2+1];body[at]=(body[at]&124)|(value>>14);body[at+1]=(value>>7)&127;body[at+2]=value&127;}}
    private int[][] record(int p){return stored.computeIfAbsent(p,key->{int[][] result=new int[3][];for(int j=0;j<3;j++){result[j]=seed.clone();result[j][5]=p;result[j][6]=j;int[] raw=decode(result[j]);raw[7]=2;raw[61]=4;raw[62]=22;raw[63]=31;raw[65]=212;encode(raw,result[j]);}return result;});}
    private void emit(String type,Object value){web.post(()->web.evaluateJavascript("window.pocketEvent("+JSONObject.quote(type)+","+value+")",null));}
    private void reply(int[] body){int[] full=new int[body.length+2];full[0]=240;System.arraycopy(body,0,full,1,body.length);full[full.length-1]=247;emit("midi",json(full));}
    private void fail(Exception e){try{emit("error",new JSONObject().put("message",e.toString()));}catch(JSONException ignored){}}
    @JavascriptInterface public void ready(){try{emit("connection",new JSONObject().put("connected",true).put("send",true).put("receive",true).put("message","SIMULADOR QA · sin hardware"));}catch(Exception e){fail(e);}}
    @JavascriptInterface public void devices(){}
    @JavascriptInterface public boolean hasAiKey(){return fakeAiKey;}
    @JavascriptInterface public boolean saveAiKey(String key){fakeAiKey=true;return true;}
    @JavascriptInterface public boolean clearAiKey(){fakeAiKey=false;return true;}
    @JavascriptInterface public void generateAi(String requestId,String request){try{
        JSONArray scenes=new JSONArray();for(int i=0;i<3;i++){
            JSONArray parameters=new JSONArray().put(new JSONObject().put("name","GAIN").put("value",25+i*10));
            JSONArray blocks=new JSONArray().put(new JSONObject().put("block","AMP").put("modelId",9).put("enabled",true).put("parameters",parameters));
            scenes.put(new JSONObject().put("scene","S"+(i+1)).put("bpm",120).put("dottedEighth",true).put("blocks",blocks));
        }
        JSONObject proposal=new JSONObject().put("name","AI QA").put("summary","Simulated AI fixture. No network.").put("scenes",scenes);
        JSONObject response=new JSONObject().put("status","completed").put("output",new JSONArray().put(new JSONObject().put("content",new JSONArray().put(new JSONObject().put("type","output_text").put("text",proposal.toString())))));
        emit("aiResult",new JSONObject().put("requestId",requestId).put("response",response));
    }catch(Exception e){fail(e);}}
    @JavascriptInterface public void loadDraft(){}
    @JavascriptInterface public void saveDraft(String json){}
    @JavascriptInterface public void keepScreen(boolean enabled){}
    @JavascriptInterface public void endNuxTransfer(){armed.clear();}
    @JavascriptInterface public String storeNuxBackup(String data){
        try{NuxWire.validateBackup(new JSONObject(data));try(FileOutputStream out=new FileOutputStream(new File(target.getFilesDir(),"qa-bank-backup.json"))){out.write(data.getBytes(StandardCharsets.UTF_8));}return "qa-backup";}catch(Exception e){fail(e);return "";}
    }
    @JavascriptInterface public boolean armNuxTransfer(String id){try{if(!"qa-backup".equals(id)||!new File(target.getFilesDir(),"qa-bank-backup.json").exists())return false;try(FileInputStream in=new FileInputStream(new File(target.getFilesDir(),"qa-bank-backup.json"));ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[2048];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);armed=NuxWire.validateBackup(new JSONObject(out.toString("UTF-8")));}return true;}catch(Exception e){fail(e);return false;}}
    @JavascriptInterface public void sendMidi(String data){try{
        int[] b=ints(new JSONArray(data));channelMessages++;
        if((b[0]&240)==192){program=b[1];current=copy(record(program));scene=0;}
        if((b[0]&240)==176){int controller=b[1],value=b[2];if(controller==80)scene=value;else{int[] raw=decode(current[scene]);if(controller<=10)raw[controller]=value;else if(controller>=54&&controller<=61)raw[62+controller-54]=value;encode(raw,current[scene]);}}
        emit("sent",json(b));
    }catch(Exception e){fail(e);}}
    @JavascriptInterface public void sendNux(String data){try{
        int[] full=ints(new JSONArray(data));byte[] packet=new byte[full.length];for(int i=0;i<full.length;i++)packet[i]=(byte)full[i];NuxWire.validate(packet,armed);
        int[] b=Arrays.copyOfRange(full,1,full.length-1);
        if(full.length==5){byte[] text="v6.0.5\0 MG-30\0".getBytes(StandardCharsets.US_ASCII);int[] response=new int[3+text.length];response[0]=67;response[1]=88;response[2]=16;for(int i=0;i<text.length;i++)response[i+3]=text[i];reply(response);}
        else if(b[3]==21)reply(new int[]{67,88,112,21,2,program,0,0,scene,0,0,0,0});
        else if(b[4]==0){int[] response=(b[3]==12?current[b[6]]:record(b[5])[b[6]]).clone();response[3]=b[3];reply(response);}
        else if(b[3]==11){writes++;record(b[5])[b[6]]=b.clone();record(b[5])[b[6]][4]=2;reply(new int[]{67,88,112,11,3,b[5],b[6]});}
        else if(b[3]==7){commits++;if(b[5]==program)current=copy(record(program));reply(new int[]{67,88,112,7,3,b[5],b[5]});}
    }catch(Exception e){fail(e);}}
    private void guardChecks(){
        byte[] b=new byte[222];b[0]=(byte)240;b[1]=67;b[2]=88;b[3]=112;b[4]=11;b[5]=1;b[6]=24;b[221]=(byte)247;
        try{NuxWire.validate(b,Collections.emptySet());throw new AssertionError("Native guard allowed an unarmed write");}catch(IllegalArgumentException expected){}
        NuxWire.validate(b,Collections.singleton(24));
        b[4]=99;try{NuxWire.validate(b,Collections.singleton(24));throw new AssertionError("Native guard allowed an unknown command");}catch(IllegalArgumentException expected){}
    }
}
