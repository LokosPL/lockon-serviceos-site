(()=>{'use strict';

const apiBase='https://br-steep-bonus-b1f1qh8u-lockonapi.compute.c-5.eu-central-1.aws.neon.tech';
const sessionKey='lockon.customer.portal.session';
let sessionToken='';
let portalData=null;
let refreshTimer=null;
let googleConfig=null;
let googleReady=null;
let googleIntent='LOGIN';
let pendingGoogleCredential=null;
let pendingFocusOrderId='';

const q=(s)=>document.querySelector(s);
const qa=(s)=>[...document.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v)=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'});};
const ts=(v)=>{const d=new Date(v||0);return Number.isNaN(d.getTime())?0:d.getTime();};
const newestFirst=(a,b)=>ts(b.updatedAt||b.createdAt||b.receivedAt)-ts(a.updatedAt||a.createdAt||a.receivedAt);
const money=(v,c='PLN')=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:c||'PLN'}).format(Number(v||0));
const readSession=()=>{try{return sessionStorage.getItem(sessionKey)||'';}catch{return '';}};
const saveSession=(v)=>{try{if(v)sessionStorage.setItem(sessionKey,v);else sessionStorage.removeItem(sessionKey);}catch{}};

const readCardHash=()=>{
  const raw=String(location.hash||'').replace(/^#/,'');
  if(!raw)return {code:'',orderId:'',auto:false};
  const params=new URLSearchParams(raw);
  return {
    code:String(params.get('code')||'').trim(),
    orderId:String(params.get('order')||'').trim(),
    auto:params.get('auto')==='1'
  };
};
const clearCardHash=()=>{
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
};
const savePdfFromBase64=(payload)=>{
  const binary=atob(String(payload?.pdfBase64||''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  if(bytes.length<5||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Serwer zwrócił nieprawidłową kartę PDF.');
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=String(payload?.fileName||'karta-serwisowa.pdf').replace(/[\\/]/g,'_');
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
};

const api=async(path,options={},authenticated=true)=>{
  const headers=new Headers(options.headers||{});
  headers.set('Accept','application/json');
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(authenticated&&sessionToken)headers.set('Authorization','Bearer '+sessionToken);
  const res=await fetch(apiBase+path,{...options,headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok){
    const e=new Error(body?.message||'Nie udało się pobrać danych.');
    e.status=res.status;e.code=body?.error||'REQUEST_FAILED';
    throw e;
  }
  return body;
};

const setState=(state)=>{
  document.body.dataset.customerState=state;
  q('#customerLogin').hidden=state!=='login';
  q('#customerLoading').hidden=state!=='loading';
  q('#customerAccessChoice').hidden=state!=='choice';
  q('#customerPortal').hidden=state!=='portal';
  q('#customerLogout').hidden=state!=='portal';
};

const stopRefresh=()=>{
  if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}
};
const startRefresh=()=>{
  stopRefresh();
  refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')void load();},20000);
};

const clearErrors=()=>{
  ['#customerLoginError','#customerAccessError','#customerSettingsStatus','#customerQuoteStatus'].forEach(selector=>{
    const el=q(selector);if(el){el.textContent='';el.hidden=true;}
  });
};

const showLoading=()=>{clearErrors();setState('loading');};
const showLogin=(message='')=>{
  portalData=null;sessionToken='';saveSession('');stopRefresh();setState('login');
  const box=q('#customerLoginError');box.textContent=message;box.hidden=!message;
  void renderGoogleFor('LOGIN');
};

const loadGoogleSdk=async()=>{
  if(googleReady)return googleReady;
  googleReady=(async()=>{
    googleConfig=await api('/public/customer-portal/config',{},false).catch(()=>({googleEnabled:false,googleClientId:null}));
    if(!googleConfig?.googleEnabled||!googleConfig?.googleClientId)return false;
    if(window.google?.accounts?.oauth2||window.google?.accounts?.id)return true;
    await new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-customer-google]');
      if(existing){
        if(window.google?.accounts){resolve();return;}
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',reject,{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src='https://accounts.google.com/gsi/client';
      script.async=true;script.defer=true;script.dataset.customerGoogle='1';
      script.onload=resolve;script.onerror=reject;
      document.head.appendChild(script);
    });
    return Boolean(window.google?.accounts?.oauth2||window.google?.accounts?.id);
  })();
  return googleReady;
};

const googleErrorBox=(intent)=>intent==='LOGIN'?q('#customerLoginError'):q('#customerAccessError');

const submitGoogleCredential=async(intent,credential)=>{
  if(!credential?.accessToken&&!credential?.idToken)return;
  googleIntent=intent;
  const errorBox=googleErrorBox(intent);
  if(errorBox){errorBox.hidden=true;errorBox.textContent='';}
  showLoading();
  try{
    const path=intent==='LOGIN'?'/public/customer-portal/google/login':'/public/customer-portal/google/link';
    const data=await api(path,{method:'POST',body:JSON.stringify(credential)},intent!=='LOGIN');
    pendingGoogleCredential=null;
    sessionToken=data.sessionToken;saveSession(sessionToken);portalData=data;
    render();startRefresh();
  }catch(error){
    if(intent==='LOGIN'){
      if(error.code==='CUSTOMER_GOOGLE_NOT_LINKED'){
        pendingGoogleCredential=credential;
        showLogin('Konto Google rozpoznane. Wpisz swój kod klienta jeden raz — połączymy konto automatycznie i następnym razem wejdziesz bez kodu.');
        const input=q('#customerLoginForm input[name="customerId"]');
        if(input){input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});}
      }else{
        showLogin(error.message);
      }
    }else{
      setState('choice');
      const box=q('#customerAccessError');box.textContent=error.message;box.hidden=false;
      void renderGoogleFor('LINK');
    }
  }
};

