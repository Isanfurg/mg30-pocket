import {t} from './i18n.mjs';
import { readPatchFile } from './patch-reader.mjs';
import { cc } from './midi.mjs';
import catalog from './patch-catalog.mjs';

// Protocol facts documented for 5.0.2; 6.x requires the same 220-byte layout.
// https://github.com/voronkovd/nux-mg30-mcp/blob/main/docs/PROTOCOL.md
export const PROFILE = { WAH:[0,11], CMP:[1,14], EFX:[2,18], AMP:[3,24], EQ:[4,32], GATE:[5,44], MOD:[6,48], DLY:[7,54], RVB:[8,62], IR:[9,66], SR:[10,72] };
export const NAMES = {};
for(const [block,label] of Object.entries({WAH:'Wah',CMP:'Compresor',EFX:'Overdrive',AMP:'Amplificador',EQ:'Ecualizador',GATE:'Puerta de ruido',MOD:'Modulación',DLY:'Delay',RVB:'Reverb',IR:'Cabina / IR',VOL:'Volumen',SR:'Send / Return'}))Object.defineProperty(NAMES,block,{enumerable:true,get:()=>t(label)});
const index = (n, max, label) => { if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(t`${label} fuera de rango.`); return n; };
const frame = body => [240,...body,247];
export const readRequest = (command, program, part) => {
  if (![11,12].includes(command)) throw new Error(t('Consulta no permitida.'));
  return frame([67,88,112,command,0,index(program,127,'Preset'),index(part,2,t('Parte')),0,0,0,0,0,0]);
};
export function validatePart(body, program, part) {
  if (!Array.isArray(body) || body.length !== 220 || body.some(n => !Number.isInteger(n) || n < 0 || n > 127) || body[0] !== 67 || body[1] !== 88 || body[2] !== 112 || ![11,12].includes(body[3]) || body[4] !== 2 || body[5] !== program || body[6] !== part) throw new Error(t('Respuesta NUX incompatible o de otro preset/parte.'));
  return body;
}
export function decodeScene(body) {
  validatePart(body, body[5], body[6]); const result = new Uint8Array(142);
  for (let i=0;i<71;i++) { const at=7+i*3, value=(body[at]<<14)|(body[at+1]<<7)|body[at+2]; result[i*2]=(value>>8)&255; result[i*2+1]=value&255; }
  return result;
}
export function encodeScene(scene, template) {
  if (!(scene instanceof Uint8Array) || scene.length !== 142) throw new Error(t('Escena de archivo no válida.'));
  validatePart(template,template[5],template[6]); const result=template.slice();
  for(let i=0;i<71;i++) { const at=7+i*3, value=(scene[2*i]<<8)|scene[2*i+1]; result[at]=(template[at]&124)|(value>>14);result[at+1]=(value>>7)&127;result[at+2]=value&127; }
  return result;
}
export function describeParts(program, parts) {
  if (!Array.isArray(parts) || parts.length!==3) throw new Error(t('Faltan partes del preset.'));
  const record=new Uint8Array(9902);new DataView(record.buffer).setUint32(0,program,true);
  parts.forEach((body,i)=>{validatePart(body,program,i);record.set(decodeScene(body),4+142*i);});
  return readPatchFile(record)[0];
}
export function validateBank(bank) {
  if (!bank || bank.kind!=='mg30-midi-bank' || bank.version!==1 || bank.assets!=='external' || typeof bank.firmware!=='string' || !Array.isArray(bank.records) || !bank.records.length || bank.records.length>128) throw new Error(t('Banco MIDI no válido.'));
  const slots=new Set();
  for(const record of bank.records) { index(record.program,127,'Preset');if(slots.has(record.program))throw new Error(t('Slots duplicados.'));slots.add(record.program);describeParts(record.program,record.parts);if(record.parts.some(part=>part[3]!==11))throw new Error(t('El banco debe contener respuestas de memoria almacenada.')); }
  if(bank.editBuffer){index(bank.editBuffer.program,127,'Buffer');index(bank.editBuffer.scene,2,t('Escena del buffer'));describeParts(bank.editBuffer.program,bank.editBuffer.parts);if(bank.editBuffer.parts.some(part=>part[3]!==12))throw new Error(t('Buffer de respaldo no válido.'));}
  return bank;
}
export function liveSwitch(channel, block, model, enabled) {
  if(!PROFILE[block] || !Number.isInteger(model) || model<1 || model>63 || typeof enabled!=='boolean') throw new Error(t('Modelo o bloque sin control MIDI validado.'));
  return cc(channel,PROFILE[block][0],model|(enabled?0:64));
}
export function liveModels(block) {
  return ['CMP','EFX','AMP','EQ','GATE','MOD','DLY','RVB'].includes(block)
    ? catalog.models.filter(m=>m.block===block&&!m.special&&m.id>=1&&m.id<=63).sort((a,b)=>a.id-b.id) : [];
}
export function liveModel(channel, block, model, enabled) {
  if(!liveModels(block).some(m=>m.id===model))throw new Error(t('Modelo especial o desconocido: conserva su archivo base.'));
  return liveSwitch(channel,block,model,enabled);
}
export function liveParameter(channel, block, parameter, value) {
  const capacity={CMP:4,EFX:6,AMP:8,EQ:12,GATE:4,MOD:6,DLY:8,RVB:4};
  if(!capacity[block])throw new Error(t('Control especial no habilitado en vivo.'));
  index(parameter,capacity[block]-1,t('Parámetro'));index(value,100,t('Valor'));
  return cc(channel,PROFILE[block][1]+parameter,value);
}

