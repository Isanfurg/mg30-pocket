// MIDI is a byte stream, not one complete message per Android callback.
export class MidiStream {
  constructor(receive, receiveSysEx = () => {}) { this.receive = receive; this.receiveSysEx = receiveSysEx; this.reset(); }
  reset() { this.status = 0; this.pending = []; this.sysex = false; this.frame = []; }
  push(bytes) {
    for (const byte of bytes) {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) { this.reset(); continue; }
      if (byte >= 0xf8) continue; // Realtime bytes may interrupt any message.
      if (byte === 0xf0) { this.reset(); this.sysex = true; this.frame = [byte]; continue; }
      if (byte === 0xf7) { const frame = this.sysex ? [...this.frame, byte] : null; this.reset(); if (frame) this.receiveSysEx(frame); continue; }
      if (byte >= 0x80) {
        this.sysex = false; this.pending = [];
        this.status = byte < 0xf0 ? byte : 0;
        continue;
      }
      if (this.sysex) { this.frame.push(byte); if (this.frame.length > 4096) this.reset(); continue; }
      if (!this.status) continue;
      this.pending.push(byte);
      const size = [0xc0, 0xd0].includes(this.status & 0xf0) ? 1 : 2;
      if (this.pending.length === size) { this.receive([this.status, ...this.pending]); this.pending = []; }
    }
  }
}
export function cc(channel, controller, value) {
  if (![channel, controller, value].every(Number.isInteger) || channel < 1 || channel > 16 || controller < 0 || controller > 119 || value < 0 || value > 127) throw new Error('Canal 1–16, CC 0–119 y valor 0–127.');
  return [0xb0 | channel - 1, controller, value];
}
export function pc(channel, program) {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16 || !Number.isInteger(program) || program < 0 || program > 127) throw new Error('Canal o preset MIDI fuera de rango.');
  return [0xc0 | channel - 1, program];
}
export function sceneController(mapping) {
  return mapping.sceneCC ?? (mapping.effects.some(effect => effect.cc === 80) ? null : 80);
}
export function validateMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || !Number.isInteger(mapping.channel) || mapping.channel < 1 || mapping.channel > 16 || !Array.isArray(mapping.effects) || mapping.effects.length > 12) throw new Error('Mapeo MIDI no válido.');
  const occupied = new Set();
  if (mapping.sceneCC !== null) { cc(mapping.channel, mapping.sceneCC, 0); occupied.add(mapping.sceneCC); }
  const blocks = new Set();
  for (const effect of mapping.effects) {
    if (!['WAH','GATE','CMP','EFX','AMP','IR','EQ','SR','VOL','MOD','DLY','RVB'].includes(effect.block) || blocks.has(effect.block)) throw new Error('Bloque MIDI duplicado o no válido.');
    blocks.add(effect.block);
    cc(mapping.channel, effect.cc, effect.on); cc(mapping.channel, effect.cc, effect.off);
    if (effect.on === effect.off || occupied.has(effect.cc)) throw new Error('Cada CC debe ser único y sus valores ON/OFF distintos.');
    occupied.add(effect.cc);
  }
  return mapping;
}