const requestGoogle=async(intent)=>{
  googleIntent=intent;
  const ready=await loadGoogleSdk().catch(()=>false);
  const box=googleErrorBox(intent);
  if(!ready||!googleConfig?.googleClientId){
    if(box){box.textContent='Logowanie Google jest chwilowo niedostępne. Możesz wejść kodem klienta.';box.hidden=false;}
    return;
  }
  if(window.google?.accounts?.oauth2?.initTokenClient){
    try{
      const client=window.google.accounts.oauth2.initTokenClient({
        client_id:googleConfig.googleClientId,
        scope:'openid email profile',
        include_granted_scopes:false,
        callback:(response)=>{
          if(response?.error){
            if(box){box.textContent='Google nie dokończył logowania. Spróbuj ponownie.';box.hidden=false;}
            return;
          }
          if(response?.access_token)void submitGoogleCredential(intent,{accessToken:response.access_token});
        },
        error_callback:()=>{
          if(box){box.textContent='Okno Google zostało zamknięte albo zablokowane przez przeglądarkę. Spróbuj jeszcze raz.';box.hidden=false;}
        }
      });
      client.requestAccessToken({prompt:'select_account'});
      return;
    }catch(error){
      if(box){box.textContent='Nie udało się otworzyć logowania Google. Spróbuj ponownie.';box.hidden=false;}
    }
  }
  if(window.google?.accounts?.id){
    window.google.accounts.id.initialize({
      client_id:googleConfig.googleClientId,
      callback:(response)=>response?.credential&&void submitGoogleCredential(intent,{idToken:response.credential}),
      auto_select:false,
      cancel_on_tap_outside:true,
      itp_support:true,
      use_fedcm_for_prompt:true
    });
    window.google.accounts.id.prompt((notification)=>{
      if(notification?.isNotDisplayed?.()&&box){
        box.textContent='Google nie może wyświetlić wyboru konta w tej przeglądarce. Włącz wyskakujące okna albo użyj kodu klienta.';
        box.hidden=false;
      }
    });
  }
};

