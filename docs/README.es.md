# MG30 Pocket

Editor Android gratuito para NUX MG-30, pensado para tablet y pantalla dividida con letras. Proyecto independiente, sin afiliacion con NUX.

[Descargar APK 0.5.0](https://github.com/Isanfurg/mg30-pocket/releases/tag/v0.5.0) | [English](../README.md)

- Editar: lectura del preset, escenas, parametros y tarjetas ilustradas para elegir modelos.
- Pads: ocho botones. Toca para usar; manten para configurar sin enviar MIDI.
- Archivos: importar/exportar `.mg30patch`, bancos completos, copiar escenas y recuperar borradores. Se conservan los IR/NAM originales.
- Ajustes: General, USB, MIDI y Acerca de. Ingles predeterminado; cambia a Espanol en General sin perder ediciones ni conexion.

## IA opcional

Importa un preset base que funcione. La demo es solo para vista previa de la interfaz, no para tocar. En Ajustes > General > OpenAI guarda tu propia clave API. Abre Crear con IA, describe el sonido y genera tres escenas. Revisa y usa el resultado en el archivo local, o exportalo para QuickTone.

La API se cobra en tu cuenta OpenAI, por separado de ChatGPT. Solo Generar inicia una solicitud. La clave queda cifrada mediante Android Keystore y no se devuelve al navegador ni se incluye en borradores/exportaciones. Puedes borrarla en Ajustes. Se envian texto y ajustes, no audio ni archivos IR/NAM.

La propuesta se valida antes de aplicarse: modelos, nombres de parametros, rangos, escenas y duplicados. Se conservan cadena, controladores y recursos. No sustituye la calibracion de volumen escuchando.

## Compatibilidad

La carga y guardado directo de bancos en la NUX siguen deshabilitados mientras se investiga el aviso de firmware. No se actualiza ni reinicia la pedalera. Exporta el archivo e importalo con QuickTone compatible. Los IR/NAM no se transfieren.

El editor y MIDI funcionan offline. La IA requiere internet y clave propia. Las pruebas Android usan NUX e IA simuladas, sin hardware ni solicitudes pagadas. Falta validar la APK con tu tablet y NUX.

Licencia MIT. Documentacion tecnica, compilacion y fuentes oficiales en [README principal](../README.md).
