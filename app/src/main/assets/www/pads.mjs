import {NAMES,PROFILE} from './nux.mjs';

export const DEFAULT_PADS=[
  {label:'S1 · Base',action:'scene',scene:0},{label:'S2 · Crecimiento',action:'scene',scene:1},{label:'S3 · Solo',action:'scene',scene:2},
  ...['EFX','DLY','RVB','MOD','CMP'].map(block=>({label:NAMES[block],action:'toggle',block}))
];
export function validatePad(pad){
  if(!pad||typeof pad.label!=='string'||!pad.label.trim()||pad.label.length>32||!['none','toggle','on','off','scene','preset'].includes(pad.action))throw new Error('Nombre o acción del pad no válido.');
  if(['toggle','on','off'].includes(pad.action)&&!Object.hasOwn(PROFILE,pad.block))throw new Error('Efecto del pad no válido.');
  if(pad.action==='scene'&&(!Number.isInteger(pad.scene)||pad.scene<0||pad.scene>2))throw new Error('Escena no válida.');
  if(pad.action==='preset'&&(!Number.isInteger(pad.program)||pad.program<0||pad.program>127))throw new Error('Preset no válido.');
  return {...pad,label:pad.label.trim()};
}
export function slotProgram(text){const m=/^(\d{1,2})([A-D])$/i.exec(text.trim());if(!m||Number(m[1])<1||Number(m[1])>32)throw new Error('Usa un preset entre 01A y 32D.');return (Number(m[1])-1)*4+'ABCD'.indexOf(m[2].toUpperCase());}
export class PressGesture{
  constructor(hold,schedule=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id)){this.hold=hold;this.schedule=schedule;this.clear=clear;}
  start(x=0,y=0){this.cancel();this.active=true;this.held=false;this.point=[x,y];this.timer=this.schedule(()=>{if(this.active){this.held=true;this.hold();}},650);}
  move(x,y){if(this.active&&Math.hypot(x-this.point[0],y-this.point[1])>12)this.cancel();}
  end(){if(!this.active)return 'cancel';this.clear(this.timer);this.active=false;return this.held?'hold':'tap';}
  cancel(){this.clear(this.timer);this.active=false;}
}
export function createPads(ctx){
  const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  let config=DEFAULT_PADS.map(p=>({...p})),editing=null,blockedClick=0;
  try{const saved=JSON.parse(localStorage.getItem('pads.v1'));if(Array.isArray(saved)&&saved.length===8)config=saved.map(validatePad);}catch{}
  for(const key of Object.keys(PROFILE)){const option=make('option',NAMES[key]);option.value=key;$('padBlock').append(option);}
  const detail=pad=>['toggle','on','off'].includes(pad.action)?`${NAMES[pad.block]} · ${{toggle:'ON / OFF',on:'Encender',off:'Apagar'}[pad.action]}`:pad.action==='scene'?`Cambiar a S${pad.scene+1}`:pad.action==='preset'?`Preset ${String(Math.floor(pad.program/4)+1).padStart(2,'0')}${'ABCD'[pad.program%4]}`:'Sin asignar';
  function render(){
    const state=ctx.stage.state();$('padsPreset').textContent=state?`${state.preset.slot} · ${state.preset.name} · S${state.scene+1}`:'Sin estado leído · mantén un pad para configurarlo';
    $('padGrid').replaceChildren(...config.map((pad,index)=>{
      let active=null;if(state){if(pad.action==='scene')active=state.scene===pad.scene;else if(pad.action==='preset')active=state.program===pad.program;else if(['toggle','on','off'].includes(pad.action))active=state.preset.scenes[state.scene].blocks[pad.block]?.enabled??null;}
      const button=make('button',undefined,`performance-pad${active===true?' active':''}`);button.dataset.pad=index;
      button.dataset.kind=pad.block||pad.action;button.dataset.type=pad.action==='scene'?'ESCENA':pad.action==='preset'?'PRESET':pad.action==='none'?'LIBRE':'EFECTO';
      if(active!==null)button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-description','Toca para ejecutar. Mantén pulsado para configurar. Con teclado: Shift F10.');
      button.append(make('span',String(index+1).padStart(2,'0'),'pad-number'),make('strong',pad.label),make('small',detail(pad)),make('span',active===null?'Sin estado leído':active?'Activo · estado leído':'Inactivo · estado leído','pad-state'));
      const execute=()=>{if(pad.action==='none'){ctx.toast('Mantén pulsado para asignar una acción.');return;}ctx.stage.executePad(pad);};
      const gesture=new PressGesture(()=>{blockedClick=Date.now()+1000;open(index);});
      button.addEventListener('pointerdown',event=>{if(event.button!==0)return;try{button.setPointerCapture(event.pointerId);}catch{/* Synthetic/accessibility pointers may not support capture. */}gesture.start(event.clientX,event.clientY);button.classList.add('pressing');});
      button.addEventListener('pointermove',event=>gesture.move(event.clientX,event.clientY));
      button.addEventListener('pointerup',event=>{const rect=button.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)gesture.cancel();const result=gesture.end();button.classList.remove('pressing');blockedClick=Date.now()+300;if(result==='tap')execute();});
      for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,()=>{gesture.cancel();button.classList.remove('pressing');});
      button.addEventListener('click',event=>{event.preventDefault();if(event.detail===0&&Date.now()>blockedClick)execute();});
      button.addEventListener('contextmenu',event=>{event.preventDefault();gesture.cancel();blockedClick=Date.now()+1000;open(index);});
      button.addEventListener('keydown',event=>{
        if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();gesture.cancel();open(index);}
        else if(['Enter',' '].includes(event.key)){event.preventDefault();if(!event.repeat)gesture.start();}
        else if(event.key==='Escape')gesture.cancel();
      });
      button.addEventListener('keyup',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();const result=gesture.end();blockedClick=Date.now()+300;if(result==='tap')execute();}});
      button.addEventListener('blur',()=>gesture.cancel());return button;
    }));
  }
  function fields(){const action=$('padAction').value;$('padEffectField').hidden=!['toggle','on','off'].includes(action);$('padSceneField').hidden=action!=='scene';$('padPresetField').hidden=action!=='preset';}
  function open(index){if(ctx.stage.busy){ctx.toast('Espera a que termine la operación.');return;}editing=index;const pad=config[index];$('padConfigTitle').textContent=`Configurar pad ${index+1}`;$('padLabel').value=pad.label;$('padAction').value=pad.action;$('padBlock').value=pad.block||'DLY';$('padScene').value=pad.scene??0;$('padProgram').value=pad.program===undefined?'01A':`${String(Math.floor(pad.program/4)+1).padStart(2,'0')}${'ABCD'[pad.program%4]}`;fields();$('padConfig').showModal();}
  $('padAction').addEventListener('change',fields);
  $('padSave').addEventListener('click',()=>{try{const pad={label:$('padLabel').value,action:$('padAction').value};if(['toggle','on','off'].includes(pad.action))pad.block=$('padBlock').value;if(pad.action==='scene')pad.scene=Number($('padScene').value);if(pad.action==='preset')pad.program=slotProgram($('padProgram').value);const next=config.slice();next[editing]=validatePad(pad);localStorage.setItem('pads.v1',JSON.stringify(next));config=next;$('padConfig').close();render();}catch(error){ctx.toast(error.message,true);}});
  $('padCancel').addEventListener('click',()=>$('padConfig').close());
  $('padsSync').addEventListener('click',()=>ctx.stage.read());
  render();return {render};
}
