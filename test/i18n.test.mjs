import test from 'node:test';
import assert from 'node:assert/strict';
import {t,getLanguage,setLanguage} from '../app/src/main/assets/www/i18n.mjs';
import {NAMES} from '../app/src/main/assets/www/nux.mjs';

test('English default, Spanish switch, dynamic labels and interpolation',()=>{
  assert.equal(getLanguage(),'en');assert.equal(t('Ajustes'),'Settings');
  assert.equal(t`Configurar pad ${4}`,'Edit pad 4');assert.equal(NAMES.CMP,'Compressor');
  assert.equal(t`Elegido: ${'MY CUSTOM NAME'}`,'Selected: MY CUSTOM NAME');
  setLanguage('es');assert.equal(t('Ajustes'),'Ajustes');assert.equal(NAMES.CMP,'Compresor');
  assert.equal(t`Configurar pad ${4}`,'Configurar pad 4');assert.equal(t('MY CUSTOM NAME'),'MY CUSTOM NAME');
  assert.throws(()=>setLanguage('fr'));assert.equal(getLanguage(),'es');setLanguage('en');
});
test('saved language is restored and switches persist without reloading',async()=>{
  const previous=globalThis.localStorage,values=new Map([['language','es']]);
  globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  try{const saved=await import('../app/src/main/assets/www/i18n.mjs?saved');assert.equal(saved.getLanguage(),'es');saved.setLanguage('en');assert.equal(values.get('language'),'en');assert.equal(saved.t('Ajustes'),'Settings');}finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
