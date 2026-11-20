import {gearArt} from './gear-art.mjs';

export function createModelPicker(block,models,current,onChange=()=>{}){
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let selected=current;
  const root=make('section',undefined,'model-picker'),search=make('input'),summary=make('p',undefined,'model-selection'),grid=make('div',undefined,'model-grid');
  search.type='search';search.placeholder='Buscar pedal o ampli…';search.setAttribute('aria-label','Buscar modelo');
  grid.setAttribute('role','group');grid.setAttribute('aria-label','Modelos de efectos');summary.setAttribute('aria-live','polite');
  function render(){
    const chosen=models.find(m=>m.id===selected);
    summary.textContent=chosen?`Elegido: ${chosen.name.replace(/^\d+\.\s*/,'')}`:'Elige un modelo';
    const query=search.value.trim().toLocaleLowerCase();
    grid.replaceChildren(...models.filter(m=>m.name.toLocaleLowerCase().includes(query)).map(model=>{
      const button=make('button',undefined,'model-card'),name=model.name.replace(/^\d+\.\s*/,'');
      button.type='button';button.dataset.model=model.id;button.dataset.kind=block;
      button.setAttribute('aria-pressed',String(model.id===selected));button.setAttribute('aria-label',name);
      button.append(gearArt(block,model.id),make('strong',name),make('small',model.id===current?'Actual en la escena':model.id===selected?'Elegido':'Elegir'));
      button.addEventListener('click',()=>{
        if(model.id===selected)return;selected=model.id;
        for(const card of grid.children){const id=Number(card.dataset.model);card.setAttribute('aria-pressed',String(id===selected));card.querySelector('small').textContent=id===current?'Actual en la escena':id===selected?'Elegido':'Elegir';}
        summary.textContent=`Elegido: ${name}`;onChange(selected);
      });return button;
    }));
    if(!grid.children.length)grid.append(make('p','No hay modelos con ese nombre.','muted'));
  }
  search.addEventListener('input',render);root.append(search,summary,grid);render();
  return {element:root,value:()=>selected};
}
