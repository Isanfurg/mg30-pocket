import test from 'node:test';
import assert from 'node:assert/strict';
import { PatchDocument } from '../app/src/main/assets/www/patch-editor.mjs';
import { restoreDraft, toBase64, fromBase64, MAX_BYTES } from '../app/src/main/assets/www/session.mjs';
function fixture(program=0) {
  const data = new Uint8Array(9902); new DataView(data.buffer).setUint32(0,program,true);
  for(let j=0;j<3;j++) { const z=4+142*j; data.set([0,1,2,3,4,5,6,7,8,9,10,11],z+94); data.set(new TextEncoder().encode('POCKET TEST'),z+106); data[z+3]=9; data[z+28]=40; }
  data.fill(173,430); return data;
}
test('autosave roundtrip preserves original for reset and preserves IR bytes', () => {
  const original=fixture(), document=new PatchDocument(original);
  document.setParameter(0,'S2','AMP','GAIN',57);
  const saved={version:1,name:'test',original:toBase64(original),edited:toBase64(document.exportAll())};
  const restored=restoreDraft(saved);
  assert.deepEqual(restored.exportAll(), document.exportAll()); restored.reset(0); assert.deepEqual(restored.exportAll(),original);
  assert.deepEqual(fromBase64(toBase64(original)),original);
});
test('refuses corrupt or expanded drafts, duplicate slots and resource changes', () => {
  const original=fixture(), saved={version:1,name:'test',original:toBase64(original),edited:toBase64(original)};
  const changed=original.slice(); changed[1000]^=255;
  assert.throws(() => restoreDraft({...saved,edited:toBase64(changed)}),/IR\/NAM/);
  assert.throws(() => restoreDraft({...saved,edited:toBase64(fixture(1))}),/slots/);
  assert.throws(() => restoreDraft({...saved,version:2}));
  assert.throws(() => fromBase64('A'.repeat(MAX_BYTES*2)));
  assert.throws(() => fromBase64('not@base64'));
  const duplicate=new Uint8Array(MAX_BYTES); for(let i=0;i<128;i++)duplicate.set(original,i*9902);
  assert.throws(() => new PatchDocument(duplicate),/repetidos/);
});
