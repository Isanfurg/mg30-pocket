# MG30 Pocket

Editor Android gratuito y offline para archivos de presets NUX MG-30, con tres escenas, pedales visuales y control USB MIDI configurable. Proyecto independiente, sin afiliación con NUX.

**Estado: 0.1.0 experimental.** Edita archivos locales y puede emitir/recibir MIDI estándar. No es un reemplazo completo de QuickTone: no descarga el banco de la pedalera ni le transmite presets o parámetros por SysEx. El estado de los parámetros mostrado es el del archivo importado, no una lectura de la NUX.

## Qué puedes hacer

| Función | Estado |
|---|---|
| Importar un `.mg30patch` o banco de 128 presets | Implementado, formato observado de 9902 bytes por registro |
| Ver S1/S2/S3 y la cadena con dibujos originales de pedales/amplis | Implementado |
| Editar modelos y parámetros mapeados, bypass, nombre y tempo | Implementado en el archivo local |
| Copiar escenas y volver al preset original importado | Implementado |
| Exportar preset o banco conservando el recurso IR/NAM | Implementado; selector nativo de Android |
| Recuperar el borrador al volver a abrir | Implementado; archivo atómico interno |
| Seguir preset y escena desde mensajes USB MIDI | Implementado; requiere que la NUX los emita |
| Enviar Program Change y escena por CC configurado | Implementado; ejecución física pendiente de comprobar en teléfono + NUX |
| Activar/desactivar efectos con CC configurables | Implementado como órdenes MIDI; requiere asignaciones coincidentes en QuickTone |
| Descargar/subir bancos directamente a la NUX | No implementado |
| Leer todos los parámetros en tiempo real, cambiar modelos en la NUX | No implementado |
| Audio, medición, auto balance, Bluetooth, dos drives/delays por sustitución | No implementado |

## Instalar y probar

Android 8.0 o posterior, Android System WebView actualizado. Para USB MIDI: teléfono con USB host/OTG y MIDI de Android, cable **de datos**, adaptador OTG y MG-30 encendida. La app no solicita acceso a internet, micrófono ni toda la memoria del teléfono.

1. Instala la APK de prueba que generes o descargues de los artifacts de GitHub Actions. Las APK `debug` son para pruebas; no tienen una firma estable de distribución. Si firmas posteriores no coinciden, conserva tus exportaciones antes de desinstalar.
2. Exporta una copia de tu banco con QuickTone y transfiérela al teléfono.
3. En **Presets → Importar**, elige el archivo. La app conserva su original y guarda un borrador separado. Importar otro documento pide confirmar si hay cambios; el borrador actual se reemplaza después.
4. Elige preset, escena y pedal; edita y **Exportar preset/banco**. La exportación no carga nada en la pedalera. Para tocar esos cambios, importa el archivo exportado desde QuickTone, comprueba y guarda.
5. En **MIDI en vivo**, selecciona dispositivo USB y puertos. Enviar corresponde al input del dispositivo; recibir, a su output. Conecta solo la MG-30 que quieras controlar, eligiendo sus puertos explícitamente.
6. Cambia de preset/escena **desde la NUX**. La app identifica los mensajes y puede seleccionar el preset del archivo si está importado. Al conectar no conoce el preset inicial hasta recibirlo.
7. Configura canal y CC iguales a los de tu QuickTone. Los efectos y el envío de escena empiezan **sin asignar**; no se adivinan números. Pulsa **Enviar ON/OFF** o **Activar preset/escena** para emitir una orden. No se envía nada al importar, editar sliders o guardar un mapeo.

**Archivo y pedalera son estados distintos.** Modificar un slider no cambia el hardware. Recibir un PC/CC no demuestra que el archivo coincida con el sonido cargado. Un mensaje TX significa enviado, no ejecutado ni guardado. Solo se marca un ON/OFF como recibido cuando entra el CC y valor mapeado; es feedback MIDI, no una consulta física independiente. No existe guardado remoto persistente en esta versión.

## Compatibilidad y protocolo

