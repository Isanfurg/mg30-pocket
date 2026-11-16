package cl.isanfurg.mg30pocket;

import android.app.*;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Dependency-free instrumented smoke check, synthetic fixture only. */
public class SmokeRunner extends Instrumentation {
    private WebView web;
    private Activity targetActivity;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private String evaluate(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); String[] result = new String[1];
        runOnMainSync(() -> web.evaluateJavascript(script, value -> { result[0] = value; done.countDown(); }));
        if (!done.await(20,TimeUnit.SECONDS)) throw new AssertionError("WebView evaluation timed out: " + script);
        return result[0];
    }
    private void check(String script, String expected) throws Exception {
        String value = evaluate(script); if (!expected.equals(value)) throw new AssertionError(script + " expected " + expected + " got " + value);
    }
    private void until(String script,String expected) throws Exception {
        long deadline=System.currentTimeMillis()+30000;
        while(!expected.equals(evaluate(script))){if(System.currentTimeMillis()>deadline)throw new AssertionError("Timed out: "+script+" got "+evaluate(script));Thread.sleep(150);}
    }
    private void screenshot(String name) throws Exception {
        CountDownLatch copied=new CountDownLatch(1);int[] status=new int[1];Bitmap[] capture=new Bitmap[1];
        runOnMainSync(()->{
            int[] location=new int[2];web.getLocationInWindow(location);
            capture[0]=Bitmap.createBitmap(web.getWidth(),web.getHeight(),Bitmap.Config.ARGB_8888);
            android.graphics.Rect bounds=new android.graphics.Rect(location[0],location[1],location[0]+web.getWidth(),location[1]+web.getHeight());
            // Capture the app window only, not unrelated emulator System UI dialogs.
            android.view.PixelCopy.request(targetActivity.getWindow(),bounds,capture[0],result->{status[0]=result;copied.countDown();},new android.os.Handler(android.os.Looper.getMainLooper()));
        });
        if(!copied.await(10,TimeUnit.SECONDS)||status[0]!=android.view.PixelCopy.SUCCESS)throw new AssertionError("App window capture failed");
        try (FileOutputStream output = new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name))) {
            Bitmap image = capture[0];
            image.compress(Bitmap.CompressFormat.PNG,100,output); image.recycle();
        }
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Activity activity = startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            targetActivity=activity;
            runOnMainSync(() -> web = (WebView)((ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0));
            long deadline = System.currentTimeMillis()+60000;
            while (!"true".equals(evaluate("typeof window.pocketEvent === 'function'"))) {
                if (System.currentTimeMillis()>deadline) throw new AssertionError("App modules did not load");
                Thread.sleep(150);
            }
            evaluate("window.confirm=()=>true;document.getElementById('channel').value=1;document.getElementById('sceneCC').value='';document.getElementById('saveMapping').click();document.getElementById('editorTab').click();document.getElementById('demo').click()");
            check("document.getElementById('workspace').hidden", "false");
            check("document.querySelectorAll('.block-card').length", "12");
            check("document.querySelectorAll('#preset option').length", "1");
            evaluate("document.querySelector('[data-scene=S3]').click()");
            check("document.querySelector('[data-scene=S3]').classList.contains('active')", "true");
            evaluate("(()=>{const r=document.querySelector('#blockEditor input[type=range]');r.value=51;r.dispatchEvent(new Event('input'));})()");
            check("document.querySelector('#blockEditor output').value", "\"51\"");
            check("document.documentElement.scrollWidth <= window.innerWidth", "true");
            Thread.sleep(600); screenshot("qa-editor.png");
            evaluate("document.getElementById('midiTab').click()");
            evaluate("window.pocketEvent('midi',[192]);window.pocketEvent('midi',[0,176,80]);window.pocketEvent('midi',[2])");
            check("document.getElementById('livePreset').textContent", "\"01A\"");
            check("document.getElementById('liveScene').textContent.startsWith('S3')", "true");
            check("document.getElementById('sendPreset').disabled", "true");
            evaluate("document.getElementById('channel').value=2;document.getElementById('sceneCC').value=80;document.getElementById('saveMapping').click()");
            check("JSON.parse(localStorage.getItem('mapping')).channel", "2");
            evaluate("window.pocketEvent('midi',[192,5])");
            check("document.getElementById('livePreset').textContent", "\"—\"");
            evaluate("window.pocketEvent('midi',[193,5])");
            check("document.getElementById('livePreset').textContent", "\"02B\"");
            check("document.documentElement.scrollWidth <= window.innerWidth", "true");
            Thread.sleep(600); screenshot("qa-midi.png");
            // Wait for the actual Android atomic-file bridge, not just browser localStorage.
            Thread.sleep(800);
            if (!new File(getTargetContext().getFilesDir(),"draft.json").exists()) throw new AssertionError("Native draft not saved");
            FakeNuxBridge peer=new FakeNuxBridge(web,getContext(),getTargetContext());
            runOnMainSync(()->{web.removeJavascriptInterface("PocketNative");web.addJavascriptInterface(peer,"PocketNative");web.reload();});
            until("typeof window.pocketEvent==='function' && !document.getElementById('stageView').hidden","true");
            evaluate("document.getElementById('stageSync').click()");
            until("document.getElementById('stagePreset').textContent.startsWith('07A')","true");
            evaluate("(()=>{const p=document.getElementById('stageProfile');p.checked=true;p.dispatchEvent(new Event('change'));})()");
            check("[...document.querySelectorAll('#stagePedals strong')].some(x=>x.textContent==='Delay')","true");
            evaluate("document.querySelectorAll('#stageScenes button')[2].click()");
            until("document.querySelectorAll('#stageScenes button')[2].classList.contains('active') && !document.getElementById('stageSync').disabled","true");
            String delay="[...document.querySelectorAll('.stage-pedal')].find(x=>x.querySelector('strong').textContent==='Delay')";
            evaluate(delay+".querySelector('.stage-toggle').click()");
            until(delay+".querySelector('.stage-toggle').textContent==='Encender' && !document.getElementById('stageSync').disabled","true");
            evaluate(delay+".querySelector('.stage-open').click()");
            evaluate("(()=>{const r=document.querySelector('#stageParameters input');r.value=58;r.dispatchEvent(new Event('input'));r.dispatchEvent(new Event('change'));})()");
            until("document.getElementById('stageEditorState').textContent.startsWith('Ajuste confirmado')","true");
            evaluate("document.getElementById('stageEditorClose').click()");
            evaluate("document.getElementById('stageSave').click()");
            until("document.getElementById('transferDialog').open","true");
            if(peer.writes!=0)throw new AssertionError("Write before explicit review confirmation");
            evaluate("document.getElementById('transferAssets').checked=true;document.getElementById('transferConfirm').click()");
            until("document.getElementById('stageTransfer').textContent.startsWith('Carga terminada')","true");
            if(peer.writes!=3||peer.commits!=1)throw new AssertionError("Expected three parts and one commit");
            runOnMainSync(()->activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));Thread.sleep(1000);
            check("document.documentElement.scrollWidth<=window.innerWidth","true");
            screenshot("qa-stage-tablet.png");
            runOnMainSync(()->{android.view.ViewGroup.LayoutParams layout=web.getLayoutParams();layout.width=(int)(360*getTargetContext().getResources().getDisplayMetrics().density);web.setLayoutParams(layout);});Thread.sleep(500);
            check("document.documentElement.scrollWidth<=window.innerWidth","true");
            check("document.querySelector('#stageScenes button').getBoundingClientRect().height>=64","true");
            screenshot("qa-stage-split.png");
            result.putString("stream","PASS: native editor/draft, MIDI stream, stage read, scene, model-preserving Delay toggle, verified live slider, pre-confirm write guard, backup, three ACKs/commit/readback, responsive tablet/narrow layouts. Hardware simulated.\n");
            finish(Activity.RESULT_OK,result);
        } catch (Throwable failure) {
            result.putString("stream","FAIL: " + failure + "\n"); finish(Activity.RESULT_CANCELED,result);
        }
    }
}
