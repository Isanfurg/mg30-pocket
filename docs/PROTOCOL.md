# Protocolo en MG30 Pocket 0.2

Fuente primaria comunitaria: https://github.com/voronkovd/nux-mg30-mcp/blob/main/docs/PROTOCOL.md (ingenier?a inversa en 5.0.2, no especificaci?n oficial). El fixture sint?tico de ese proyecto verifica la conversi?n; su MIT est? en test/fixtures/UPSTREAM-LICENSE.txt. No contiene recursos de audio ni sonidos del usuario.

## Formato y perfil

Se acepta MG-30 cl?sica identificada como 5.0.2, 6.0.2 o 6.0.5 y respuestas de 220 bytes de cuerpo que decodifiquen a tres escenas v?lidas. MKII, otros firmwares o tama?os se rechazan para SysEx. Esta compatibilidad estructural no reemplaza la prueba f?sica: 0.2 est? probada con simulador de hardware.

Registro local: slot de 4 bytes, tres escenas de 142, recurso opaco desde 430 hasta 9902. El payload MIDI de 213 bytes contiene grupos de tres bytes de 7 bits que llevan dos bytes de escena de 8 bits en sus 16 bits inferiores. Se conservan los 5 bits superiores de la plantilla le?da; no se truncan los flags de 8 bits del archivo. El fixture ajeno valida nombre, ampli, ganancia, padding y roundtrip.

## Lectura y cambios live

Identidad: F0 43 58 00 F7. Estado: 43 58 70 15 00. Datos almacenados: comando 0B, operaci?n 00; buffer: 0C/00. Respuesta esperada: operaci?n 02, programa y parte exactos. Se consulta estado antes y despu?s de leer el buffer para detectar cambios de selecci?n.

CC de bloque 0?10: n?mero de modelo m?s 64 para bypass, nunca 0/127. Par?metros con valor raw 0?100 y tabla por bloque. Se habilitan solo controles num?ricos mapeados; IR, WAH, VOL y flags de modelo 128 no se adivinan. Env?os separados al menos 60 ms, sliders con debounce y relectura al soltar. Un valor distinto se informa como no confirmado. Requiere mapeo predeterminado expl?cito; canal y CC de escena configurables. PC/modelo/escena recibidos invalidan el estado y provocan lectura nueva. Un knob f?sico puede no emitir nada: usar Leer NUX.

## Carga persistente

1. Leer los destinos almacenados y el buffer activo, incluidos cambios sin guardar.
2. Construir plan congelado y guardar respaldo interno antes de mostrar destinos y pedir confirmaci?n. No se escribe en la NUX en esta fase.
3. El usuario confirma la carga y que los IR/NAM ya est?n instalados en esos destinos. No se transfieren esos recursos.
4. Releer destinos/buffer para detectar deriva desde la revisi?n; abortar si cambiaron. Guardar otra copia durable.
5. El bridge habilita ?nicamente los slots del respaldo, con firmware previamente identificado tambi?n en Java. Escribir tres partes 0B/01, cada una con ACK 0B/03 de programa y parte correctos; commit 07/01 con ACK 07/03.
6. Releer las tres partes y comparar todo el payload. Solo entonces se cuenta el preset como completado.
7. Deshabilitar escrituras en ?xito o error. Desconexi?n u ocultar completamente la app elimina la autorizaci?n. Pantalla dividida mantiene la app visible.

No hay atomicidad de todo un banco ni rollback autom?tico: una interrupci?n puede dejar presets ya cargados y otro parcialmente escrito. Se informa cu?ntos est?n verificados y se conserva el respaldo para exportar/restaurar. No se reintenta a ciegas. El bridge solo permite identidad/estado, consultas 0B/0C y escrituras/commit de tama?o y slots autorizados; no hay consola SysEx gen?rica ni comandos de firmware, reset, IR o NAM.

## Banco MIDI JSON

Extensi?n .mg30bank.json: kind=mg30-midi-bank, version=1, firmware, assets=external y records con programa y tres cuerpos almacenados. editBuffer guarda opcionalmente su selecci?n y partes originales. Se restaura solo al mismo firmware. No incluye muestras IR/NAM ni es un respaldo completo de recursos. Los respaldos internos se pierden al desinstalar: exportarlos antes. El plan de carga desde .mg30patch conserva los recursos actualmente instalados en la pedalera; no sube los incrustados en el archivo.