const renderGoogleFor=async(intent)=>{
  googleIntent=intent;
  const ready=await loadGoogleSdk().catch(()=>false);
  const hosts=['#customerGoogleLoginHost','#customerGoogleLinkHost','#customerGoogleAccountHost'];
  hosts.forEach(selector=>{const host=q(selector);if(host)host.replaceChildren();});
  const selector=intent==='LOGIN'?'#customerGoogleLoginHost':(document.body.dataset.customerState==='choice'?'#customerGoogleLinkHost':'#customerGoogleAccountHost');
  const host=q(selector);if(!host)return;
  if(!ready){
    const unavailable=document.createElement('div');
    unavailable.className='customer-google-unavailable';
    unavailable.textContent='Google chwilowo niedostępne — użyj kodu klienta.';
    host.appendChild(unavailable);
    return;
  }
  const button=document.createElement('button');
  button.type='button';
  button.className='customer-google-button';
  const mark=document.createElement('span');mark.className='customer-google-mark';mark.textContent='G';
  const label=document.createElement('span');
  label.textContent=intent==='LOGIN'?'Zaloguj przez Google':'Połącz konto Google';
  const arrow=document.createElement('b');arrow.textContent='→';
  button.append(mark,label,arrow);
  button.addEventListener('click',()=>void requestGoogle(intent));
  host.appendChild(button);
};

const showChoice=(data)=>{
  portalData=data;clearErrors();setState('choice');
  q('#customerAccessChoice h1').textContent=data?.access?.googleLinked?'Kod działa. Chcesz wejść pełnym kontem?':'Kod działa. Jak chcesz korzystać z portalu?';
  void renderGoogleFor('LINK');
};

const showSection=(name)=>{
  if(name==='new-quote'&&!portalData?.access?.canWrite){name='account';}
  qa('[data-customer-panel]').forEach(el=>{el.hidden=el.dataset.customerPanel!==name;el.classList.toggle('active',el.dataset.customerPanel===name);});
  qa('[data-customer-section]').forEach(el=>el.classList.toggle('active',el.dataset.customerSection===name));
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  if(name==='account'&&!portalData?.access?.canWrite)void renderGoogleFor('LINK');
};

const bindMessageForms=()=>{
  qa('.customer-message-form').forEach(form=>form.addEventListener('submit',async(ev)=>{
    ev.preventDefault();
    if(!portalData?.access?.canWrite){showSection('account');return;}
    const input=form.querySelector('input');const message=input.value.trim();if(!message)return;
    const button=form.querySelector('button');button.disabled=true;
    try{
      portalData=await api('/public/customer-portal/quotes/'+encodeURIComponent(form.dataset.requestId)+'/messages',{method:'POST',body:JSON.stringify({message})});
      render();showSection('quotes');
    }catch(error){window.alert(error.message);}
    finally{if(button.isConnected)button.disabled=false;}
  }));
};

