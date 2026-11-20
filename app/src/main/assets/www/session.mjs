import {t} from './i18n.mjs';
import { PatchDocument } from './patch-editor.mjs';
export const MAX_BYTES = 9902 * 128;
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function fromBase64(text) {
  if (typeof text !== 'string' || text.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error(t('Archivo demasiado grande o codificación no válida.'));
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
export function restoreDraft(draft) {
  if (!draft || draft.version !== 1 || typeof draft.name !== 'string') throw new Error(t('Borrador no compatible.'));
  const original = new PatchDocument(fromBase64(draft.original));
  const edited = new PatchDocument(fromBase64(draft.edited));
  if (original.presets.length !== edited.presets.length || original.presets.some((p, i) => p.program !== edited.presets[i].program)) throw new Error(t('El borrador cambió los slots.'));
  original.presets.forEach(p => original.records.set(p.program, edited.exportPreset(p.program)));
  original.exportAll(); // Refuses IR/NAM payload changes relative to the original.
  return original;
}
