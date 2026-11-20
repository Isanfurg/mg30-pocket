export function createSettings(){
  const dialog=document.getElementById('settingsDialog'),tabs=[...dialog.querySelectorAll('[data-settings-tab]')];
  function select(name){
    for(const tab of tabs){const active=tab.dataset.settingsTab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const panel of dialog.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==name;
    dialog.scrollTop=0;
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(tab.dataset.settingsTab));
    tab.addEventListener('keydown',event=>{
      let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
      event.preventDefault();select(tabs[next].dataset.settingsTab);tabs[next].focus();
    });
  });
  select('general');return {open(name='general'){select(name);if(!dialog.open)dialog.showModal();}};
}
