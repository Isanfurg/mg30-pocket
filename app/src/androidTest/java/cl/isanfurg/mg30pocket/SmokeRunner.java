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
    private void screenshot(String name) throws Exception {
        try (FileOutputStream output = new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name))) {
            Bitmap image = getUiAutomation().takeScreenshot();
            if (image == null) throw new AssertionError("Screenshot unavailable");
            image.compress(Bitmap.CompressFormat.PNG,100,output); image.recycle();
        }
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Activity activity = startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            runOnMainSync(() -> web = (WebView)((ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0));
            long deadline = System.currentTimeMillis()+60000;
            while (!"true".equals(evaluate("typeof window.pocketEvent === 'function'"))) {
                if (System.currentTimeMillis()>deadline) throw new AssertionError("App modules did not load");
                Thread.sleep(150);
            }
            evaluate("document.getElementById('demo').click()");
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
            result.putString("stream","PASS: WebView modules, 12 blocks, scenes, editing, native draft, MIDI stream, channel filtering, disabled sends, mobile layout.\n");
            finish(Activity.RESULT_OK,result);
        } catch (Throwable failure) {
            result.putString("stream","FAIL: " + failure + "\n"); finish(Activity.RESULT_CANCELED,result);
        }
    }
}
