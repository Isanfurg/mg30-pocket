package cl.isanfurg.mg30pocket;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.midi.*;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline local editor. MIDI output is limited to channel PC/CC, never SysEx writes. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int MAX = 9902 * 128, OPEN = 10, SAVE = 11;
    private static final boolean BANK_WRITES_ENABLED = false; // Compatibility warning on the physical unit is unresolved.
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private MidiManager midi;
    private MidiDevice device;
    private MidiInputPort sendPort;
    private MidiOutputPort receivePort;
    private volatile int generation = 0;
    private int deviceId = -1;
    private byte[] exportBytes;
    private boolean pickerOpen, destroyed;
    private final java.util.Set<Integer> armedPrograms = java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    private final ByteArrayOutputStream identityFrame = new ByteArrayOutputStream();
    private volatile String observedFirmware;
    private long nextMidiAt;
    private final MidiManager.DeviceCallback callback = new MidiManager.DeviceCallback() {
        @Override public void onDeviceAdded(MidiDeviceInfo info) { listDevices(); }
        @Override public void onDeviceRemoved(MidiDeviceInfo info) {
            if (info.getId() == deviceId) { disconnect(); emit("connection", object("connected", false, "message", "NUX desconectada.")); }
            listDevices();
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(13, 23, 30));
        getWindow().setNavigationBarColor(Color.rgb(13, 23, 30));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 23, 30));
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(), "PocketNative");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!url.startsWith(ORIGIN + "/")) { result.cancel(); return true; }
                new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Continuar", (dialog, which) -> result.confirm()).setNegativeButton("Cancelar", (dialog, which) -> result.cancel()).setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost()) || path == null || !path.startsWith("/assets/") || path.contains("..") || path.contains("\\")) return response("text/plain", new byte[0]);
                String file = path.substring(8);
                String type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".mjs") ? "text/javascript" : "application/octet-stream";
                try {
                    WebResourceResponse result = new WebResourceResponse(type, "UTF-8", getAssets().open(file));
                    result.setResponseHeaders(java.util.Collections.singletonMap("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"));
                    return result;
                } catch (IOException error) { return response("text/plain", new byte[0]); }
            }
        });
        setContentView(web);
        if (android.os.Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        midi = (MidiManager) getSystemService(MIDI_SERVICE);
        if (midi != null) midi.registerDeviceCallback(callback, main);
        web.loadUrl(ORIGIN + "/assets/www/index.html");
    }

    private static WebResourceResponse response(String mime, byte[] data) { return new WebResourceResponse(mime, "UTF-8", new ByteArrayInputStream(data)); }
    private static JSONObject object(Object... pairs) {
        JSONObject result = new JSONObject();
        try { for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i+1]); }
        catch (JSONException error) { throw new IllegalArgumentException(error); }
        return result;
    }
    private void emit(String type, Object data) {
        main.post(() -> { if (!destroyed) web.evaluateJavascript("window.pocketEvent && window.pocketEvent(" + JSONObject.quote(type) + "," + data + ")", null); });
    }
    private void error(Exception error) { emit("error", object("message", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage())); }
    private void listDevices() {
        JSONArray result = new JSONArray();
        if (midi != null) for (MidiDeviceInfo info : midi.getDevices()) {
            if (info.getType() != MidiDeviceInfo.TYPE_USB) continue;
            JSONArray ports = new JSONArray();
            for (MidiDeviceInfo.PortInfo port : info.getPorts()) ports.put(object("number", port.getPortNumber(), "type", port.getType(), "name", port.getName()));
            result.put(object("id", info.getId(), "name", info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME, "USB MIDI"), "ports", ports));
        }
        emit("devices", result);
    }
    private void disconnect() {
        generation++;
        armedPrograms.clear(); observedFirmware = null; identityFrame.reset(); nextMidiAt = 0;
        try { if (sendPort != null) sendPort.close(); } catch (IOException ignored) { /* Already detached. */ }
        try { if (receivePort != null) receivePort.close(); } catch (IOException ignored) { /* Already detached. */ }
        try { if (device != null) device.close(); } catch (IOException ignored) { /* Already detached. */ }
        sendPort = null; receivePort = null; device = null; deviceId = -1;
    }
    private byte[] limitedRead(InputStream input, int limit) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            if (source == null) throw new IOException("No se pudo abrir el archivo.");
            byte[] buffer = new byte[8192]; int count;
            while ((count = source.read(buffer)) != -1) {
                if (bytes.size() + count > limit) throw new IOException("Archivo demasiado grande.");
                bytes.write(buffer, 0, count);
            }
            return bytes.toByteArray();
        }
    }
    private byte[] patchBytes(String encoded) {
        if (encoded == null || encoded.length() > ((MAX + 2) / 3) * 4) throw new IllegalArgumentException("Archivo demasiado grande.");
        byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
        if (bytes.length != 9902 && bytes.length != MAX) throw new IllegalArgumentException("Tamaño .mg30patch no compatible.");
        return bytes;
    }
    private byte[] exportData(String name, String encoded) throws Exception {
        if(name.endsWith(".mg30patch")) return patchBytes(encoded);
        if(!name.endsWith(".mg30bank.json") || encoded.length()>1800000)throw new IllegalArgumentException("Tipo de exportación no permitido.");
        byte[] bytes=Base64.decode(encoded,Base64.NO_WRAP);
        NuxWire.validateBackup(new JSONObject(new String(bytes,StandardCharsets.UTF_8)));
        return bytes;
    }
    private void dispatchMidi(byte[] packet, JSONArray message, boolean nux) {
        int token=generation;
        long at=Math.max(android.os.SystemClock.uptimeMillis(),nextMidiAt);nextMidiAt=at+60;
        main.postAtTime(()->{
            try {
                if(token!=generation || sendPort==null)throw new IOException("La conexión MIDI cambió.");
                if(nux)NuxWire.validate(packet,armedPrograms);
                sendPort.send(packet,0,packet.length);emit("sent",message);
            } catch(Exception failure){error(failure);}
        },at);
    }

    public class Bridge {
        @JavascriptInterface public void ready() { main.post(MainActivity.this::listDevices); }
        @JavascriptInterface public void devices() { main.post(MainActivity.this::listDevices); }
        @JavascriptInterface public void openFile() { main.post(() -> {
            if (pickerOpen) return;
            try {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                pickerOpen = true; startActivityForResult(intent, OPEN);
            } catch (Exception failure) { pickerOpen = false; error(failure); }
        }); }
        @JavascriptInterface public void saveFile(String name, String encoded) {
            try {
                byte[] bytes = exportData(name, encoded);
                String safeName = name.replaceAll("[^A-Za-z0-9 ._-]", "_");
                if ((!safeName.endsWith(".mg30patch") && !safeName.endsWith(".mg30bank.json")) || safeName.length() > 100) throw new IllegalArgumentException("Nombre de archivo no válido.");
                main.post(() -> {
                    if (pickerOpen) { emit("error", object("message", "Ya hay un selector abierto.")); return; }
                    try {
                        exportBytes = bytes; pickerOpen = true;
                        startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, safeName), SAVE);
                    } catch (Exception failure) { pickerOpen = false; exportBytes = null; error(failure); }
                });
            } catch (Exception failure) { error(failure); }
        }
        @JavascriptInterface public void saveDraft(String json) {
            if (json == null || json.length() > 3500000) { emit("error", object("message", "Borrador demasiado grande.")); return; }
            io.execute(() -> {
                AtomicFile file = new AtomicFile(new File(getFilesDir(), "draft.json"));
                FileOutputStream stream = null;
                try { new JSONObject(json); stream = file.startWrite(); stream.write(json.getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); emit("draftSaved", object("ok", true)); }
                catch (Exception failure) { if (stream != null) file.failWrite(stream); error(failure); }
            });
        }
        @JavascriptInterface public void loadDraft() { io.execute(() -> {
            AtomicFile file = new AtomicFile(new File(getFilesDir(), "draft.json"));
            try { if (file.getBaseFile().exists()) emit("draft", new JSONObject(new String(limitedRead(file.openRead(), 3500000), StandardCharsets.UTF_8))); }
            catch (Exception failure) { error(failure); }
        }); }
        @JavascriptInterface public String storeNuxBackup(String json) {
            try {
                if(json==null||json.length()>1267456)throw new IllegalArgumentException("Respaldo demasiado grande.");
                NuxWire.validateBackup(new JSONObject(json));
                String id="backup-"+System.currentTimeMillis()+".json";
                AtomicFile file=new AtomicFile(new File(getFilesDir(),id));FileOutputStream stream=file.startWrite();
                try{stream.write(json.getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);}catch(Exception failure){file.failWrite(stream);throw failure;}
                getPreferences(MODE_PRIVATE).edit().putString("lastNuxBackup",id).commit();
                return id;
            } catch(Exception failure){error(failure);return "";}
        }
        @JavascriptInterface public boolean armNuxTransfer(String id) {
            try {
                if(!BANK_WRITES_ENABLED)throw new IllegalStateException("Carga guardada pausada por el aviso de compatibilidad de firmware.");
                if(!id.matches("backup-[0-9]+\\.json"))throw new IllegalArgumentException("ID de respaldo no válido.");
                byte[] bytes=limitedRead(new AtomicFile(new File(getFilesDir(),id)).openRead(),1267456);
                JSONObject bank=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                java.util.Set<Integer> slots=NuxWire.validateBackup(bank);
                if(observedFirmware==null||!observedFirmware.equals(bank.getString("firmware")))throw new IllegalArgumentException("Identifica la NUX y su firmware antes de escribir.");
                int token=generation;armedPrograms.clear();armedPrograms.addAll(slots);
                if(token!=generation||observedFirmware==null){armedPrograms.clear();throw new IOException("La NUX se desconectó al preparar la carga.");}
                return true;
            } catch(Exception failure){error(failure);return false;}
        }
        @JavascriptInterface public void endNuxTransfer(){main.post(armedPrograms::clear);}
        @JavascriptInterface public void lastNuxBackup(){io.execute(()->{
            try{
                String id=getPreferences(MODE_PRIVATE).getString("lastNuxBackup","");
                if(!id.matches("backup-[0-9]+\\.json"))throw new IOException("Todavía no hay un respaldo NUX.");
                byte[] bytes=limitedRead(new AtomicFile(new File(getFilesDir(),id)).openRead(),1267456);
                emit("nuxBackup",object("bank",new JSONObject(new String(bytes,StandardCharsets.UTF_8))));
            }catch(Exception failure){error(failure);}
        });}
        @JavascriptInterface public void keepScreen(boolean enabled){main.post(()->{if(enabled)getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});}
        @JavascriptInterface public void sendNux(String json){
            try{
                JSONArray data=new JSONArray(json);if(data.length()>222)throw new IllegalArgumentException("Mensaje NUX demasiado largo.");
                byte[] bytes=new byte[data.length()];
                for(int i=0;i<bytes.length;i++){Object n=data.get(i);if(!(n instanceof Integer)||(Integer)n<0||(Integer)n>255)throw new IllegalArgumentException("Byte NUX no válido.");bytes[i]=(byte)(int)(Integer)n;}
                main.post(()->dispatchMidi(bytes,data,true));
            }catch(Exception failure){error(failure);}
        }
        @JavascriptInterface public void disconnectMidi() { main.post(() -> { disconnect(); emit("connection", object("connected", false, "message", "MIDI desconectado.")); }); }
        @JavascriptInterface public void connectMidi(int id, int input, int output) { main.post(() -> {
            if (midi == null) { emit("error", object("message", "Este teléfono no ofrece MIDI.")); return; }
            MidiDeviceInfo selected = null;
            for (MidiDeviceInfo info : midi.getDevices()) if (info.getId() == id && info.getType() == MidiDeviceInfo.TYPE_USB) selected = info;
            if (selected == null) { emit("error", object("message", "Dispositivo USB MIDI no encontrado.")); return; }
            boolean inputOK = input == -1, outputOK = output == -1;
            for (MidiDeviceInfo.PortInfo port : selected.getPorts()) {
                if (port.getType() == MidiDeviceInfo.PortInfo.TYPE_INPUT && port.getPortNumber() == input) inputOK = true;
                if (port.getType() == MidiDeviceInfo.PortInfo.TYPE_OUTPUT && port.getPortNumber() == output) outputOK = true;
            }
            if (!inputOK || !outputOK || (input == -1 && output == -1)) { emit("error", object("message", "Elige al menos un puerto válido.")); return; }
            disconnect(); int token = generation; deviceId = id;
            emit("connection", object("connected", false, "message", "Abriendo USB MIDI…"));
            midi.openDevice(selected, opened -> {
                if (token != generation || destroyed) { try { if (opened != null) opened.close(); } catch (IOException ignored) { } return; }
                if (opened == null) { disconnect(); emit("error", object("message", "No se pudo abrir MIDI. Cierra otras apps MIDI.")); return; }
                try {
                    device = opened;
                    if (input >= 0) { sendPort = opened.openInputPort(input); if (sendPort == null) throw new IOException("Puerto de envío ocupado."); }
                    if (output >= 0) {
                        receivePort = opened.openOutputPort(output);
                        if (receivePort == null) throw new IOException("Puerto de recepción no disponible.");
                        receivePort.connect(new MidiReceiver() {
                            @Override public void onSend(byte[] data, int offset, int count, long timestamp) {
                                // Ignore callbacks queued from a previously closed device.
                                byte[] copy = Arrays.copyOfRange(data, offset, offset + count);
                                main.post(() -> {
                                    if (token != generation || count > 4096) return;
                                    for(byte value:copy){
                                        int unsigned=value&255;
                                        if(unsigned==240)identityFrame.reset();
                                        if(unsigned<248 && identityFrame.size()<4096)identityFrame.write(unsigned);
                                        if(unsigned==247){String firmware=NuxWire.identity(identityFrame.toByteArray());if(firmware!=null)observedFirmware=firmware;identityFrame.reset();}
                                    }
                                    JSONArray bytes = new JSONArray(); for (byte value : copy) bytes.put(value & 255);
                                    emit("midi", bytes);
                                });
                            }
                        });
                    }
                    emit("connection", object("connected", true, "send", sendPort != null, "receive", receivePort != null, "message", "USB MIDI conectado. Cambia de preset en la NUX para identificarlo."));
                } catch (Exception failure) { disconnect(); emit("connection", object("connected", false, "message", "Conexión MIDI cerrada.")); error(failure); }
            }, main);
        }); }
        @JavascriptInterface public void sendMidi(String json) {
            try {
                JSONArray message = new JSONArray(json);
                int length = message.length();
                if (length != 2 && length != 3) throw new IllegalArgumentException("Solo Program Change y CC.");
                byte[] packet = new byte[length];
                for (int i = 0; i < length; i++) {
                    Object value = message.get(i);
                    if (!(value instanceof Integer)) throw new IllegalArgumentException("MIDI debe contener enteros.");
                    int number = (Integer) value;
                    if (number < (i == 0 ? 128 : 0) || number > (i == 0 ? 239 : 127)) throw new IllegalArgumentException("Byte MIDI fuera de rango.");
                    packet[i] = (byte) number;
                }
                int type = packet[0] & 240;
                if (!((type == 192 && length == 2) || (type == 176 && length == 3 && (packet[1] & 255) <= 119))) throw new IllegalArgumentException("No se permiten SysEx ni Channel Mode.");
                main.post(() -> dispatchMidi(packet, message, false));
            } catch (Exception failure) { error(failure); }
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != OPEN && request != SAVE) return;
        pickerOpen = false;
        byte[] pending = exportBytes; exportBytes = null;
        if (result != RESULT_OK || data == null || data.getData() == null) { emit("fileCancelled", object("ok", true)); return; }
        Uri uri = data.getData();
        io.execute(() -> {
            try {
                if (request == OPEN) {
                    byte[] bytes = limitedRead(getContentResolver().openInputStream(uri), MAX);
                    if ((bytes.length != 9902 && bytes.length != MAX) || (bytes.length>1 && bytes[0]=='{' && bytes[1]!=0)) {
                        JSONObject bank;
                        try{bank=new JSONObject(new String(bytes,StandardCharsets.UTF_8));NuxWire.validateBackup(bank);}catch(Exception failure){throw new IOException("Archivo .mg30patch o banco MIDI no compatible.");}
                        emit("nuxBank",object("bank",bank));return;
                    }
                    String name = "Preset importado";
                    try (android.database.Cursor cursor = getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                    }
                    emit("file", object("name", name, "base64", Base64.encodeToString(bytes, Base64.NO_WRAP)));
                } else {
                    if (pending == null) throw new IOException("La exportación se perdió al recrear la app. Vuelve a exportar.");
                    try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                        if (output == null) throw new IOException("No se pudo escribir el archivo.");
                        output.write(pending);
                    }
                    emit("saved", object("ok", true));
                }
            } catch (Exception failure) { error(failure); }
        });
    }
    private void handleBack() { web.evaluateJavascript("window.pocketBack && window.pocketBack()", null); }
    // API 33+ uses the registered predictive-back callback; this covers Android 8–12.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onResume(){super.onResume();if(web!=null)emit("resume",object("ok",true));}
    @Override protected void onStop(){
        super.onStop();
        if(!armedPrograms.isEmpty()){armedPrograms.clear();emit("error",object("message","Carga detenida al ocultar la app. El respaldo previo se conserva."));}
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (midi != null) midi.unregisterDeviceCallback(callback);
        disconnect(); io.shutdown(); web.removeJavascriptInterface("PocketNative"); web.destroy();
        super.onDestroy();
    }
}