const render=()=>{
  const d=portalData;if(!d)return;
  const full=d.access?.canWrite===true;
  setState('portal');
  q('#customerName').textContent=[d.customer.firstName,d.customer.lastName].filter(Boolean).join(' ');
  q('#customerContact').textContent=[d.customer.email,d.customer.phone].filter(Boolean).join(' · ')||'Dane klienta zapisane w LockOn';
  q('#customerOrderCount').textContent=String(d.orders.length);
  q('#customerQuoteCount').textContent=String(d.quoteRequests.filter(x=>!['CLOSED','CANCELLED'].includes(x.status)).length);
  q('#customerSince').textContent=fmt(d.customer.customerSince).split(',')[0];
  q('#customerPortalCode').textContent=d.customerPortalCode||'—';
  q('#customerPortalLink').href=d.customerPortalUrl||'klient.html';
  q('#customerSync').textContent='Aktualne · '+new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  q('#customerAccessLabel').textContent=full?'PEŁNE KONTO':'TRYB PODGLĄDU';
  q('#customerViewOnlyBanner').hidden=full;
  q('#customerNewQuoteButton').hidden=!full;

  const sortedOrders=[...d.orders].sort(newestFirst);
  q('#customerOrders').innerHTML=sortedOrders.length?sortedOrders.map(o=>{
    const price=o.finalCost!=null?'Koszt: '+money(o.finalCost,o.currency):(o.estimatedCost!=null?'Wycena: '+money(o.estimatedCost,o.currency):'Bez zapisanej wyceny');
    const location=o.currentPointName||o.homePointName||o.pointName;
    const warranty=o.warranty
      ? '<div class="customer-warranty '+(o.warranty.active?'active':'expired')+'"><div><span>GWARANCJA SERWISOWA</span><strong>'+(o.warranty.active?'Aktywna':'Wygasła')+'</strong></div><div><b>'+esc(o.warranty.months)+' mies.</b><small>ważna do '+esc(new Date(o.warranty.expiresAt).toLocaleDateString('pl-PL'))+'</small></div><div><b>'+(o.warranty.active?esc(o.warranty.daysRemaining)+' dni':'0 dni')+'</b><small>'+(o.warranty.active?'pozostało':'po terminie')+'</small></div></div>'
      : '';
    return '<article class="customer-order'+(pendingFocusOrderId===o.id?' open':'')+'" tabindex="0" data-customer-order-id="'+esc(o.id)+'"><div class="customer-order-top"><div><strong>#'+esc(o.orderNumber)+' · '+esc(o.device.brand)+' '+esc(o.device.model)+'</strong><div>'+esc(fmt(o.updatedAt||o.receivedAt))+'</div></div><span class="status">'+esc(o.statusLabel)+'</span></div>'+
      '<div class="customer-order-details"><div class="customer-order-meta"><span>Punkt: '+esc(o.homePointName||o.pointName)+'</span><span>Urządzenie: '+esc(location)+'</span><span>'+esc(price)+'</span><span>Termin: '+esc(o.estimatedCompletionAt?fmt(o.estimatedCompletionAt):'brak')+'</span></div>'+warranty+'<p>'+esc(o.issueDescription||'Brak opisu usterki.')+'</p>'+
      (o.serviceCardAvailable?'<button type="button" class="customer-service-card-download" data-customer-service-card="'+esc(o.id)+'">Pobierz kartę serwisową PDF</button>':'')+
      '</div><div class="customer-order-open">Otwórz <span>›</span></div></article>';
  }).join(''):'<div class="empty">Nie ma jeszcze zapisanych zleceń.</div>';

  const point=q('#customerQuotePoint');const currentPoint=point.value;
  point.innerHTML=d.points.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name+(p.city?' · '+p.city:''))+'</option>').join('');
  if(d.points.some(p=>p.id===currentPoint))point.value=currentPoint;
  const order=q('#customerQuoteOrder');const currentOrder=order.value;
  order.innerHTML='<option value="">Inne urządzenie</option>'+d.orders.map(o=>'<option value="'+esc(o.id)+'">#'+esc(o.orderNumber)+' · '+esc(o.device.brand)+' '+esc(o.device.model)+'</option>').join('');
  if(d.orders.some(o=>o.id===currentOrder))order.value=currentOrder;

  const sortedQuotes=[...d.quoteRequests].sort(newestFirst);
  q('#customerQuotes').innerHTML=sortedQuotes.length?sortedQuotes.map(r=>{
    const status={OPEN:'Oczekuje na odpowiedź',QUOTED:'Wycena gotowa',CLOSED:'Zamknięte',CANCELLED:'Anulowane'}[r.status]||r.status;
    const price=r.quoteAmount!=null?'<div class="quote-price"><span>Wycena</span><br><strong>'+esc(money(r.quoteAmount,r.currency))+'</strong>'+(r.quoteNote?'<p>'+esc(r.quoteNote)+'</p>':'')+'</div>':'';
    const msgs=[...(r.messages||[])].sort((a,b)=>ts(a.createdAt)-ts(b.createdAt)).map(m=>'<div class="quote-message '+esc(m.senderKind.toLowerCase())+'"><b>'+esc(m.senderKind==='STAFF'?(m.senderName||'Serwis'):m.senderKind==='CUSTOMER'?'Ty':'ServiceOS')+':</b> '+esc(m.body)+'<small>'+esc(fmt(m.createdAt))+'</small></div>').join('');
    const closed=['CLOSED','CANCELLED'].includes(r.status);
    const form=!full||closed?'': '<form class="customer-message-form" data-request-id="'+esc(r.id)+'"><input name="message" maxlength="1000" placeholder="Napisz do serwisu…"><button>Wyślij</button></form>';
    const locked=!full&&!closed?'<button type="button" class="customer-thread-unlock" data-customer-section="account">Połącz Google, aby odpisać</button>':'';
    return '<article class="quote-thread"><div class="quote-thread-head"><div><strong>'+esc(r.deviceDescription)+'</strong><div>'+esc(r.requestedPointName)+'</div></div><span class="quote-badge">'+esc(status)+'</span></div>'+price+msgs+form+locked+'</article>';
  }).join(''):'<div class="empty">Nie masz jeszcze wycen.</div>';

  const account=d.account||{};
  const displayName=account.googleName||[d.customer.firstName,d.customer.lastName].filter(Boolean).join(' ')||'Klient LockOn';
  q('#customerAccountName').textContent=displayName;
  q('#customerAccountEmail').textContent=account.googleEmail||d.customer.email||'Brak adresu e-mail';
  const avatar=q('#customerAccountAvatar');
  if(account.googlePicture){
    avatar.innerHTML='<img src="'+esc(account.googlePicture)+'" alt="">';
  }else{
    avatar.textContent=(displayName.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('')||'LK').toUpperCase();
  }
  q('#customerAccountMode').textContent=full?'Połączone z Google':'Tylko podgląd';
  q('#customerAccountViewOnly').hidden=full;
  q('#customerSettingsForm').hidden=!full;
  if(full){
    const prefs=account.notificationPreferences||{};
    const form=q('#customerSettingsForm');
    form.elements.serviceUpdates.checked=prefs.serviceUpdates!==false;
    form.elements.readyForPickup.checked=prefs.readyForPickup!==false;
    form.elements.quoteUpdates.checked=prefs.quoteUpdates!==false;
    form.elements.messages.checked=prefs.messages!==false;
  }

  bindMessageForms();
  qa('.customer-order').forEach(card=>{
    const toggle=(event)=>{if(event?.target?.closest?.('[data-customer-service-card]'))return;card.classList.toggle('open');};
    card.addEventListener('click',toggle);
    card.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&!ev.target.closest?.('[data-customer-service-card]')){ev.preventDefault();card.classList.toggle('open');}});
  });
  showSection(qa('[data-customer-panel].active')[0]?.dataset.customerPanel||'orders');
  if(pendingFocusOrderId){
    requestAnimationFrame(()=>document.querySelector('[data-customer-order-id="'+CSS.escape(pendingFocusOrderId)+'"]')?.scrollIntoView({behavior:'smooth',block:'center'}));
    pendingFocusOrderId='';
  }
};

