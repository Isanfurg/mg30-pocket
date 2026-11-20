import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NuxLink,decodeScene,encodeScene,describeParts,validateBank,liveSwitch,liveParameter,liveModels,liveModel} from '../app/src/main/assets/www/nux.mjs';
import {MidiStream} from '../app/src/main/assets/www/midi.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/preset_07A.json',import.meta.url))).part0;
test('live model selection validates catalog and preserves bypass',()=>{
  assert.ok(liveModels('EFX').some(m=>m.id===5));
  assert.deepEqual(liveModel(1,'EFX',5,false),[176,2,69]);
  assert.deepEqual(liveModel(1,'RVB',2,true),[176,8,2]);
  for(const block of ['IR','WAH','SR','VOL','unknown'])assert.deepEqual(liveModels(block),[]);
  assert.throws(()=>liveModel(1,'AMP',63,true));
  assert.throws(()=>liveModel(1,'EFX',1.5,true));
});
function parts(program=24){return [0,1,2].map(part=>{const body=fixture.slice();body[5]=program;body[6]=part;return body;});}
test('independent captured fixture decodes to native file layout; 8-bit flags and every padding bit survive',()=>{
  const scene=decodeScene(fixture);assert.equal(scene.length,142);
  assert.equal(describeParts(24,parts()).name,'test');assert.equal(scene[3]&63,33);assert.equal(scene[28],55);
  assert.deepEqual(encodeScene(scene,fixture),fixture);
  scene[65]=212;assert.equal(decodeScene(encodeScene(scene,fixture))[65],212);
  const padded=fixture.slice();padded[7]|=124;assert.deepEqual(encodeScene(decodeScene(padded),padded),padded);
});
test('model-preserving bypass does not send 0/127; parameters use raw 0..100',()=>{
  assert.deepEqual(liveSwitch(1,'DLY',2,false),[176,7,66]);assert.deepEqual(liveSwitch(1,'EFX',5,true),[176,2,5]);
  assert.deepEqual(liveParameter(1,'DLY',0,55),[176,54,55]);
  assert.throws(()=>liveParameter(1,'DLY',0,101));assert.throws(()=>liveParameter(1,'IR',0,50));assert.throws(()=>liveSwitch(1,'DLY',0,true));
});
test('SysEx framing handles fragmentation, realtime bytes and bounded messages',()=>{
  const got=[],channel=[],stream=new MidiStream(m=>channel.push(m),m=>got.push(m));
  stream.push([240,67,88,248]);stream.push([112,21,2,24]);stream.push([247,192,24]);
  assert.deepEqual(got,[[240,67,88,112,21,2,24,247]]);assert.deepEqual(channel,[[192,24]]);
  stream.push([240,...Array(5000).fill(0),247]);assert.equal(got.length,1);
});
function fake({badAck=false,badReadback=false,drop=false,wrongLength=false}={}){
  let link,armed=false,writes=0,commits=0,reads=0;const stored=new Map([[24,parts()]]),current=parts().map(p=>{p=p.slice();p[3]=12;return p;});
  const send=async bytes=>{
    const b=bytes.slice(1,-1);if(drop)return;
    let response;
    if(bytes.length===5)response=[67,88,16,...new TextEncoder().encode('v6.0.5\0 MG-30\0')];
    else if(b[3]===21)response=[67,88,112,21,2,24,0,0,0,0,0,0,0];
    else if(b[4]===0){reads++;response=(b[3]===12?current[b[6]]:stored.get(b[5])[b[6]]).slice();if(wrongLength)response.pop();if(badReadback&&commits&&b[3]===11)response[9]^=1;}
    else if(b[3]===11){assert.ok(armed,'write without durable backup/arming');writes++;stored.get(b[5])[b[6]]=b.slice();stored.get(b[5])[b[6]][4]=2;response=[67,88,112,11,3,b[5],badAck?9:b[6]];}
    else if(b[3]===7){commits++;response=[67,88,112,7,3,b[5],b[5]];}
    queueMicrotask(()=>link.receive([240,...response,247]));
  };
  link=new NuxLink(send,30);
  return {link,stored,arm:async bank=>{validateBank(bank);armed=true;},disarm:async()=>{armed=false;},counts:()=>({writes,commits,reads,armed})};
}
async function plan(f){await f.link.refresh();const backup=await f.link.exclusive(()=>f.link.backup([24]));const bank=structuredClone(backup);const raw=decodeScene(bank.records[0].parts[0]);raw[28]=61;bank.records[0].parts[0]=encodeScene(raw,bank.records[0].parts[0]);return {backup,bank,epoch:f.link.epoch};}
test('read, backup, arm, three ACKs, commit and exact readback complete one transaction',async()=>{
  const f=fake(),p=await plan(f);let progress=0;
  assert.equal(f.counts().writes,0);assert.equal(p.backup.editBuffer.parts.length,3);
  const completed=await f.link.upload(p,f.arm,f.disarm,done=>progress=done);
  assert.deepEqual(completed,[24]);assert.equal(progress,1);assert.deepEqual(f.counts(),{writes:3,commits:1,reads:18,armed:false});
});
test('wrong ACK, incompatible response and timeout never report success',async()=>{
  const f=fake({badAck:true}),p=await plan(f);await assert.rejects(f.link.upload(p,f.arm,f.disarm),/timed out/);assert.equal(f.counts().commits,0);assert.equal(f.counts().armed,false);
  await assert.rejects(fake({wrongLength:true}).link.refresh(),/incompatible/i);
  await assert.rejects(fake({drop:true}).link.refresh(),/timed out/);
});
test('readback mismatch fails and leaves backup intact; drift/stale connection never arms',async()=>{
  const f=fake({badReadback:true}),p=await plan(f),original=JSON.stringify(p.backup);
  await assert.rejects(f.link.upload(p,f.arm,f.disarm),/mismatch/);assert.equal(JSON.stringify(p.backup),original);assert.equal(f.counts().armed,false);
  const g=fake(),q=await plan(g);g.stored.get(24)[0][9]^=1;
  await assert.rejects(g.link.upload(q,g.arm,g.disarm),/changed/);assert.equal(g.counts().writes,0);
  const h=fake(),r=await plan(h);h.link.disconnect();await assert.rejects(h.link.upload(r,h.arm,h.disarm),/connection/);assert.equal(h.counts().writes,0);
});
test('backup failure and malformed banks cannot reach a write',async()=>{
  const f=fake(),p=await plan(f);await assert.rejects(f.link.upload(p,async()=>{throw new Error('disk full');},f.disarm),/disk full/);assert.equal(f.counts().writes,0);
  assert.throws(()=>validateBank({...p.bank,records:[...p.bank.records,...p.bank.records]}),/Duplicate/);
  assert.throws(()=>validateBank({...p.bank,assets:'embedded'}));
});
