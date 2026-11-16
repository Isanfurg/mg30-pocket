import catalog from './patch-catalog.mjs';
import { PatchDocument } from './patch-editor.mjs';
import { gearArt } from './gear-art.mjs';
import { MidiStream, cc, pc, validateMapping, sceneController } from './midi.mjs';
import { toBase64, fromBase64, restoreDraft } from './session.mjs';
import { NuxLink } from './nux.mjs';
import { createStage } from './stage.mjs';
import { createPads } from './pads.mjs';

const $ = id => document.getElementById(id);
const native = window.PocketNative;
let doc, program, scene = 'S1', block = 'AMP', filename = '', dirty = false, saveTimer, toastTimer;
let devices = [], connection = { connected: false }, liveProgram = null, liveScene = null, logs = [], received = {};
let mapping = { channel: 1, sceneCC: null, effects: [] };
let stage;
let pads;
const nux = new NuxLink(bytes => { if(!native || !connection.send || !connection.receive) throw new Error('Conecta envío y recepción USB MIDI.'); native.sendNux(JSON.stringify(bytes)); });
try { const saved = localStorage.getItem('mapping'); if (saved) mapping = validateMapping(JSON.parse(saved)); } catch { /* Ignore incompatible old settings. */ }
const effectBlocks = ['WAH','GATE','CMP','EFX','AMP','IR','EQ','MOD','DLY','RVB','VOL','SR'];
const current = () => doc?.describe(program);
const selectedScene = () => current()?.scenes[Number(scene[1]) - 1];
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8000 : 4500);
}
function safe(fn) { return (...args) => { try { return fn(...args); } catch (error) { toast(error.message, true); } }; }
function action(id, fn) { $(id).addEventListener('click', safe((...args) => { if(stage?.busy) throw new Error('Espera a que termine la operación NUX.'); return fn(...args); })); }
function draft() { return { version: 1, name: filename, original: toBase64(doc.original), edited: toBase64(doc.exportAll()), program, scene, dirty }; }
function persist() {
  clearTimeout(saveTimer);
  if (!doc) return;
  try {
    const data = JSON.stringify(draft());
    if (native) native.saveDraft(data);
    else { localStorage.setItem('draft', data); $('localState').textContent = dirty ? 'Borrador guardado · sin exportar' : 'Archivo local'; }
  } catch (error) { toast(`No se pudo conservar el borrador: ${error.message}`, true); }
}
function changed() { dirty = true; $('localState').textContent = 'Cambios locales · guardando…'; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); }
function loadDocument(bytes, name) {
  const next = new PatchDocument(bytes);
  if (dirty && !confirm('Hay cambios locales. ¿Reemplazar el documento? Elige Cancelar para exportarlos primero.')) return;
  doc = next; filename = name; program = doc.presets[0].program; scene = 'S1'; dirty = false;
  render(); persist(); toast(`Importados ${doc.presets.length} preset(s). No se ha enviado nada a la NUX.`);
}
function render() {
  document.body.classList.toggle('has-document', Boolean(doc));
  if (doc) $('editorTitle').textContent = 'Editor de escenas';
  $('welcome').hidden = Boolean(doc); $('workspace').hidden = !doc;
  $('sendPreset').disabled = !doc || !connection.send; $('sendScene').disabled = !doc || !connection.send || mapping.sceneCC === null;
  if (!doc) return;
  $('fileName').textContent = `${filename} · ${doc.presets.length} preset(s)`;
  $('preset').replaceChildren(...doc.presets.map(p => { const option = el('option', `${p.slot} · ${doc.describe(p.program).name}`); option.value = p.program; return option; }));
  $('preset').value = program;
  document.querySelectorAll('[data-scene]').forEach(button => button.classList.toggle('active', button.dataset.scene === scene));
  $('tempo').value = selectedScene().bpm;
  $('localState').textContent = dirty ? 'Borrador local · sin exportar' : 'Archivo local';
  $('exportBank').disabled = doc.presets.length !== 128;
  renderChain(); renderBlock();
}
function renderChain() {
  $('chain').replaceChildren(...selectedScene().chain.map(key => {
    const data = selectedScene().blocks[key];
    const button = el('button', undefined, `block-card${key === block ? ' selected' : ''}${data.enabled ? '' : ' bypass'}`);
    button.setAttribute('aria-label', `${key}, ${data.enabled ? 'activo' : 'bypass'}, editar archivo`);
    button.setAttribute('aria-pressed', String(key === block));
    button.append(gearArt(key, data.modelId));
    const title = el('strong'); title.append(el('span', '', 'led'), document.createTextNode(key));
    button.append(title, el('small', modelName(key, data)));
    button.addEventListener('click', () => { block = key; renderChain(); renderBlock(); });
    return button;
  }));
  const chain = $('chain'), active = chain.querySelector('.selected');
  if (active && chain.scrollWidth > chain.clientWidth) chain.scrollLeft = active.offsetLeft - chain.offsetLeft - (chain.clientWidth - active.clientWidth) / 2;
}
function modelName(key, data) {
  if (key === 'IR' && new DataView(doc.record(program).buffer).getUint32(430, true) === 1) return 'IR de usuario · preservado';
  return data.model.replace(/^\d+\.\s*/, '');
}
function renderBlock() {
  const data = selectedScene().blocks[block], root = $('blockEditor'); root.replaceChildren();
  const header = el('div', undefined, 'block-header'), details = el('div');
  details.append(el('span', `${block} · ${scene} · ARCHIVO LOCAL`, 'eyebrow'), el('h2', modelName(block, data)));
  header.append(gearArt(block, data.modelId), details); root.append(header);
  const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = data.enabled;
  const toggle = el('label', undefined, 'inline'); toggle.append(enabled, document.createTextNode('Activo en este archivo'));
  enabled.addEventListener('change', safe(() => { doc.setEnabled(program, scene, block, enabled.checked); changed(); renderChain(); })); root.append(toggle);
  // IR assets and switch-encoded controls are deliberately preserved, never inferred from a model ID.
  if (block === 'IR') { root.append(el('p', 'El recurso IR y sus controles se conservan. Esta versión no sustituye IR ni interpreta sus cortes especiales.', 'notice')); return; }
  let model;
  try { model = doc.model(program, scene, block); } catch { root.append(el('p', 'Modelo sin mapear. Sus bytes se conservan al exportar.', 'notice')); return; }
  const choices = catalog.models.filter(m => m.block === block && !m.special && m.parameters.length && m.parameters.every(p => p.editable && p.index < catalog.layout[block].capacity && Number.isInteger(p.default) && p.default >= p.min && p.default <= p.max));
  if (choices.length) {
    const label = el('label', 'Modelo del efecto'); const select = el('select');
    if (!choices.some(m => m.id === model.id)) { const option = el('option', model.name); option.value = model.id; select.append(option); }
    for (const candidate of choices) { const option = el('option', candidate.name); option.value = candidate.id; select.append(option); }
    select.value = model.id; label.append(select); root.append(label);
    select.addEventListener('change', safe(() => { doc.setModel(program, scene, block, Number(select.value)); changed(); renderChain(); renderBlock(); }));
  }
  const parameters = el('div', undefined, 'parameters');
  for (const parameter of model.parameters) {
    const value = data.parameters.find(p => p.name === parameter.name)?.value;
    const label = el('label'), head = el('span', undefined, 'parameter-head'), output = el('output', String(value));
    head.append(document.createTextNode(parameter.name), output); label.append(head);
    const range = el('input'); range.type = 'range'; range.min = parameter.min; range.max = parameter.max; range.step = 1; range.value = value;
    range.disabled = !parameter.editable || (block === 'DLY' && data.subdivision && parameter.name === 'D.TIME');
    range.setAttribute('aria-label', parameter.name);
    range.addEventListener('input', safe(() => { doc.setParameter(program, scene, block, parameter.name, Number(range.value)); output.value = range.value; changed(); }));
    label.append(range); parameters.append(label);
  }
  root.append(parameters);
  if (block === 'DLY' && model.id === 2) {
    root.append(el('p', data.subdivision ? 'Corchea con puntillo · marca negras con TAP en la NUX. Verifica SUB tras importar.' : 'Tiempo de delay según el archivo.', 'notice'));
    const dotted = el('button', 'Usar corchea con puntillo', 'secondary');
    dotted.addEventListener('click', safe(() => { doc.setDottedEighth(program, scene); changed(); renderBlock(); })); root.append(dotted);
  }
}
function exportFile(all) {
  const bytes = all ? doc.exportAll() : doc.exportPreset(program);
  const name = all ? 'MG30-banco-editado.mg30patch' : `${current().slot} ${current().name}-editado.mg30patch`;
  if (native) native.saveFile(name, toBase64(bytes));
  else {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = el('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Archivo preparado para descargar. El borrador sigue conservado.');
  }
}
function promptValue(title, initial, max = 16) {
  return new Promise(resolve => {
    const dialog = $('promptDialog'); $('promptTitle').textContent = title; $('promptLabel').textContent = title; $('promptInput').maxLength = max; $('promptInput').value = initial;
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? $('promptInput').value : null), { once: true }); dialog.showModal();
  });
}
action('import', () => { if (native) native.openFile(); else $('browserFile').click(); });
$('browserFile').addEventListener('change', async () => {
  const file = $('browserFile').files[0];
  try { if (!file) return; if (file.size > 9902 * 128) throw new Error('Archivo demasiado grande.'); if(file.name.endsWith('.json')){showStage();await stage.importBank(JSON.parse(await file.text()));}else loadDocument(new Uint8Array(await file.arrayBuffer()), file.name); }
  catch (error) { toast(error.message, true); } finally { $('browserFile').value = ''; }
});
action('demo', () => {
  const bytes = new Uint8Array(9902);
  for (let j = 0; j < 3; j++) {
    const base = 4 + j * 142;
    bytes.set([0,5,1,2,3,9,4,10,11,6,7,8], base + 94); bytes.set(new TextEncoder().encode('POCKET DEMO'), base + 106); bytes[base + 92] = 120;
    for (const [key, layout] of Object.entries(catalog.layout)) {
      const model = catalog.models.find(m => m.block === key && m.id === (key === 'AMP' ? 9 : key === 'DLY' || key === 'RVB' ? 2 : 1));
      bytes[base + layout.model_offset] = model?.id || 1;
      for (const p of model?.parameters || []) if (p.editable && p.index < layout.capacity) bytes[base + layout.parameter_offset + p.index] = p.default;
    }
  }
  loadDocument(bytes, 'Demostración · no calibrada para tocar');
});
$('preset').addEventListener('change', safe(() => { program = Number($('preset').value); render(); persist(); }));
document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => { scene = button.dataset.scene; render(); persist(); }));
$('tempo').addEventListener('change', safe(() => { doc.setTempo(program, scene, Number($('tempo').value)); changed(); }));
action('rename', async () => { const name = await promptValue('Nombre (ASCII, hasta 16 caracteres)', current().name); if (name !== null) safe(() => { doc.rename(program, name); changed(); render(); })(); });
action('copyScene', async () => { const target = await promptValue(`Copiar ${scene} a S1, S2 o S3`, scene, 2); if (target !== null) safe(() => { if (target === scene) throw new Error('Elige otra escena.'); if (!['S1','S2','S3'].includes(target)) throw new Error('Escena no válida.'); if (!confirm(`¿Reemplazar ${target} con ${scene} en el archivo?`)) return; doc.copyScene(program, scene, target); changed(); toast(`Copiada ${scene} a ${target}.`); })(); });
action('exportPreset', () => exportFile(false)); action('exportBank', () => exportFile(true));
action('reset', () => { if (confirm('¿Restaurar este preset al archivo original importado?')) { doc.reset(program); changed(); render(); } });
function showView(midi) { if(midi){if(!$('settingsDialog').open)$('settingsDialog').showModal();return;}if($('settingsDialog').open)$('settingsDialog').close();document.body.classList.remove('stage-mode');$('stageView').hidden=true;$('padsView').hidden=true;$('editorView').hidden=false;$('stageTab').classList.add('active');$('padsTab').classList.remove('active');window.scrollTo(0,0); }
function showStage(){ document.body.classList.add('stage-mode');$('editorView').hidden=true;$('padsView').hidden=true;$('stageView').hidden=false;$('padsTab').classList.remove('active');$('stageTab').classList.add('active');stage?.show();window.scrollTo(0,0); }
function showPads(){document.body.classList.add('stage-mode');$('stageView').hidden=true;$('editorView').hidden=true;$('padsView').hidden=false;$('stageTab').classList.remove('active');$('padsTab').classList.add('active');pads?.render();window.scrollTo(0,0);}
action('editorTab', () => showView(false)); action('midiTab', () => showView(true));
action('stageTab',showStage);
action('padsTab',showPads);action('settingsOpen',()=>showView(true));action('settingsClose',()=>$('settingsDialog').close());
window.pocketBack = () => { if(stage?.busy){toast('Espera a que termine la operación NUX.');return;}if($('padConfig').open){$('padConfig').close();return;}if($('settingsDialog').open){$('settingsDialog').close();return;}if($('stageEditor').open){$('stageEditorClose').click();return;}if($('transferDialog').open){$('transferCancel').click();return;}if ($('promptDialog').open) $('promptDialog').close('cancel'); else { persist(); toast('Borrador conservado. Usa Inicio para salir.'); } };

