(()=>{'use strict';
const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('ui2026');
const dynamicSelector=[
  '.panel-order-card','.panel-transfer-card','.admin-user-card-v2','.admin-pending-card',
  '.customer-quote-card','.mobile-support-ticket','.customer-order','.quote-thread',
  '.track-timeline > *','.track-transfers > *'
].join(',');
const animate=(root=document)=>{
  if(reduce)return;
  root.querySelectorAll?.(dynamicSelector).forEach((node,index)=>{
    if(node.dataset.uiAnimated)return;
    node.dataset.uiAnimated='1';
    node.style.setProperty('--ui-delay',Math.min(index,5)*35+'ms');
    node.classList.add('ui-enter');
    window.setTimeout(()=>node.classList.remove('ui-enter'),620);
  });
};
const observer=new MutationObserver((records)=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof Element))continue;
      if(node.matches?.(dynamicSelector)&&!node.dataset.uiAnimated){
        node.dataset.uiAnimated='1';
        if(!reduce){node.classList.add('ui-enter');window.setTimeout(()=>node.classList.remove('ui-enter'),620);}
      }
      animate(node);
    }
  }
});
const boot=()=>{
  document.body.classList.add('ui2026-ready');
  animate();
  observer.observe(document.body,{childList:true,subtree:true});
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();