import {t} from './i18n.mjs';
import {buildAiRequest,applyAiProposal,parseAiResponse} from './ai-preset.mjs';
import {toBase64} from './session.mjs';

export function createAi(ctx){
  const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  let pending=null,preview=null,timer;
  function keyStatus(){const saved=Boolean(ctx.native?.hasAiKey?.());$('aiKeyStatus').textContent=saved?t('Clave guardada en este dispositivo.'):t('Sin clave API.');$('aiKeyDelete').disabled=!saved;}
  $('aiKeySave').addEventListener('click',()=>{
    const value=$('aiKey').value.trim();$('aiKey').value='';
    if(!ctx.native?.saveAiKey?.(value)){ctx.toast(t('No se pudo guardar la clave API.'),true);return;}keyStatus();
  });
  $('aiKeyDelete').addEventListener('click',()=>{if(!ctx.native?.clearAiKey?.()){ctx.toast(t('No se pudo borrar la clave API.'),true);return;}$('aiKey').value='';keyStatus();});
  function busy(value){$('aiGenerate').disabled=value;$('aiPrompt').disabled=value;$('aiApply').disabled=value||!preview;$('aiExport').disabled=value||!preview;}
  function open(){
    if(ctx.busy())return;
    if(!ctx.document()){ctx.openFiles();ctx.toast(t('Importa primero un archivo en Archivos.'));return;}
    if(!pending)$('aiStatus').textContent=t('Tres escenas desde tu preset actual.');
    if(!$('aiDialog').open)$('aiDialog').showModal();
  }
  for(const id of ['aiOpen','aiOpenLocal'])$(id).addEventListener('click',open);
  $('aiClose').addEventListener('click',()=>$('aiDialog').close());
  $('aiSettings').addEventListener('click',()=>{$('aiDialog').close();ctx.settings.open('general');$('aiKeyDetails').open=true;});
  $('aiGenerate').addEventListener('click',()=>{
    if(pending||ctx.busy())return;
    if(!ctx.native?.generateAi||!ctx.native.hasAiKey?.()){ctx.toast(t('Añade tu clave OpenAI en Ajustes.'),true);return;}
    try{
      const doc=ctx.document(),program=ctx.program(),request=buildAiRequest(doc,program,$('aiPrompt').value),source=doc.exportPreset(program),id=crypto.randomUUID();
      preview=null;pending={id,doc,program,source};$('aiPreview').replaceChildren();$('aiStatus').textContent=t('Creando tres escenas…');busy(true);
      timer=setTimeout(()=>{pending=null;busy(false);$('aiStatus').textContent=t('La IA no respondió. Intenta de nuevo.');},95000);
      ctx.native.generateAi(id,JSON.stringify(request));
    }catch(error){clearTimeout(timer);pending=null;busy(false);ctx.toast(error.message,true);}
  });
  function receive(data){
    if(!pending||pending.id!==data.requestId)return;
    const capture=pending;pending=null;clearTimeout(timer);
    try{
      if(data.error){const message={AI_NO_KEY:'Añade tu clave OpenAI en Ajustes.',AI_HTTP_401:'Clave API no válida.',AI_HTTP_429:'Límite de API. Revisa tus créditos.',AI_HTTP_400:'Solicitud rechazada por OpenAI.',AI_BUSY:'Ya hay una solicitud en curso.'}[data.error]||'No se pudo conectar con OpenAI.';throw new Error(t(message));}
      const proposal=parseAiResponse(data.response),result=applyAiProposal(capture.source,proposal);
      preview={...capture,result,proposal};
      const heading=make('h3',proposal.name),summary=make('p',proposal.summary,'muted'),scenes=make('div',undefined,'ai-scenes');
      for(const scene of proposal.scenes){const card=make('div',undefined,'ai-scene');card.append(make('strong',scene.scene),make('span',`${scene.bpm} BPM`),make('small',scene.blocks.filter(b=>b.enabled).map(b=>b.block).join(' · ')));scenes.append(card);}
      $('aiPreview').replaceChildren(heading,summary,scenes);$('aiStatus').textContent=t('Revisa el resultado antes de usarlo.');
    }catch(error){preview=null;$('aiStatus').textContent=error.message;ctx.toast(error.message,true);}finally{busy(false);}
  }
  function validPreview(){
    if(!preview||ctx.document()!==preview.doc||!preview.doc.records.has(preview.program))throw new Error(t('El preset cambió. Genera otra propuesta.'));
    const now=preview.doc.exportPreset(preview.program);if(now.length!==preview.source.length||now.some((v,i)=>v!==preview.source[i]))throw new Error(t('El preset cambió. Genera otra propuesta.'));
    return preview;
  }
  $('aiApply').addEventListener('click',()=>{
    if(ctx.busy())return;
    try{const value=validPreview();value.doc.records.set(value.program,value.result.slice());$('aiDialog').close();ctx.applied(value.program);preview=null;busy(false);ctx.toast(t('Preset listo en el editor local.'));}catch(error){ctx.toast(error.message,true);}
  });
  $('aiExport').addEventListener('click',()=>{
    try{
      const value=validPreview(),name=`${value.proposal.name}.mg30patch`;
      if(ctx.native)ctx.native.saveFile(name,toBase64(value.result));
      else{const url=URL.createObjectURL(new Blob([value.result]));const a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(error){ctx.toast(error.message,true);}
  });
  window.addEventListener('languagechange',()=>{keyStatus();$('aiStatus').textContent=pending?t('Creando tres escenas…'):preview?t('Revisa el resultado antes de usarlo.'):t('Tres escenas desde tu preset actual.');});keyStatus();busy(false);return {receive};
}
