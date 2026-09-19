(()=>{'use strict';
const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;

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

const featureItems=[...document.querySelectorAll('[data-story-feature]')];
if(featureItems.length){
  setStoryFeature(featureItems[0].dataset.storyFeature);
  if(!reduce){
    const featureObserver=new IntersectionObserver((entries)=>{
      const visible=entries.filter((entry)=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible)setStoryFeature(visible.target.dataset.storyFeature);
    },{threshold:[.32,.5,.68],rootMargin:'-18% 0px -34% 0px'});
    featureItems.forEach((item)=>featureObserver.observe(item));
  }
  featureItems.forEach((item)=>item.addEventListener('mouseenter',()=>setStoryFeature(item.dataset.storyFeature)));
}

const phoneStates={
  '1':{kicker:'KROK 1 · TELEFON',title:'Otwórz portal pracownika',copy:'Wejdź na app.serviceos.pl w przeglądarce telefonu.',code:'app.serviceos.pl',active:'site'},
  '2':{kicker:'KROK 2 · KOMPUTER',title:'Zaloguj się do ServiceOS',copy:'Na komputerze użyj swojego zatwierdzonego konta pracownika.',code:'KONTO GOTOWE',active:'desktop'},
  '3':{kicker:'KROK 3 · KOD',title:'Wygeneruj kod połączenia',copy:'W aplikacji Windows otwórz Pomoc → Połącz urządzenie.',code:'ABCD-EFGH',active:'code'},
  '4':{kicker:'KROK 4 · TELEFON',title:'Wpisz kod na telefonie',copy:'Wybierz „Połącz telefon” i przepisz jednorazowy kod.',code:'ABCD-EFGH',active:'pair'},
  '5':{kicker:'KROK 5 · GOTOWE',title:'Telefon jest połączony',copy:'Masz ten sam zakres pracy co na komputerze — bez dodatkowych uprawnień.',code:'POŁĄCZONO ✓',active:'ready'}
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
if(connectSteps.length){
  setConnectStep('1');
  if(!reduce){
    const connectObserver=new IntersectionObserver((entries)=>{
      const visible=entries.filter((entry)=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible)setConnectStep(visible.target.dataset.connectStep);
    },{threshold:[.35,.55,.72],rootMargin:'-22% 0px -32% 0px'});
    connectSteps.forEach((step)=>connectObserver.observe(step));
  }
  connectSteps.forEach((step)=>step.addEventListener('mouseenter',()=>setConnectStep(step.dataset.connectStep)));
}

const observed=[...document.querySelectorAll('[data-story-observe]')];
if(observed.length){
  if(reduce)observed.forEach((el)=>el.classList.add('story-visible'));
  else{
    observed.forEach((el)=>el.classList.add('story-observe'));
    const revealObserver=new IntersectionObserver((entries)=>{
      entries.forEach((entry)=>{
        if(entry.isIntersecting){entry.target.classList.add('story-visible');revealObserver.unobserve(entry.target);}
      });
    },{threshold:.12,rootMargin:'0px 0px -60px'});
    observed.forEach((el)=>revealObserver.observe(el));
  }
}

const navLinks=[...document.querySelectorAll('.portal-links a[href^="#"]')];
const navSections=navLinks.map((link)=>document.querySelector(link.getAttribute('href'))).filter(Boolean);
if(navSections.length){
  const navObserver=new IntersectionObserver((entries)=>{
    const visible=entries.filter((entry)=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(!visible)return;
    navLinks.forEach((link)=>link.classList.toggle('story-active',link.getAttribute('href')==='#'+visible.target.id));
  },{threshold:[.18,.35],rootMargin:'-18% 0px -62% 0px'});
  navSections.forEach((section)=>navObserver.observe(section));
}
})();