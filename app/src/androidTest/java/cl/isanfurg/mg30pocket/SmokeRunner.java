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
            check("window.PocketNative.armNuxTransfer('backup-0.json')", "false");
            evaluate("localStorage.removeItem('pads.v1')");
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
            evaluate("document.getElementById('stageModel').value='1';document.getElementById('stageModelApply').click()");
            until("document.getElementById('stageEditorState').textContent.startsWith('Modelo confirmado') && !document.getElementById('stageSync').disabled","true");
            check("document.getElementById('stageModel').value==='1'","true");
            check(delay+".querySelector('.stage-toggle').textContent==='Encender'","true");
            screenshot("qa-model-selector.png");
            evaluate("document.getElementById('stageModel').value='2';document.getElementById('stageModelApply').click()");
            until("document.getElementById('stageEditorState').textContent.startsWith('Modelo confirmado') && !document.getElementById('stageSync').disabled","true");
            evaluate("document.getElementById('stageEditorClose').click()");
            check("document.getElementById('stageSave').disabled","true");
            evaluate("document.getElementById('padsTab').click()");
            check("document.querySelectorAll('nav.bottom button').length","2");
            check("document.querySelectorAll('#padGrid button').length","8");
            int beforePads=peer.channelMessages;
            String down="(()=>{const b=document.querySelector('[data-pad=\"4\"]'),r=b.getBoundingClientRect();window.qaPad=b;window.qaPoint={clientX:r.x+20,clientY:r.y+20,pointerId:50,button:0,bubbles:true};b.dispatchEvent(new PointerEvent('pointerdown',window.qaPoint));})()";
            evaluate(down);
            until("document.getElementById('padConfig').open","true");
            evaluate("window.qaPad.dispatchEvent(new PointerEvent('pointerup',window.qaPoint))");
            if(peer.channelMessages!=beforePads)throw new AssertionError("Long press executed MIDI");
            evaluate("document.getElementById('padLabel').value='Delay largo';document.getElementById('padAction').value='on';document.getElementById('padBlock').value='DLY';document.getElementById('padSave').click()");
            check("JSON.parse(localStorage.getItem('pads.v1'))[4].label","\"Delay largo\"");
            if(peer.channelMessages!=beforePads)throw new AssertionError("Saving pad configuration executed MIDI");
            Thread.sleep(350);evaluate("document.querySelector('[data-pad=\"4\"]').click()");
            until("document.querySelector('[data-pad=\"4\"]').classList.contains('active') && !document.getElementById('padsSync').disabled","true");
            if(peer.channelMessages!=beforePads+1)throw new AssertionError("Tap executed more than once");
            evaluate("(()=>{const b=document.querySelector('[data-pad=\"0\"]'),r=b.getBoundingClientRect(),p={clientX:r.x+20,clientY:r.y+20,pointerId:51,button:0,bubbles:true};b.dispatchEvent(new PointerEvent('pointerdown',p));p.clientY+=40;b.dispatchEvent(new PointerEvent('pointermove',p));b.dispatchEvent(new PointerEvent('pointerup',p));})()");
            Thread.sleep(300);if(peer.channelMessages!=beforePads+1)throw new AssertionError("Scrolling executed a pad");
            if(peer.writes!=0||peer.commits!=0)throw new AssertionError("Persistent write during paused compatibility state");
            runOnMainSync(()->activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));Thread.sleep(1000);
            check("document.documentElement.scrollWidth<=window.innerWidth","true");
            screenshot("qa-pads-tablet.png");
            evaluate("document.getElementById('stageTab').click()");
            until("!document.getElementById('stageView').hidden","true");Thread.sleep(350);
            check("document.documentElement.scrollWidth<=window.innerWidth","true");
            screenshot("qa-stage-tablet.png");
            evaluate("document.getElementById('padsTab').click()");
            Thread.sleep(350);
            Bitmap icon=Bitmap.createBitmap(1080,1080,Bitmap.Config.ARGB_8888);
            android.graphics.drawable.Drawable art=getTargetContext().getDrawable(cl.isanfurg.mg30pocket.R.drawable.ic_launcher);
            art.setBounds(0,0,1080,1080);art.draw(new android.graphics.Canvas(icon));
            try(FileOutputStream output=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"icon.png"))){icon.compress(Bitmap.CompressFormat.PNG,100,output);}finally{icon.recycle();}
            runOnMainSync(()->{android.view.ViewGroup.LayoutParams layout=web.getLayoutParams();layout.width=(int)(360*getTargetContext().getResources().getDisplayMetrics().density);web.setLayoutParams(layout);});Thread.sleep(500);
            check("document.documentElement.scrollWidth<=window.innerWidth","true");
            check("document.querySelector('#padGrid button').getBoundingClientRect().height>=100","true");
            screenshot("qa-pads-split.png");
            result.putString("stream","PASS: two tabs, native editor/draft, live controls with simulated NUX, 8 pads, long press without MIDI, persisted assignment, single tap exactly once, scroll cancellation, native bank-write quarantine, wide/narrow layouts. No hardware used.\n");
            finish(Activity.RESULT_OK,result);
        } catch (Throwable failure) {
            result.putString("stream","FAIL: " + failure + "\n"); finish(Activity.RESULT_CANCELED,result);
        }
    }
}