- Formato portado del editor MIT [QuickTone Preset Meter](https://github.com/Isanfurg/quicktone-preset-meter). Layout observado en MG-30 firmware 6.0.5: 9902 bytes, tres escenas de 142 bytes desde offset 4, recurso opaco desde 430. Otras versiones pueden diferir y requieren fixtures nuevos. No se detecta automáticamente el firmware a partir del tamaño del archivo.
- Canal 1 observado: `C0 pp` para programa 0–127; `B0 50 ss` para escena 0–2. `0x50` significa **80 decimal**. El seguimiento pasivo usa ese CC si no configuras otro. El envío de escena exige asignarlo explícitamente. Los CC son personalizables; no hay defaults supuestos para bypass.
- Parser de flujo: admite mensajes divididos entre callbacks, running status y bytes de reloj intercalados. Ignora SysEx y mensajes de sistema. El bridge nativo solo envía PC y CC 0–119 con datos de 7 bits: no hay consola SysEx ni mensajes Channel Mode.
- Una desconexión cierra puertos y borra el estado recibido. Volver a conectar es explícito. Las ediciones del archivo se conservan.
- IR y NAM son recursos privados opacos. Se preservan byte por byte al editar/exportar. No se reemplazan ni se interpretan sus controles especiales. Los modelos desconocidos permanecen sin mapear. La app no incluye presets de usuario, IR comerciales, WAV ni logos de terceros.
- Una tabla CC incorrecta puede controlar otro parámetro. Comprueba primero con la consola baja y una copia del banco. La app no normaliza ni garantiza niveles de audio.

## Compilar

Requisitos: JDK 17, Android SDK 36 con Build Tools, Node.js 22+ para pruebas. Gradle 8.13 y Android Gradle Plugin 8.13.1 están fijados; el wrapper verifica SHA-256 de su distribución. No hay dependencias npm ni dependencias Android de runtime externas.

```sh
# Android SDK: define ANDROID_HOME o configura local.properties (no se versiona).
npm test
./gradlew assembleDebug lintDebug --console plain
# Windows: .\gradlew.bat assembleDebug lintDebug --console plain
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.

GitHub Actions ejecuta las pruebas JS, compila, pasa lint y adjunta la APK debug. Los artifacts de acciones son builds de prueba, no releases con firma de producción.

Vista previa del editor en PC (sin USB MIDI nativo):

```sh
npm run preview
# http://127.0.0.1:8766
```

## Pruebas

Verificado localmente: **16 pruebas Node aprobadas**, `assembleDebug` y `lintDebug` sin errores, y smoke instrumentado aprobado en emulador Android 16/API 36. Revisi?n visual de las dos pantallas realizada. Hardware f?sico, selector SAF y roundtrip con QuickTone pendientes.

`npm test` verifica importación, bancos de 128, offsets, ediciones exactas, preservación IR/NAM, restauración de borradores, entradas malformadas, conflictos de CC, running status y fragmentación MIDI. Fixtures sintéticos: no se publican los sonidos del usuario.

Prueba instrumentada en emulador o teléfono de pruebas:

```sh
./gradlew assembleDebug assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w cl.isanfurg.mg30pocket.test/cl.isanfurg.mg30pocket.SmokeRunner
```

El smoke test usa un preset sintético, cambia escenas, edita un slider, comprueba el borrador nativo y simula MIDI entrante. Sustituye el documento de prueba: ejecútalo en una instalación de QA, no sobre tu borrador de trabajo. No prueba el cable ni la pedalera.

Antes de confiar en directo, verificar manualmente: selector de archivos importar/exportar y reimportar en QuickTone; mismo recurso IR tras roundtrip; cierre/reapertura con borrador; cambio real de preset y escena por USB; CC ON/OFF con mapeo propio; desconexión/reconexión; salida de audio sin saltos de nivel. Estas verificaciones físicas todavía están pendientes.

## Estructura

- `app/src/main/java/…/MainActivity.java`: WebView local, Storage Access Framework, borrador atómico y Android MIDI.
- `app/src/main/assets/www/`: editor visual, catálogo/lector binario, validación y parser MIDI.
- `test/`: pruebas Node sin instalar dependencias.
- `app/src/androidTest/`: smoke test Android sin librerías externas.
- `docs/PROTOCOL.md`: alcance y futuras capturas necesarias.

## Fuentes y licencia

- [NUX MG-30: USB MIDI y CC personalizables](https://nuxaudio.com/product/mg30/).
- [Android MIDI package](https://developer.android.com/reference/android/media/midi/package-summary) y [MidiReceiver](https://developer.android.com/reference/android/media/midi/MidiReceiver): puertos y flujo de bytes.
- [Android Storage Access Framework](https://developer.android.com/guide/topics/providers/document-provider): selección de archivos sin acceso global al almacenamiento.

MIT. Se conserva la licencia del editor de origen. Marcas y modelos pertenecen a sus dueños; los dibujos SVG son genéricos y originales. Si contribuyes, no incluyas presets ni IR de terceros sin autorización.
