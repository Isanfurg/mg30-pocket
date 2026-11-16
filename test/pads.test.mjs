import test from 'node:test';
import assert from 'node:assert/strict';
import {PressGesture,validatePad,DEFAULT_PADS,slotProgram} from '../app/src/main/assets/www/pads.mjs';
function gesture(){let timer,holds=0;const value=new PressGesture(()=>holds++,fn=>{timer=fn;return fn;},id=>{if(timer===id)timer=null;});return {value,fire:()=>timer?.(),holds:()=>holds};}
test('short release executes a tap once; long press produces hold and never tap',()=>{
  const g=gesture();g.value.start();assert.equal(g.value.end(),'tap');g.fire();assert.equal(g.holds(),0);assert.equal(g.value.end(),'cancel');
  g.value.start();g.fire();assert.equal(g.holds(),1);assert.equal(g.value.end(),'hold');
});
test('scroll movement, cancellation and a new pointer cancel the old hold',()=>{
  const g=gesture();g.value.start(0,0);g.value.move(0,20);g.fire();assert.equal(g.holds(),0);assert.equal(g.value.end(),'cancel');
  g.value.start();g.value.cancel();g.fire();assert.equal(g.holds(),0);
  g.value.start();g.value.start(5,5);g.fire();assert.equal(g.holds(),1);assert.equal(g.value.end(),'hold');
});
test('default timer adapters do not pass a gesture object as the browser timer receiver',()=>{
  const schedule=globalThis.setTimeout,clear=globalThis.clearTimeout;let fired;
  try{globalThis.setTimeout=function(fn){assert.equal(this,undefined);fired=fn;return 1;};globalThis.clearTimeout=function(){assert.equal(this,undefined);};const value=new PressGesture(()=>{});value.start();fired();assert.equal(value.end(),'hold');}
  finally{globalThis.setTimeout=schedule;globalThis.clearTimeout=clear;}
});
test('pad actions validate before saving, independent of hardware connection',()=>{
  assert.equal(DEFAULT_PADS.length,8);for(const pad of DEFAULT_PADS)assert.deepEqual(validatePad(pad),pad);
  for(const bad of [{label:'',action:'none'},{label:'x',action:'firmware'},{label:'x',action:'scene',scene:3},{label:'x',action:'preset',program:128},{label:'x',action:'toggle',block:'unknown'}])assert.throws(()=>validatePad(bad));
  assert.equal(slotProgram('01a'),0);assert.equal(slotProgram('32D'),127);for(const label of ['00A','33B','1E','0','12AA'])assert.throws(()=>slotProgram(label));
});
