import catalog from './patch-catalog.mjs';
const ns = 'http://www.w3.org/2000/svg';
const colors = { CMP: '#d6c195', EFX: '#78ac60', AMP: '#c8ad7f', IR: '#8b9aa7', EQ: '#ccd2dd', GATE: '#a8b8bf', MOD: '#7a9cda', DLY: '#9a83d3', RVB: '#60b8c1', WAH: '#687683', VOL: '#667785', SR: '#a590bc' };
const finishes={
  EFX:{1:'#b89555',2:'#e6ded0',3:'#d6a053',4:'#df9e52',5:'#65a65c',6:'#598dc0',7:'#e0d8c0',8:'#b45045',9:'#af5d56',10:'#c09e6b',11:'#8b949c',12:'#ddd8cc',13:'#6b9eaf',14:'#c65b59',16:'#a378ad',17:'#c5a15d',18:'#6c9878',19:'#6f9cb8',20:'#c9844f'},
  DLY:{1:'#659d8d',2:'#c9d4dc',3:'#a592c9',4:'#b79a73',5:'#8a9dba',6:'#82b8c4',7:'#8c7bc1',8:'#b0c19a'},
  RVB:{1:'#7f9bb2',2:'#70afae',3:'#b5bdc7',4:'#c8a276',5:'#aa8ac9',6:'#70978e'},
  MOD:{1:'#93b8cf',2:'#7eabc8',3:'#87b0da',4:'#a29abd',5:'#99b9b2',6:'#a98bca',7:'#dba35f',8:'#d6ad6b',9:'#b4b9c2',10:'#909cba',11:'#a39c85',12:'#af8b68',13:'#bda0cd',14:'#6e9ebc',15:'#be9d65'}
};
export function gearIdentity(block,modelId){
  const model=catalog.models.find(m=>m.block===block&&m.id===modelId);
  return {color:finishes[block]?.[modelId]||colors[block]||'#8194a5',label:model?.name.replace(/^\d+\.\s*/,'')||block,knobs:Math.min(4,Math.max(1,model?.parameters.length||3))};
}
export function gearArt(block, modelId) {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 240 170'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('gear-art');
  const {color,label,knobs}=gearIdentity(block,modelId);
  const escaped=label.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const knob = (x, y, r = 8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#18212b" stroke="#8a98a4" stroke-width="2"/><path d="M${x} ${y - r + 2}v5" stroke="#f8f0d8" stroke-width="2"/>`;
  if (block === 'AMP' || block === 'IR') {
    const cloth = Array.from({ length: 12 }, (_, i) => `<path d="M27 ${76 + i * 5}h186" stroke="#7c7569" stroke-width="1" opacity=".45"/>`).join('');
    const diamonds = modelId === 8 || modelId === 9 ? Array.from({ length: 10 }, (_, i) => `<path d="M${20 + i * 22} 75l50 65m-50 0l50-65" stroke="#b6a57a" stroke-width="1" opacity=".45"/>`).join('') : '';
    svg.innerHTML = `<rect x="82" y="17" width="76" height="16" rx="7" fill="#11171e" stroke="#68717a" stroke-width="4"/><rect x="15" y="28" width="210" height="130" rx="9" fill="#24282b" stroke="${color}" stroke-width="4"/><rect x="26" y="40" width="188" height="28" rx="3" fill="${color}"/>${[45, 72, 99, 126, 153].map(x => knob(x, 54, 6)).join('')}<circle cx="197" cy="54" r="4" fill="#f4b461"/><rect x="26" y="75" width="188" height="66" rx="3" fill="#393a36"/>${cloth}${diamonds}<rect x="91" y="92" width="58" height="20" rx="3" fill="#24282b"/><text x="120" y="106" text-anchor="middle" font-size="7" font-family="sans-serif" fill="#f4e5c7">${escaped}</text><path d="M34 158v6m172-6v6" stroke="#11171e" stroke-width="7"/>`;
  } else if (block === 'EQ' || block === 'SR') {
    svg.innerHTML = `<rect x="23" y="37" width="194" height="104" rx="9" fill="#293340" stroke="${color}" stroke-width="3"/>${Array.from({ length: 7 }, (_, i) => { const x = 45 + i * 25, y = 81 + (i % 3 - 1) * 12; return `<path d="M${x} 58v61" stroke="#101923" stroke-width="5"/><rect x="${x - 7}" y="${y}" width="14" height="9" rx="2" fill="${color}"/>`; }).join('')}<circle cx="200" cy="48" r="3" fill="#87e4c3"/>`;
  } else if (block === 'WAH' || block === 'VOL') {
    svg.innerHTML = `<path d="M75 151L61 43q0-10 12-13l91-9q12 0 14 13l8 111q0 13-12 13H86q-10 0-11-7" fill="${color}" stroke="#a9b6bf" stroke-width="3"/><path d="M78 47l79-8 8 87-77 6z" fill="#202932"/>${Array.from({ length: 9 }, (_, i) => `<path d="M86 ${53 + i * 8}l68-6" stroke="#596571" stroke-width="3"/>`).join('')}`;
  } else {
    svg.innerHTML = `<rect x="72" y="20" width="98" height="138" rx="12" fill="${color}" stroke="#d0d9df" stroke-opacity=".5" stroke-width="2"/><rect x="65" y="58" width="7" height="21" rx="2" fill="#a2acb8"/><rect x="170" y="58" width="7" height="21" rx="2" fill="#a2acb8"/>${Array.from({length:knobs},(_,i)=>knob(knobs===1?121:88+i*66/(knobs-1),45,knobs===4?7:9)).join('')}<rect x="85" y="70" width="72" height="30" rx="4" fill="#14212a" fill-opacity=".75"/><text x="121" y="89" text-anchor="middle" font-size="8" font-weight="700" font-family="sans-serif" fill="#f0f5fa">${escaped}</text>${block==='DLY'&&modelId===4?'<g fill="none" stroke="#1c2935" stroke-width="2"><circle cx="103" cy="110" r="7"/><circle cx="139" cy="110" r="7"/><path d="M110 110h22"/></g>':block==='RVB'&&modelId===5?'<path d="M101 103v14m-7-7h14m31-7v14m-7-7h14" stroke="#f3e5ff" stroke-width="2"/>':'<circle cx="121" cy="111" r="3" fill="#e9f3bc"/>'}<circle cx="121" cy="135" r="11" fill="#c4ced7" stroke="#667480" stroke-width="3"/><circle cx="121" cy="135" r="6" fill="#e6edf1"/>`;
  }
  return svg;
}