const load=async()=>{
  if(!sessionToken)return;
  try{portalData=await api('/public/customer-portal/me');render();}
  catch(error){
    if(error.status===401||error.status===403)showLogin(error.message);
    else if(q('#customerSync'))q('#customerSync').textContent='Nie udało się odświeżyć danych.';
  }
};

q('#customerLoginForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();
  const form=ev.currentTarget;const button=form.querySelector('button');const box=q('#customerLoginError');
  box.hidden=true;button.disabled=true;showLoading();
  const fd=new FormData(form);
  try{
    const data=await api('/public/customer-portal/login',{method:'POST',body:JSON.stringify({customerId:String(fd.get('customerId')||'')})},false);
    sessionToken=data.sessionToken;saveSession(sessionToken);portalData=data;
    if(pendingGoogleCredential){
      try{
        const linked=await api('/public/customer-portal/google/link',{method:'POST',body:JSON.stringify(pendingGoogleCredential)},true);
        pendingGoogleCredential=null;
        sessionToken=linked.sessionToken;saveSession(sessionToken);portalData=linked;
        render();startRefresh();
        return;
      }catch(linkError){
        pendingGoogleCredential=null;
        showChoice(data);
        const accessBox=q('#customerAccessError');
        accessBox.textContent=linkError.message;accessBox.hidden=false;
        return;
      }
    }
    showChoice(data);
  }catch(error){showLogin(error.message);}
  finally{button.disabled=false;}
});

q('#customerViewOnly').addEventListener('click',()=>{render();startRefresh();});
q('#customerUpgradeGoogle').addEventListener('click',()=>showSection('account'));

q('#customerQuoteOrder').addEventListener('change',()=>{
  const o=portalData?.orders.find(x=>x.id===q('#customerQuoteOrder').value);
  if(o){q('#customerQuoteDevice').value=[o.device.brand,o.device.model].filter(Boolean).join(' ');if(o.homePointId)q('#customerQuotePoint').value=o.homePointId;}
});

