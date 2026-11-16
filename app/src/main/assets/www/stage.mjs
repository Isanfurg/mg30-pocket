import catalog from './patch-catalog.mjs';
import { NAMES, PROFILE, liveSwitch, liveParameter, validateBank, describeParts, decodeScene } from './nux.mjs';
import { cc, pc } from './midi.mjs';
import { gearArt } from './gear-art.mjs';
import { toBase64 } from './session.mjs';

export function createStage(ctx) {
  const $=id=>document.getElementById(id), link=ctx.link, api={busy:false};
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let selectedBlock, pendingPlan, backupId='', dirtyLive=false, knobTimer, parameterJobs=Promise.resolve(), shown=false;
  let labels={};try{labels=JSON.parse(localStorage.getItem('sceneLabels')||'{}');}catch{}
  const profile=()=>$('stageProfile').checked;
  const parameterNames={'E.LEVEL':'Mezcla','F.BACK':'Repeticiones','D.TIME':'Tiempo',DECAY:'Cola',LEVEL:'Nivel',GAIN:'Ganancia',DRIVE:'Drive',TONE:'Tono','PRE.D':'Predelay',LIVELINESS:'Brillo',MASTER:'Master',BASS:'Graves',MIDDLE:'Medios',TREB:'Agudos',PRES:'Presencia',SUSTAIN:'Sustain'};
  const snapshot=()=>link.snapshot;
  const current=()=>snapshot()?.preset;
  const enabled=()=>ctx.connection().send&&ctx.connection().receive&&profile()&&Boolean(snapshot())&&!api.busy;
  const text=message=>{$('stageStatus').textContent=message;};
  const progress=(done,total)=>{$('stageTransfer').textContent=`${done}/${total} presets · mantén USB conectado y la app visible`;};
  function controls(){document.querySelectorAll('#stageView button,#stageEditor input,#stageEditorClose').forEach(b=>{b.disabled=api.busy;});for(const id of ['stageTab','padsTab','editorTab','midiTab','padsSync'])$(id).disabled=api.busy;for(const id of ['stageSave','stageUploadOne','stageUploadAll','stageBackup','stageImportBank'])$(id).disabled=true;}
  async function run(work){if(api.busy){ctx.toast('Espera a que termine la operación.',true);return;}api.busy=true;controls();render();try{return await work();}catch(error){link.snapshot=null;if($('stageEditor').open)$('stageEditor').close();text(error.message);ctx.toast(error.message,true);}finally{api.busy=false;controls();render();}}
  function bind(id,work){$(id).addEventListener('click',()=>run(work));}
  async function refresh(){await parameterJobs;const value=await link.refresh();text(`NUX ${link.identity.firmware} · valores leídos por USB${dirtyLive?' · cambios en vivo sin guardar':''}`);render();return value;}
  function requireLive(){if(!enabled())throw new Error('Lee la NUX y habilita su mapeo predeterminado antes de controlar en vivo.');}
  async function channel(bytes){ctx.send(bytes);await new Promise(resolve=>setTimeout(resolve,90));}
  async function changeScene(target){requireLive();return run(async()=>{await channel(cc(ctx.channel(),ctx.sceneCC()??80,target));await refresh();if(snapshot().scene!==target)throw new Error('Escena sin confirmar. Revisa el CC de escena.');});}
  function render(){
    ctx.changed?.();
    const state=snapshot(), preset=state?.preset, available=enabled();
    document.body.classList.toggle('stage-ready',Boolean(state));
    $('stagePreset').textContent=preset?`${preset.slot} · ${preset.name}`:'Sin preset leído';
    $('stageScenes').replaceChildren(...[0,1,2].map(i=>{
      const button=make('button',undefined,`stage-scene${state?.scene===i?' active':''}`);
      button.append(make('strong',`S${i+1}`),make('span',labels[state?.program]?.[i]||['Base','Crecimiento','Solo'][i]));
      button.disabled=!available;button.setAttribute('aria-pressed',String(state?.scene===i));button.addEventListener('click',()=>changeScene(i).catch(e=>ctx.toast(e.message,true)));return button;
    }));
    $('stagePedals').replaceChildren();
    if(!preset){$('stagePedals').append(make('p','Lee la NUX para ver los pedales reales del preset. No hace falta importar un archivo.','muted'));return;}
    const data=preset.scenes[state.scene];
    for(const key of ['EFX','DLY','RVB','MOD','CMP','AMP','EQ','WAH','GATE','IR','SR'].filter(k=>PROFILE[k]&&data.blocks[k])){
      const effect=data.blocks[key], special=Boolean(decodeScene(state.parts[state.scene])[catalog.layout[key].model_offset]&128),card=make('article',undefined,`stage-pedal${effect.enabled?' is-on':''}`);
      const open=make('button',undefined,'stage-open');open.append(gearArt(key,effect.modelId),make('strong',NAMES[key]),make('small',effect.model.replace(/^\d+\.\s*/,'')));
      open.disabled=!available||special;open.addEventListener('click',()=>openEditor(key));
      const toggle=make('button',special?'Control especial':effect.enabled?'Apagar':'Encender','stage-toggle');toggle.setAttribute('aria-label',`${effect.enabled?'Apagar':'Encender'} ${NAMES[key]}`);toggle.disabled=!available||special;
      toggle.addEventListener('click',()=>{if(!enabled())return;run(async()=>{
        const desired=!effect.enabled;await channel(liveSwitch(ctx.channel(),key,effect.modelId,desired));dirtyLive=true;await refresh();
        const read=current().scenes[snapshot().scene].blocks[key];if(read.enabled!==desired||read.modelId!==effect.modelId)throw new Error('El cambio no coincide al leer. Revisa el mapeo MIDI.');
      });});
      card.append(open,toggle);$('stagePedals').append(card);
    }
  }
  function openEditor(key){selectedBlock=key;renderEditor();$('stageEditor').showModal();}
  function renderEditor(){
    const state=snapshot();if(!state)return;
    const effect=state.preset.scenes[state.scene].blocks[selectedBlock];
    $('stageEditorTitle').textContent=`${NAMES[selectedBlock]} · S${state.scene+1}`;
    $('stageEditorState').textContent='Los sliders cambian la NUX por MIDI y se releen al soltar. Los ajustes son temporales; el guardado sigue pausado por compatibilidad.';
    $('stageParameters').replaceChildren();
    const model=catalog.models.find(m=>m.block===selectedBlock&&m.id===effect.modelId);
    if(!model||!['CMP','EFX','AMP','EQ','GATE','MOD','DLY','RVB'].includes(selectedBlock)){$('stageParameters').append(make('p','Controles especiales conservados: no se interpretan como parámetros numéricos.','muted'));return;}
    for(const p of model.parameters.filter(p=>p.editable&&p.min>=0&&p.max<=100)){
      if(selectedBlock==='DLY'&&p.name==='D.TIME'&&effect.subdivision)continue;
      const value=effect.parameters.find(x=>x.name===p.name)?.value;if(!Number.isInteger(value)||value>100)continue;
      const label=make('label'),head=make('span',undefined,'parameter-head'),output=make('output',String(value)),range=make('input');
      head.append(document.createTextNode(parameterNames[p.name]||p.name),output);range.type='range';range.min=p.min;range.max=p.max;range.step=1;range.value=value;range.setAttribute('aria-label',`${NAMES[selectedBlock]} ${parameterNames[p.name]||p.name}`);
      const captured={program:state.program,scene:state.scene,block:selectedBlock,model:effect.modelId};
      const flush=()=>{clearTimeout(knobTimer);const wanted=Number(range.value);
        parameterJobs=parameterJobs.then(async()=>{
          const now=snapshot();if(!profile()||!now||now.program!==captured.program||now.scene!==captured.scene||now.preset.scenes[now.scene].blocks[captured.block].modelId!==captured.model)throw new Error('La selección cambió: slider cancelado.');
          await channel(liveParameter(ctx.channel(),captured.block,p.index,wanted));dirtyLive=true;
        }).catch(e=>{$('stageEditorState').textContent=e.message;});return parameterJobs;
      };
      range.addEventListener('input',()=>{if(api.busy)return;output.value=range.value;clearTimeout(knobTimer);knobTimer=setTimeout(flush,100);$('stageEditorState').textContent='Enviando ajuste · pendiente de relectura';});
      range.addEventListener('change',async()=>{if(api.busy)return;range.disabled=true;try{await flush();await run(async()=>{await refresh();const got=current().scenes[snapshot().scene].blocks[captured.block].parameters.find(x=>x.name===p.name)?.value;$('stageEditorState').textContent=got===Number(range.value)?'Ajuste confirmado por relectura · sin guardar':'El valor no coincide al leer: revisa el mapeo MIDI.';if(got!==Number(range.value))range.value=output.value=got;});}finally{range.disabled=false;}});
      label.append(head,range);$('stageParameters').append(label);
    }
  }
  function exportBank(bank,name='MG30-respaldo.mg30bank.json'){validateBank(bank);ctx.native.saveFile(name,toBase64(new TextEncoder().encode(JSON.stringify(bank))));}
  async function remember(bank){const id=ctx.native?.storeNuxBackup(JSON.stringify(bank));if(!id)throw new Error('No se pudo guardar el respaldo previo: no se permite escribir.');backupId=id;return id;}
  async function review(plan){
    pendingPlan=plan;await remember(plan.backup);
    $('transferSummary').textContent=`${plan.bank.records.length} destino(s) · firmware ${plan.bank.firmware}. Respaldo previo guardado en la tablet.`;
    $('transferSlots').textContent=plan.bank.records.map(r=>{const p=describeParts(r.program,r.parts);return `${p.slot} · ${p.name}`;}).join('\n');
    $('transferAssets').checked=false;$('transferDialog').showModal();
  }
  async function prepareDocument(all){
    if(!ctx.native||!ctx.connection().receive||!ctx.connection().send)throw new Error('Conecta envío y recepción USB MIDI.');
    const document=ctx.document();if(!document)throw new Error('Importa primero un archivo en Archivos.');
    const targets=all?document.presets.map(p=>p.program):[ctx.program()];
    text('Leyendo destinos y guardando respaldo previo…');await review(await link.plan(document,targets,progress));
  }
  bind('stageSync',refresh);
  bind('stageConnect',()=>ctx.connectView());
  bind('stagePrevious',async()=>{if(!snapshot()||!profile())throw new Error('Lee la NUX y habilita el perfil.');await channel(pc(ctx.channel(),Math.max(0,snapshot().program-1)));await refresh();});
  bind('stageNext',async()=>{if(!snapshot()||!profile())throw new Error('Lee la NUX y habilita el perfil.');await channel(pc(ctx.channel(),Math.min(127,snapshot().program+1)));await refresh();});
  bind('stageNames',async()=>{
    if(!snapshot())throw new Error('Lee un preset primero.');const program=snapshot().program,values=[];
    for(let i=0;i<3;i++){const answer=await ctx.prompt(`Nombre de S${i+1}`,labels[program]?.[i]||['Base','Crecimiento','Solo'][i],20);if(answer===null)return;values.push(answer);}
    labels[program]=values;localStorage.setItem('sceneLabels',JSON.stringify(labels));render();
  });
  bind('stageUploadOne',()=>prepareDocument(false));bind('stageUploadAll',()=>prepareDocument(true));
  bind('stageSave',async()=>{
    if(!snapshot())throw new Error('Lee la NUX primero.');await refresh();
    const backup=await link.exclusive(()=>link.backup([snapshot().program],progress));
    if(!link.snapshot||backup.editBuffer.program!==snapshot().program)throw new Error('Cambió el preset. Lee de nuevo.');
    const program=backup.editBuffer.program,parts=backup.editBuffer.parts.map(p=>{const copy=p.slice();copy[3]=11;return copy;});
    await review({backup,bank:validateBank({...backup,records:[{program,parts}]}),epoch:link.epoch});
  });
  bind('stageBackup',async()=>{const bank=await link.exclusive(()=>link.backup(Array.from({length:128},(_,i)=>i),progress));await remember(bank);exportBank(bank);text('Respaldo de ajustes leído. No incluye archivos IR/NAM.');});
  bind('stageImportBank',()=>ctx.native?.openFile());
  bind('stageLastBackup',()=>ctx.native?.lastNuxBackup());
  $('transferCancel').addEventListener('click',()=>{pendingPlan=null;$('transferDialog').close();});
  $('transferConfirm').addEventListener('click',()=>{
    if(!$('transferAssets').checked){ctx.toast('Confirma primero la disponibilidad de los IR/NAM en los destinos.',true);return;}
    const plan=pendingPlan;if(!plan)return;pendingPlan=null;$('transferDialog').close();
    run(async()=>{
      await link.upload(plan,async()=>{const id=await remember(plan.backup);if(!ctx.native.armNuxTransfer(id))throw new Error('La escritura no se habilitó.');},async()=>ctx.native.endNuxTransfer(),progress);
      dirtyLive=false;await refresh();$('stageTransfer').textContent='Carga terminada: partes confirmadas y ajustes releídos en todos los destinos.';
    });
  });
  $('stageEditorClose').addEventListener('click',async()=>{clearTimeout(knobTimer);await parameterJobs;$('stageEditor').close();});
  $('stageProfile').checked=localStorage.getItem('nuxProfile')==='true';
  $('stageProfile').addEventListener('change',()=>{localStorage.setItem('nuxProfile',String(profile()));render();});
  $('stageAwake').checked=localStorage.getItem('keepScreen')==='true';
  $('stageAwake').addEventListener('change',()=>{localStorage.setItem('keepScreen',String($('stageAwake').checked));ctx.native?.keepScreen($('stageAwake').checked);});
  ctx.native?.keepScreen($('stageAwake').checked);
  api.show=()=>{shown=true;render();};
  api.invalidate=()=>{link.snapshot=null;dirtyLive=false;clearTimeout(knobTimer);if($('stageEditor').open)$('stageEditor').close();render();};
  let followTimer;
  api.follow=()=>{api.invalidate();clearTimeout(followTimer);text('La selección cambió. Pulsa Leer NUX para actualizar; las consultas automáticas están pausadas por el aviso de compatibilidad.');};
  api.exportBackup=bank=>exportBank(bank,'MG30-previo-a-carga.mg30bank.json');
  api.importBank=()=>ctx.toast('Carga de bancos pausada hasta resolver la compatibilidad.',true);
  api.state=()=>snapshot();
  api.read=()=>run(refresh);
  api.executePad=pad=>{
    if(!enabled()){ctx.toast('Lee la NUX y habilita su perfil para ejecutar pads. Mantener pulsado sí permite configurarlos.',true);return;}
    if(pad.action==='scene')return changeScene(pad.scene);
    return run(async()=>{
      if(pad.action==='preset'){await channel(pc(ctx.channel(),pad.program));await refresh();if(snapshot().program!==pad.program)throw new Error('Preset sin confirmar.');return;}
      const effect=current().scenes[snapshot().scene].blocks[pad.block];
      if(!effect||decodeScene(snapshot().parts[snapshot().scene])[catalog.layout[pad.block].model_offset]&128)throw new Error('Bloque especial sin control live.');
      const desired=pad.action==='toggle'?!effect.enabled:pad.action==='on';
      await channel(liveSwitch(ctx.channel(),pad.block,effect.modelId,desired));dirtyLive=true;await refresh();
      const actual=current().scenes[snapshot().scene].blocks[pad.block];if(actual.enabled!==desired||actual.modelId!==effect.modelId)throw new Error('Cambio del pad sin confirmar. Revisa el mapeo MIDI.');
    });
  };
  api.isShown=()=>shown;
  render();return api;
}
