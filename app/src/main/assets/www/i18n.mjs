import messages,{spanish} from './translations.mjs';

export const LANGUAGES=['en','es'];
let language='en';
try{const saved=globalThis.localStorage?.getItem('language');if(LANGUAGES.includes(saved))language=saved;}catch{}
export const getLanguage=()=>language;
export function t(source,...values){
  const key=Array.isArray(source)?source.reduce((text,part,index)=>text+(index?`{${index-1}}`:'')+part,''):source;
  const translated=language==='en'?(messages[key]??key):(spanish[key]??key);
  return String(translated).replace(/\{(\d+)\}/g,(match,index)=>index<values.length?String(values[index]):match);
}
export function setLanguage(value){
  if(!LANGUAGES.includes(value))throw new Error('Unsupported language');
  if(language===value)return;
  try{globalThis.localStorage?.setItem('language',value);}catch{}
  language=value;globalThis.dispatchEvent?.(new Event('languagechange'));
}
export function applyTranslations(root=document){
  document.documentElement.lang=language;
  for(const el of root.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
  for(const attr of ['aria-label','aria-description','placeholder']){
    for(const el of root.querySelectorAll(`[data-i18n-${attr}]`))el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`)));
  }
}
