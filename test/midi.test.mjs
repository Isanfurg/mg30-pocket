import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiStream, cc, pc, validateMapping, sceneController } from '../app/src/main/assets/www/midi.mjs';

test('handles fragmented messages, running status and interleaved realtime clock', () => {
  const got = [], parser = new MidiStream(message => got.push(message));
  parser.push([0xc0]); parser.push([29, 30, 0xb0, 80]); parser.push([0xf8, 2, 80, 1]);
  assert.deepEqual(got, [[0xc0,29],[0xc0,30],[0xb0,80,2],[0xb0,80,1]]);
});
test('ignores SysEx/system common, resets streams across connections', () => {
  const got = [], parser = new MidiStream(message => got.push(message));
  parser.push([0xf0,0x43,80,2,0xf8,0xf7,0xf2,1,2,0xc0,10]);
  parser.push([0xb0,80]); parser.reset(); parser.push([2]);
  assert.deepEqual(got, [[0xc0,10]]);
});
test('channel messages on all channels, no invalid data or SysEx output', () => {
  assert.deepEqual(cc(16,80,2), [0xbf,80,2]); assert.deepEqual(pc(1,127),[0xc0,127]);
  for (const args of [[0,80,0],[17,80,0],[1,120,0],[1,80,128],[1,2.5,0]]) assert.throws(() => cc(...args));
  assert.throws(() => pc(1,128)); assert.throws(() => pc(1,-1));
});
test('rejects CC conflicts, malformed values and duplicate effect assignments', () => {
  const base = { channel:1,sceneCC:80,effects:[{block:'DLY',cc:25,on:127,off:0}] };
  assert.deepEqual(validateMapping(base),base);
  for (const effect of [{block:'DLY',cc:80,on:127,off:0},{block:'DLY',cc:30,on:0,off:0},{block:'DLY',cc:120,on:127,off:0},{block:'unknown',cc:25,on:127,off:0}]) assert.throws(() => validateMapping({...base,effects:[effect]}));
  assert.throws(() => validateMapping({...base,effects:[...base.effects,{block:'DLY',cc:26,on:127,off:0}]}));
});
test('passive scene fallback does not reinterpret an explicitly mapped effect CC', () => {
  assert.equal(sceneController({sceneCC:null,effects:[]}),80);
  assert.equal(sceneController({sceneCC:null,effects:[{block:'EFX',cc:80}]}),null);
  assert.equal(sceneController({sceneCC:70,effects:[{block:'EFX',cc:80}]}),70);
});
