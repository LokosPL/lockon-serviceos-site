(()=>{'use strict';

const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const desktop=()=>window.matchMedia?.('(min-width: 861px)').matches===true;

const setStoryFeature=(name)=>{
  if(!name)return;
  document.querySelectorAll('[data-story-feature]').forEach((item)=>{
    const active=item.dataset.storyFeature===name;
    item.classList.toggle('active',active);
    item.setAttribute('aria-pressed',active?'true':'false');
  });
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
  connectSteps.forEach((item)=>{
    const active=item.dataset.connectStep===key;
    item.classList.toggle('active',active);
    item.setAttribute('aria-pressed',active?'true':'false');
  });
  const index=Math.max(0,connectSteps.findIndex((item)=>item.dataset.connectStep===key));
  if(timeline)timeline.style.setProperty('--connect-progress',String(connectSteps.length>1?index/(connectSteps.length-1):1));
  const state=phoneStates[key]||phoneStates['1'];
  if(phoneKicker)phoneKicker.textContent=state.kicker;
  if(phoneTitle)phoneTitle.textContent=state.title;
  if(phoneCopy)phoneCopy.textContent=state.copy;
  if(phoneCode)phoneCode.textContent=state.code;
  phoneActions.forEach((item)=>item.classList.toggle('active',item.dataset.phoneAction===state.active));
};

const makeSelectable=(items,select)=>{
  if(!desktop())return;
  items.forEach((item)=>{
    item.setAttribute('role','button');
    item.setAttribute('tabindex','0');
    const activate=()=>select(item);
    item.addEventListener('click',activate);
    item.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      activate();
    });
  });
};

const featureItems=[...document.querySelectorAll('[data-story-feature]')];
if(featureItems.length){
  setStoryFeature(featureItems[0].dataset.storyFeature);
  makeSelectable(featureItems,(item)=>setStoryFeature(item.dataset.storyFeature));
}

if(connectSteps.length){
  setConnectStep('1');
  makeSelectable(connectSteps,(item)=>setConnectStep(item.dataset.connectStep));
}

const observed=[...document.querySelectorAll('[data-story-observe]')];
if(observed.length){
  if(reduce||!desktop()){
    observed.forEach((el)=>el.classList.add('story-visible'));
  }else{
    observed.forEach((el)=>el.classList.add('story-observe'));
    const revealObserver=new IntersectionObserver((entries)=>{
      entries.forEach((entry)=>{
        if(!entry.isIntersecting)return;
        entry.target.classList.add('story-visible');
        revealObserver.unobserve(entry.target);
      });
    },{threshold:.08,rootMargin:'0px 0px -40px'});
    observed.forEach((el)=>revealObserver.observe(el));
  }
}

const navLinks=[...document.querySelectorAll('.portal-links a[href^="#"]')];
navLinks.forEach((link)=>link.addEventListener('click',()=>{
  navLinks.forEach((item)=>item.classList.toggle('story-active',item===link));
}));
})();