export class NuxLink {
  constructor(send, timeout=4000) {this.send=send;this.timeout=timeout;this.pending=null;this.identity=null;this.snapshot=null;this.busy=false;this.epoch=0;}
  receive(message) {
    if(!Array.isArray(message)||message[0]!==240||message.at(-1)!==247)return;
    const body=message.slice(1,-1);
    if(this.pending?.match(body)){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve(body);}
  }
  disconnect() {this.epoch++;this.identity=null;this.snapshot=null;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error(t('USB desconectado. Conserva el respaldo antes de reintentar.')));this.pending=null;}}
  request(bytes,match) {
    if(this.pending)throw new Error(t('Hay una consulta MIDI pendiente.'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;reject(new Error(t('La NUX no respondió a tiempo. No se confirma el cambio.')));},this.timeout);
      this.pending={match,resolve,reject,timer};
      Promise.resolve().then(()=>this.send(bytes)).catch(error=>{if(this.pending?.timer===timer){clearTimeout(timer);this.pending=null;reject(error);}});
    });
  }
  async exclusive(work){if(this.busy)throw new Error(t('Operación NUX en curso.'));this.busy=true;const epoch=this.epoch;try{return await work(()=>{if(epoch!==this.epoch)throw new Error(t('La conexión cambió durante la operación.'));});}finally{this.busy=false;}}
  async identify() {
    const body=await this.request([240,67,88,0,247],b=>b[0]===67&&b[1]===88&&b[2]===16);
    const text=String.fromCharCode(...body.slice(3));const firmware=text.match(/v?(?:5\.0\.2|6\.0\.[25])\b/)?.[0]?.replace(/^v/,'');
    if(!firmware || !/MG-30\b/.test(text) || /MK\s*II|MK2/i.test(text))throw new Error(t('Modelo o firmware sin perfil de transferencia. Solo lectura MIDI estándar.'));
    this.identity={firmware};return this.identity;
  }
  async status() {
    const body=await this.request([240,67,88,112,21,0,247],b=>b.length===13&&b.slice(0,5).join(',')==='67,88,112,21,2');
    index(body[5],127,t('Preset recibido'));index(body[8],2,t('Escena recibida'));return {program:body[5],scene:body[8]};
  }
  async parts(command,program,check=()=>{}) {
    const parts=[];
    for(let part=0;part<3;part++){check();const body=await this.request(readRequest(command,program,part),b=>b[0]===67&&b[1]===88&&b[2]===112&&b[3]===command&&b[4]===2&&b[5]===program&&b[6]===part);validatePart(body,program,part);parts.push(body);}
    describeParts(program,parts);return parts;
  }
  async refresh(){return this.exclusive(async check=>{if(!this.identity)await this.identify();const state=await this.status();const parts=await this.parts(12,state.program,check);const after=await this.status();if(after.program!==state.program||after.scene!==state.scene)throw new Error(t('La selección cambió al leer. Vuelve a sincronizar.'));this.snapshot={...state,parts,preset:describeParts(state.program,parts)};return this.snapshot;});}
  async backup(programs,progress=()=>{}) {
    if(!this.identity)await this.identify();const records=[];
    const state=await this.status(), editBuffer={...state,parts:await this.parts(12,state.program)};
    for(const program of programs){records.push({program,parts:await this.parts(11,program)});progress(records.length,programs.length);}
    return validateBank({kind:'mg30-midi-bank',version:1,assets:'external',firmware:this.identity.firmware,records,editBuffer});
  }
  async plan(document,programs,progress=()=>{}) {
    return this.exclusive(async check=>{
      const backup=await this.backup(programs,progress);check();
      const records=backup.records.map(saved=>{
        const file=document.exportPreset(saved.program), parts=saved.parts.map((template,j)=>encodeScene(file.slice(4+j*142,4+(j+1)*142),template));
        return {program:saved.program,parts};
      });
      return {backup,bank:validateBank({...backup,records}),epoch:this.epoch};
    });
  }
  async writeRecord(record,check) {
    for(let part=0;part<3;part++){
      check();const body=record.parts[part].slice();body[3]=11;body[4]=1;
      await this.request(frame(body),b=>b.length>=7&&b[0]===67&&b[1]===88&&b[2]===112&&b[3]===11&&b[4]===3&&b[5]===record.program&&b[6]===part);
    }
    check();const p=record.program;
    await this.request(frame([67,88,112,7,1,p,p,0,0,0,0,0,0]),b=>b.length>=7&&b.slice(0,6).join(',')===`67,88,112,7,3,${p}`);
    const verified=await this.parts(11,p,check);
    if(verified.some((part,j)=>part.slice(7).some((v,k)=>v!==record.parts[j][7+k])))throw new Error(t`El preset ${p} no coincide al releer. Usa el respaldo.`);
  }
  async upload(plan,arm,disarm,progress=()=>{}) {
    return this.exclusive(async check=>{
      validateBank(plan.bank);validateBank(plan.backup);
      if(plan.epoch!==this.epoch||!this.identity||plan.bank.firmware!==this.identity.firmware||plan.backup.firmware!==this.identity.firmware)throw new Error(t('Respaldo de otra conexión o firmware. Prepara de nuevo la carga.'));
      if(plan.bank.records.map(r=>r.program).join(',')!==plan.backup.records.map(r=>r.program).join(','))throw new Error(t('El respaldo no cubre los destinos.'));
      if(plan.backup.editBuffer){const state=await this.status(),old=plan.backup.editBuffer;if(state.program!==old.program||state.scene!==old.scene)throw new Error(t('Cambió la selección de la NUX. Prepara de nuevo la carga.'));const now=await this.parts(12,state.program,check);if(JSON.stringify(now)!==JSON.stringify(old.parts))throw new Error(t('Hay nuevos cambios sin guardar en la NUX. Prepara de nuevo la carga.'));}
      // Recheck before arming: do not overwrite edits made since the preview.
      for(const saved of plan.backup.records){const now=await this.parts(11,saved.program,check);if(JSON.stringify(now)!==JSON.stringify(saved.parts))throw new Error(t('La NUX cambió después del respaldo. Prepara de nuevo la carga.'));}
      const completed=[];
      try{await arm(plan.backup);for(const record of plan.bank.records){check();await this.writeRecord(record,check);completed.push(record.program);progress(completed.length,plan.bank.records.length);}return completed;}
      catch(error){throw new Error(t`${error.message} Completados y verificados: ${completed.length}/${plan.bank.records.length}. El respaldo previo sigue disponible.`);}
      finally{await disarm();this.snapshot=null;}
    });
  }
}