function renderDevices() {
  const previous = $('devices').value;
  $('devices').replaceChildren(...devices.map(device => { const option = el('option', device.name); option.value = device.id; return option; }));
  if (!devices.length) $('devices').append(el('option', native ? 'Sin dispositivos USB MIDI' : 'USB MIDI disponible en la APK Android'));
  if (devices.some(d => String(d.id) === previous)) $('devices').value = previous;
  renderPorts(); $('connect').disabled = !native || !devices.length;
}
function renderPorts() {
  const device = devices.find(d => String(d.id) === $('devices').value);
  for (const [id, type] of [['sendPort',1],['receivePort',2]]) {
    const select = $(id), none = el('option', 'No usar'); none.value = -1; select.replaceChildren(none);
    for (const port of device?.ports.filter(p => p.type === type) || []) { const option = el('option', port.name || `Puerto ${port.number + 1}`); option.value = port.number; select.append(option); }
    if (select.options.length > 1) select.selectedIndex = 1;
  }
}
$('devices').addEventListener('change', renderPorts);
action('refreshDevices', () => native?.devices());
action('connect', () => native?.connectMidi(Number($('devices').value), Number($('sendPort').value), Number($('receivePort').value)));
action('disconnect', () => native?.disconnectMidi());
function renderMapping() {
  $('channel').value = mapping.channel; $('sceneCC').value = mapping.sceneCC ?? '';
  $('mappingRows').replaceChildren(...effectBlocks.map(key => {
    const row = el('div', undefined, 'mapping-row'), saved = mapping.effects.find(m => m.block === key);
    row.dataset.block = key; row.append(el('strong', key));
    for (const [field, title, fallback] of [['cc','CC',''],['off','OFF',0],['on','ON',127]]) {
      const label = el('label', title), input = el('input'); input.type = 'number'; input.min = 0; input.max = field === 'cc' ? 119 : 127; input.value = saved?.[field] ?? fallback; input.dataset.field = field; input.setAttribute('aria-label', `${key} ${title}`); label.append(input); row.append(label);
    }
    return row;
  })); renderLiveEffects();
}
action('saveMapping', () => {
  const next = { channel: Number($('channel').value), sceneCC: $('sceneCC').value === '' ? null : Number($('sceneCC').value), effects: [] };
  for (const row of $('mappingRows').children) {
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    if (value('cc') === '') continue;
    next.effects.push({ block: row.dataset.block, cc: Number(value('cc')), off: value('off') === '' ? NaN : Number(value('off')), on: value('on') === '' ? NaN : Number(value('on')) });
  }
  validateMapping(next); localStorage.setItem('mapping', JSON.stringify(next)); mapping = next; received = {}; stream.reset(); liveProgram = null; liveScene = null; renderLive(); render(); toast('Mapeo guardado. No se envió ningún mensaje.');
});
function log(direction, bytes) {
  logs.unshift(`${new Date().toLocaleTimeString()} ${direction} ${bytes.slice(0,20).map(n => n.toString(16).padStart(2,'0').toUpperCase()).join(' ')}${bytes.length>20?` … (${bytes.length} bytes)`:''}`);
  logs = logs.slice(0, 80); $('midiLog').textContent = logs.join('\n');
}
function send(bytes) { if(stage?.busy||nux.busy)throw new Error('Operación NUX en curso.');if (!connection.send || !native) throw new Error('Conecta un puerto de envío MIDI desde Android.'); native.sendMidi(JSON.stringify(bytes)); }
action('sendPreset', () => { if (!doc) return; send(pc(mapping.channel, program)); });
action('sendScene', () => { if (!doc || mapping.sceneCC === null) throw new Error('Configura primero el CC de escena.'); send(cc(mapping.channel, mapping.sceneCC, Number(scene[1])-1)); });
function renderLiveEffects() {
  $('liveEffects').replaceChildren();
  if (!mapping.effects.length) { $('liveEffects').append(el('p', 'Añade los CC de tus efectos en «Configurar canal y controles».', 'muted')); return; }
  for (const effect of mapping.effects) {
    const row = el('div', undefined, 'live-effect'), title = el('div'); title.append(el('strong', ({DLY:'Delay',RVB:'Reverb',EFX:'Overdrive',AMP:'Amplificador',MOD:'Modulación',CMP:'Compresor'})[effect.block]||effect.block), el('small', `CC ${effect.cc} · ${received[effect.block] === undefined ? 'Estado no recibido' : received[effect.block] ? 'ON recibido' : 'OFF recibido'}`));
    const buttons = el('div', undefined, 'actions');
    for (const [text, value] of [['Enviar OFF',effect.off],['Enviar ON',effect.on]]) {
      const button = el('button', text, 'secondary'); button.disabled = !connection.send;
      button.addEventListener('click', safe(() => send(cc(mapping.channel, effect.cc, value)))); buttons.append(button);
    }
    row.append(title, buttons); $('liveEffects').append(row);
  }
}
function renderLive() {
  $('livePreset').textContent = liveProgram === null ? '—' : `${String(Math.floor(liveProgram/4)+1).padStart(2,'0')}${'ABCD'[liveProgram%4]}`;
  $('liveScene').textContent = `${liveScene || 'Escena sin recibir'}${liveProgram !== null && doc?.records.has(liveProgram) ? ` · ${doc.describe(liveProgram).name}` : liveProgram !== null ? ' · Preset no importado' : ''}`;
  renderLiveEffects();
}
const stream = new MidiStream(bytes => {
  log('RX', bytes);
  if ((bytes[0] & 15) !== mapping.channel - 1) return;
  if ((bytes[0] & 240) === 192) { liveProgram = bytes[1]; liveScene = null; received = {}; if(!stage?.busy)stage?.follow(); }
  if ((bytes[0] & 240) === 176) {
    // Passive follow uses the observed MG-30 scene CC when no custom mapping exists.
    if (bytes[1] === sceneController(mapping) && bytes[2] <= 2) { liveScene = `S${bytes[2]+1}`; received = {}; }
    if(!stage?.busy && (bytes[1]<=10 || (bytes[1]===sceneController(mapping)&&bytes[2]<=2)))stage?.follow();
    for (const effect of mapping.effects) if (bytes[1] === effect.cc && [effect.on,effect.off].includes(bytes[2])) received[effect.block] = bytes[2] === effect.on;
  }
  renderLive();
  if ($('follow').checked && liveProgram !== null && doc?.records.has(liveProgram)) { program = liveProgram; if (liveScene) scene = liveScene; render(); }
}, message=>{log('RX',message);nux.receive(message);});
window.pocketEvent = safe((type, data) => {
  if (type === 'file') loadDocument(fromBase64(data.base64), data.name);
  if (type === 'error') {nux.disconnect();stage?.invalidate();toast(data.message, true);}
  if (type === 'saved') toast('Archivo exportado. Borrador conservado; no se ha cargado en la NUX.');
  if (type === 'draftSaved' && doc) $('localState').textContent = dirty ? 'Borrador guardado · sin exportar' : 'Archivo local';
  if (type === 'devices') { devices = data; renderDevices(); }
  if (type === 'connection') { connection = data;nux.disconnect();stage?.invalidate(); received = {}; liveProgram = null; liveScene = null; stream.reset(); $('midiStatus').textContent = data.message; $('connectionBadge').textContent = data.connected ? 'USB MIDI' : 'SIN CONEXIÓN'; $('connectionBadge').classList.toggle('connected', data.connected); renderLive(); render(); }
  if (type === 'midi') stream.push(data);
  if (type === 'sent') {
    log('TX', data);
    if(stage?.busy || data[0]===240 || !$('stageView').hidden || !$('padsView').hidden)return;
    if ((data[0] & 240) === 192 || ((data[0] & 240) === 176 && data[1] === mapping.sceneCC)) received = {};
    else for (const effect of mapping.effects) if (effect.cc === data[1]) delete received[effect.block];
    renderLiveEffects(); toast('Orden MIDI enviada. Ejecución en la NUX sin confirmar.');
  }
  if(type==='nuxBank'){showStage();stage.importBank(data.bank);}
  if(type==='nuxBackup')stage.exportBackup(data.bank);
  if(type==='resume' && connection.connected && !stage?.busy)stage?.follow();
  if (type === 'draft' && !doc) { doc = restoreDraft(data); filename = data.name; program = doc.records.has(data.program) ? data.program : doc.presets[0].program; scene = ['S1','S2','S3'].includes(data.scene) ? data.scene : 'S1'; dirty = Boolean(data.dirty); render(); toast('Borrador recuperado.'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
renderMapping(); renderDevices(); render();
stage=createStage({native,link:nux,changed:()=>pads?.render(),document:()=>doc,program:()=>program,connection:()=>connection,channel:()=>mapping.channel,sceneCC:()=>mapping.sceneCC,prompt:promptValue,toast,connectView:()=>showView(true),send:bytes=>{if(!native||!connection.send)throw new Error('Conecta MIDI.');native.sendMidi(JSON.stringify(bytes));}});
pads=createPads({stage,toast});
showStage();
if (native) { native.ready(); native.loadDraft(); }
else { try { const saved = localStorage.getItem('draft'); if (saved) window.pocketEvent('draft', JSON.parse(saved)); } catch (error) { toast(`Borrador no recuperado: ${error.message}`, true); } }
