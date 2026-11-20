import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchDocument} from '../app/src/main/assets/www/patch-editor.mjs';
import {buildAiRequest,applyAiProposal,parseAiResponse,AI_SCHEMA} from '../app/src/main/assets/www/ai-preset.mjs';
function source(){const bytes=new Uint8Array(9902);for(let s=0;s<3;s++){const at=4+142*s;bytes.set([0,1,2,3,9,4,10,6,11,7,8,5],at+94);bytes.set(new TextEncoder().encode('BASE'),at+106);bytes[at+3]=9;bytes[at+7]=2;bytes[at+92]=120;bytes.fill(12,at+122,at+142);}bytes.fill(173,430);return bytes;}
function proposal(){return {name:'AI AC30',summary:'Clean, drive and lead.',scenes:['S1','S2','S3'].map((scene,i)=>({scene,bpm:120,dottedEighth:true,blocks:[{block:'AMP',modelId:9,enabled:true,parameters:[{name:'GAIN',value:25+10*i}]},{block:'DLY',modelId:2,enabled:true,parameters:[{name:'E.LEVEL',value:12+5*i}]}]}))};}
test('AI draft validates three scenes, keeps source, chain, controller and IR data intact',()=>{
 const original=source(),saved=original.slice(),result=applyAiProposal(original,proposal());assert.deepEqual(original,saved);
 assert.deepEqual(result.subarray(430),saved.subarray(430));const doc=new PatchDocument(result);assert.equal(doc.describe(0).name,'AI AC30');assert.equal(doc.describe(0).scenes[2].blocks.AMP.parameters[0].value,45);
 for(let i=0;i<3;i++){const at=4+i*142;assert.deepEqual(result.slice(at+94,at+106),saved.slice(at+94,at+106));assert.deepEqual(result.slice(at+122,at+142),saved.slice(at+122,at+142));}
});
test('untrusted AI proposals reject unknown fields, IR edits, duplicate scenes, bad models and ranges atomically',()=>{
 for(const mutate of [p=>p.extra=true,p=>p.scenes[1].scene='S1',p=>p.scenes[0].blocks[0].block='IR',p=>p.scenes[0].blocks[0].modelId=63,p=>p.scenes[0].blocks[0].parameters[0].value=101,p=>p.scenes[0].blocks.push(p.scenes[0].blocks[0]),p=>p.scenes[0].blocks[0].parameters[0].name='unknown',p=>p.scenes.pop()]){const raw=source(),before=raw.slice(),p=proposal();mutate(p);assert.throws(()=>applyAiProposal(raw,p));assert.deepEqual(raw,before);}
});
test('request contains only metadata and supported models, response refuses incomplete or malformed output',()=>{
 const req=buildAiRequest(new PatchDocument(source()),0,'Worship clean and lead');assert.equal(req.schema,AI_SCHEMA);assert.ok(!req.input.includes('base64'));assert.ok(!JSON.parse(req.input).models.some(m=>m.block==='IR'));
 assert.deepEqual(parseAiResponse({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(proposal())}]}]}),proposal());
 for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{content:[{type:'refusal'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'invalid'}]}]}])assert.throws(()=>parseAiResponse(response));
 assert.throws(()=>buildAiRequest(new PatchDocument(source()),0,''));
});
