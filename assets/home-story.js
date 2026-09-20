(()=>{'use strict';

const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const desktopMq=window.matchMedia?.('(min-width: 861px)');
const desktop=()=>desktopMq?.matches!==false;

const setStoryFeature=(name)=>{
  if(!name)return;
  document.querySelectorAll('[data-story-feature]').forEach((item)=>item.classList.toggle('active',item.dataset.storyFeature===name));
  document.querySelectorAll('[data-story-screen]').forEach((screen)=>{
    const active=screen.dataset.storyScreen===name;
    screen.classList.toggle('active',active);
    screen.setAttribute('aria-hidden',active?'false':'true');
  });
  document.querySelectorAll('[data-story-icon]').forEach((icon)=>icon.classList.toggle('active',icon.dataset.storyIcon===name));
};

const phoneStates={
  '1':{kicker:'KROK 1 · TELEFON',title:'Otwórz portal pracownika',copy:'Wejdź na app.serviceos.pl w przeglądarce telefonu.',code:'app.serviceos.pl',active:'site'},
  '2':{kicker:'KROK 2 · KOMPUTER',title:'Wygeneruj kod połączenia',copy:'W ServiceOS otwórz Pomoc → Połącz urządzenie.',code:'ABCD-EFGH',active:'code'},
  '3':{kicker:'KROK 3 · TELEFON',title:'Wpisz kod na telefonie',copy:'Wybierz „Połącz telefon” i przepisz kod z komputera.',code:'ABCD-EFGH',active:'pair'},
  '4':{kicker:'KROK 4 · GOTOWE',title:'Zacznij od ekranu Start',copy:'Telefon pokaże najpierw rzeczy wymagające działania.',code:'POŁĄCZONO ✓',active:'ready'}
};

const timeline=document.querySelector('[data-connect-timeline]');
const connectSteps=[...document.querySelectorAll('[data-connect-step]')];
const phoneKicker=document.querySelector('[data-phone-kicker]');
const phoneTitle=document.querySelector('[data-phone-title]');
const phoneCopy=document.querySelector('[data-phone-copy]');
const phoneCode=document.querySelector('[data-phone-code]');
const phoneActions=[...document.querySelectorAll('[data-phone-action]')];

const setConnectStep=(step)=>{
  const key=String(step||'1');
  connectSteps.forEach((item)=>item.classList.toggle('active',item.dataset.connectStep===key));
  const index=Math.max(0,connectSteps.findIndex((item)=>item.dataset.connectStep===key));
  if(timeline)timeline.style.setProperty('--connect-progress',String(connectSteps.length>1?index/(connectSteps.length-1):1));
  const state=phoneStates[key]||phoneStates['1'];
  if(phoneKicker)phoneKicker.textContent=state.kicker;
  if(phoneTitle)phoneTitle.textContent=state.title;
  if(phoneCopy)phoneCopy.textContent=state.copy;
  if(phoneCode)phoneCode.textContent=state.code;
  phoneActions.forEach((item)=>item.classList.toggle('active',item.dataset.phoneAction===state.active));
};

const bindNearest=(items,onSelect)=>{
  if(!items.length||!desktop())return()=>{};
  let raf=0;
  let current=null;
  const update=()=>{
    raf=0;
    const targetY=window.innerHeight*.46;
    let best=null;
    let distance=Infinity;
    for(const item of items){
      const rect=item.getBoundingClientRect();
      if(rect.bottom<0||rect.top>window.innerHeight)continue;
      const d=Math.abs((rect.top+rect.height*.42)-targetY);
      if(d<distance){distance=d;best=item;}
    }
    if(best&&best!==current){current=best;onSelect(best);}
  };
  const request=()=>{
    if(raf)return;
    raf=requestAnimationFrame(update);
  };
  window.addEventListener('scroll',request,{passive:true});
  window.addEventListener('resize',request,{passive:true});
  request();
  return()=>{
    window.removeEventListener('scroll',request);
    window.removeEventListener('resize',request);
    if(raf)cancelAnimationFrame(raf);
  };
};

const featureItems=[...document.querySelectorAll('[data-story-feature]')];
if(featureItems.length){
  setStoryFeature(featureItems[0].dataset.storyFeature);
  if(desktop()){
    bindNearest(featureItems,(item)=>setStoryFeature(item.dataset.storyFeature));
    featureItems.forEach((item)=>item.addEventListener('mouseenter',()=>setStoryFeature(item.dataset.storyFeature)));
  }
}

if(connectSteps.length){
  setConnectStep('1');
  if(desktop()){
    bindNearest(connectSteps,(item)=>setConnectStep(item.dataset.connectStep));
    connectSteps.forEach((step)=>step.addEventListener('mouseenter',()=>setConnectStep(step.dataset.connectStep)));
  }
}

const observed=[...document.querySelectorAll('[data-story-observe]')];
if(observed.length){
  if(reduce||!desktop()){
    observed.forEach((el)=>el.classList.add('story-visible'));
  }else{
    observed.forEach((el)=>el.classList.add('story-observe'));
    const revealObserver=new IntersectionObserver((entries)=>{
      entries.forEach((entry)=>{
        if(entry.isIntersecting){
          entry.target.classList.add('story-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },{threshold:.08,rootMargin:'0px 0px -40px'});
    observed.forEach((el)=>revealObserver.observe(el));
  }
}

const navLinks=[...document.querySelectorAll('.portal-links a[href^="#"]')];
const navPairs=navLinks.map((link)=>({link,section:document.querySelector(link.getAttribute('href'))})).filter((x)=>x.section);
if(navPairs.length&&desktop()){
  bindNearest(navPairs.map((x)=>x.section),(section)=>{
    navPairs.forEach(({link,section:target})=>link.classList.toggle('story-active',target===section));
  });
}
})();