q('#customerQuoteForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();
  if(!portalData?.access?.canWrite){showSection('account');return;}
  const form=ev.currentTarget;const button=form.querySelector('button');const status=q('#customerQuoteStatus');
  button.disabled=true;status.hidden=true;const fd=new FormData(form);
  try{
    portalData=await api('/public/customer-portal/quotes',{method:'POST',body:JSON.stringify({
      requestedPointId:String(fd.get('requestedPointId')||''),
      serviceOrderId:String(fd.get('serviceOrderId')||'')||null,
      deviceDescription:String(fd.get('deviceDescription')||''),
      issueDescription:String(fd.get('issueDescription')||'')
    })});
    form.reset();render();showSection('quotes');
  }catch(error){status.textContent=error.message;status.hidden=false;}
  finally{button.disabled=false;}
});

q('#customerSettingsForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();
  if(!portalData?.access?.canWrite)return;
  const form=ev.currentTarget;const button=form.querySelector('button');const status=q('#customerSettingsStatus');
  button.disabled=true;status.hidden=true;
  try{
    portalData=await api('/public/customer-portal/settings',{method:'POST',body:JSON.stringify({
      serviceUpdates:form.elements.serviceUpdates.checked,
      readyForPickup:form.elements.readyForPickup.checked,
      quoteUpdates:form.elements.quoteUpdates.checked,
      messages:form.elements.messages.checked
    })});
    render();showSection('account');status.textContent='Ustawienia zapisane.';status.hidden=false;
  }catch(error){status.textContent=error.message;status.hidden=false;}
  finally{button.disabled=false;}
});

q('#copyCustomerCode').addEventListener('click',async()=>{
  const code=portalData?.customerPortalCode||'';if(!code)return;
  const button=q('#copyCustomerCode');
  try{await navigator.clipboard.writeText(code);button.textContent='Skopiowano';}catch{button.textContent=code;}
  setTimeout(()=>{button.textContent='Kopiuj kod';},1600);
});

q('#customerLoginForm input[name="customerId"]').addEventListener('input',(ev)=>{
  let raw=String(ev.target.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(raw.startsWith('LK'))raw=raw.slice(2);
  raw=raw.slice(0,16);
  ev.target.value=raw?'LK-'+(raw.match(/.{1,4}/g)||[]).join('-'):'';
});

document.addEventListener('click',(ev)=>{
  const cardButton=ev.target.closest('[data-customer-service-card]');
  if(cardButton){
    ev.preventDefault();ev.stopPropagation();
    const orderId=cardButton.dataset.customerServiceCard;
    const original=cardButton.textContent;
    cardButton.disabled=true;cardButton.textContent='Pobieranie…';
    void api('/public/customer-portal/orders/'+encodeURIComponent(orderId)+'/service-card')
      .then(savePdfFromBase64)
      .catch(error=>window.alert(error.message||'Nie udało się pobrać karty serwisowej.'))
      .finally(()=>{if(cardButton.isConnected){cardButton.disabled=false;cardButton.textContent=original;}});
    return;
  }
  const button=ev.target.closest('[data-customer-section]');
  if(button)showSection(button.dataset.customerSection);
});

q('#customerLogout').addEventListener('click',()=>{pendingGoogleCredential=null;showLogin();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.body.dataset.customerState==='portal')void load();});

(async()=>{
  const cardLink=readCardHash();
  pendingFocusOrderId=cardLink.orderId;
  await loadGoogleSdk().catch(()=>false);
  sessionToken=readSession();

  if(cardLink.code){
    showLoading();
    try{
      const data=await api('/public/customer-portal/login',{method:'POST',body:JSON.stringify({customerId:cardLink.code})},false);
      sessionToken=data.sessionToken;saveSession(sessionToken);portalData=data;clearCardHash();render();startRefresh();
      return;
    }catch(error){
      clearCardHash();
      showLogin(error.message||'Nie udało się otworzyć karty klienta.');
      const input=q('#customerLoginForm input[name="customerId"]');if(input)input.value=cardLink.code;
      return;
    }
  }

  if(sessionToken){
    showLoading();await load();if(sessionToken)startRefresh();
  }else{
    showLogin();
    if(new URLSearchParams(location.search).get('google')==='1'){
      setTimeout(()=>q('#customerGoogleLoginHost')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
    }
  }
})();
})();
