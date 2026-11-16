# Estado de la integración

## Archivos

El parser reconoce uno o 128 registros de 9902 bytes. Slots 0–127, nombres ASCII, cadenas de 12 bloques sin duplicados. El constructor del editor rechaza slots duplicados. Cada escena ocupa 142 bytes. El editor limita parámetros a modelos y rangos mapeados; no fabrica NAM ni recursos IR. El export valida la cadena y compara todos los bytes del recurso opaco con el original. El borrador restaura ese original, no convierte la última edición en una nueva referencia.

## USB MIDI

Se usa Android `MidiManager`, con selección explícita de dispositivo USB y de sus puertos. Abre el input para enviar, conecta un receiver al output para recibir. Cierra ambos al desconectar, retirar dispositivo o destruir Activity. Un contador de generación descarta aperturas/callbacks de conexiones anteriores. No se utiliza USB raw, Bluetooth ni un servidor de PC.

Los mensajes observados en una MG-30 (firmware 6.0.5) son PC de canal 1 para preset y CC 80 decimal/valor 0–2 para escena. Es evidencia de **salida** de esa unidad, no garantía del mapeo de recepción en todas las NUX. Todos los CC de envío se configuran por el usuario; los de efectos no tienen defaults. El bridge rechaza SysEx, data bytes inválidos, canal fuera del status permitido y CC Channel Mode 120–127.

PC y cambios de escena invalidan los estados de efectos recibidos. El mismo borrado ocurre al conectar/desconectar o cambiar mapeo. No se marca como aplicado un comando solo por haberlo enviado. Los CC se interpretan por coincidencia exacta de canal, controlador y valor ON/OFF configurado. Una asignación de valor absoluto no sirve automáticamente para un CC que actúa como toggle o pulsación: consultar el comportamiento configurado en QuickTone.

## Lo que falta para edición directa

Hace falta documentar y validar el protocolo de sincronización y escritura de presets para cada firmware soportado. No es correcto asumir que un `.mg30patch` es directamente un mensaje SysEx ni inferir comandos de escritura de mensajes de estado.

Antes de implementar: capturas con QuickTone y dispositivo de pruebas, fixtures de cambios de un solo parámetro, framing, identificación/modelo/firmware, checksums, tamaños, ACK/NACK, transferencia fragmentada, timeouts y recuperación de interrupción. Exportar y verificar una copia del banco antes de cualquier escritura persistente. Nunca publicar capturas con IR privados; usar presets sintéticos y assets redistribuibles.

No se envía la consulta propietaria previamente explorada desde PC ni se incluyen sondeos a ciegas. El estado inicial queda desconocido hasta que la pedalera emite PC/CC. Edición de archivo y control live son deliberadamente acciones distintas en la interfaz.
