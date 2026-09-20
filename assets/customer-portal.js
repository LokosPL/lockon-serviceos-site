(()=>{'use strict';
const apiBase='https://br-steep-bonus-b1f1qh8u-lockonapi.compute.c-5.eu-central-1.aws.neon.tech';
const sessionKey='lockon.customer.portal.session';
let sessionToken='';
let portalData=null;
let refreshTimer=null;
const q=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v)=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'});};
const ts=(v)=>{const d=new Date(v||0);return Number.isNaN(d.getTime())?0:d.getTime();};
const newestFirst=(a,b)=>ts(b.updatedAt||b.createdAt||b.receivedAt)-ts(a.updatedAt||a.createdAt||a.receivedAt);
const showSection=(name)=>{
  document.querySelectorAll('[data-customer-panel]').forEach(el=>{el.hidden=el.dataset.customerPanel!==name;el.classList.toggle('active',el.dataset.customerPanel===name);});
  document.querySelectorAll('[data-customer-section]').forEach(el=>el.classList.toggle('active',el.dataset.customerSection===name));
  window.scrollTo({top:0,behavior:'smooth'});
};
const money=(v,c='PLN')=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:c||'PLN'}).format(Number(v||0));
const readSession=()=>{try{return sessionStorage.getItem(sessionKey)||'';}catch{return '';}};
const saveSession=(v)=>{try{if(v)sessionStorage.setItem(sessionKey,v);else sessionStorage.removeItem(sessionKey);}catch{}};
const api=async(path,options={})=>{
  const headers=new Headers(options.headers||{});
  headers.set('Accept','application/json');
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(sessionToken)headers.set('Authorization','Bearer '+sessionToken);
  const res=await fetch(apiBase+path,{...options,headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(body?.message||'Nie udało się pobrać danych.');e.status=res.status;throw e;}
  return body;
};
const showLogin=(message='')=>{
  portalData=null;sessionToken='';saveSession('');
  q('#customerPortal').hidden=true;q('#customerLogin').hidden=false;q('#customerLogout').hidden=true;
  const box=q('#customerLoginError');box.textContent=message;box.hidden=!message;
  if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}
};
const render=()=>{
  const d=portalData;if(!d)return;
  q('#customerLogin').hidden=true;q('#customerPortal').hidden=false;q('#customerLogout').hidden=false;
  q('#customerName').textContent=[d.customer.firstName,d.customer.lastName].filter(Boolean).join(' ');
  q('#customerContact').textContent=[d.customer.email,d.customer.phone].filter(Boolean).join(' · ')||'Dane klienta zapisane w LockOn';
  q('#customerOrderCount').textContent=String(d.orders.length);
  q('#customerQuoteCount').textContent=String(d.quoteRequests.filter(x=>!['CLOSED','CANCELLED'].includes(x.status)).length);
  q('#customerSince').textContent=fmt(d.customer.customerSince).split(',')[0];
  q('#customerPortalCode').textContent=d.customerPortalCode||'—';
  q('#customerPortalLink').href=d.customerPortalUrl||'klient.html';
  q('#customerSync').textContent='Dane aktualne · '+new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  const sortedOrders=[...d.orders].sort(newestFirst);
  q('#customerOrders').innerHTML=sortedOrders.length?sortedOrders.map(o=>{
    const price=o.finalCost!=null?'Koszt: '+money(o.finalCost,o.currency):(o.estimatedCost!=null?'Wycena: '+money(o.estimatedCost,o.currency):'Bez zapisanej wyceny');
    const location=o.currentPointName||o.homePointName||o.pointName;
    return '<article class="customer-order" tabindex="0"><div class="customer-order-top"><div><strong>#'+esc(o.orderNumber)+' · '+esc(o.device.brand)+' '+esc(o.device.model)+'</strong><div>'+esc(fmt(o.updatedAt||o.receivedAt))+'</div></div><span class="status">'+esc(o.statusLabel)+'</span></div><div class="customer-order-details"><div class="customer-order-meta"><span>Punkt: '+esc(o.homePointName||o.pointName)+'</span><span>Urządzenie: '+esc(location)+'</span><span>'+esc(price)+'</span><span>Termin: '+esc(o.estimatedCompletionAt?fmt(o.estimatedCompletionAt):'brak')+'</span></div><p>'+esc(o.issueDescription||'Brak opisu usterki.')+'</p></div><div class="customer-order-open">Otwórz <span>›</span></div></article>';
  }).join(''):'<div class="empty">Nie ma jeszcze zapisanych zleceń.</div>';

  const point=q('#customerQuotePoint');const currentPoint=point.value;
  point.innerHTML=d.points.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name+(p.city?' · '+p.city:''))+'</option>').join('');
  if(d.points.some(p=>p.id===currentPoint))point.value=currentPoint;
  const order=q('#customerQuoteOrder');const currentOrder=order.value;
  order.innerHTML='<option value="">Nowa wycena / inne urządzenie</option>'+d.orders.map(o=>'<option value="'+esc(o.id)+'">#'+esc(o.orderNumber)+' · '+esc(o.device.brand)+' '+esc(o.device.model)+'</option>').join('');
  if(d.orders.some(o=>o.id===currentOrder))order.value=currentOrder;

  const sortedQuotes=[...d.quoteRequests].sort(newestFirst);
  q('#customerQuotes').innerHTML=sortedQuotes.length?sortedQuotes.map(r=>{
    const status={OPEN:'Oczekuje na odpowiedź',QUOTED:'Wycena gotowa',CLOSED:'Zamknięte',CANCELLED:'Anulowane'}[r.status]||r.status;
    const price=r.quoteAmount!=null?'<div class="quote-price"><span>Wycena zdalna</span><br><strong>'+esc(money(r.quoteAmount,r.currency))+'</strong>'+(r.quoteNote?'<p>'+esc(r.quoteNote)+'</p>':'')+'</div>':'';
    const msgs=[...(r.messages||[])].sort((a,b)=>ts(a.createdAt)-ts(b.createdAt)).map(m=>'<div class="quote-message '+esc(m.senderKind.toLowerCase())+'"><b>'+esc(m.senderKind==='STAFF'?(m.senderName||'Serwisant'):m.senderKind==='CUSTOMER'?'Ty':'ServiceOS')+':</b> '+esc(m.body)+'<small>'+esc(fmt(m.createdAt))+'</small></div>').join('');
    const form=['CLOSED','CANCELLED'].includes(r.status)?'':'<form class="customer-message-form" data-request-id="'+esc(r.id)+'"><input name="message" maxlength="1000" placeholder="Napisz wiadomość do serwisu"><button>Wyślij</button></form>';
    return '<article class="quote-thread"><div class="quote-thread-head"><div><strong>'+esc(r.deviceDescription)+'</strong><div>'+esc(r.requestedPointName)+(r.routedPointName!==r.requestedPointName?' → '+esc(r.routedPointName):'')+'</div></div><span class="quote-badge">'+esc(status)+'</span></div>'+price+msgs+form+'</article>';
  }).join(''):'<div class="empty">Nie masz jeszcze zapytań o wycenę.</div>';
  bindMessageForms();
  document.querySelectorAll('.customer-order').forEach(card=>{
    const toggle=()=>card.classList.toggle('open');
    card.addEventListener('click',toggle);
    card.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();toggle();}});
  });
};
const load=async()=>{
  if(!sessionToken)return;
  try{portalData=await api('/public/customer-portal/me');render();}
  catch(e){if(e.status===401)showLogin('Sesja wygasła. Wpisz identyfikator klienta ponownie.');else q('#customerSync').textContent='Chwilowo nie udało się odświeżyć danych.';}
};
const bindMessageForms=()=>{
  document.querySelectorAll('.customer-message-form').forEach(form=>form.addEventListener('submit',async(ev)=>{
    ev.preventDefault();const input=form.querySelector('input');const message=input.value.trim();if(!message)return;
    form.querySelector('button').disabled=true;
    try{portalData=await api('/public/customer-portal/quotes/'+encodeURIComponent(form.dataset.requestId)+'/messages',{method:'POST',body:JSON.stringify({message})});render();}
    catch(e){alert(e.message);}finally{if(form.isConnected)form.querySelector('button').disabled=false;}
  }));
};
q('#customerLoginForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();const btn=ev.currentTarget.querySelector('button');const box=q('#customerLoginError');box.hidden=true;btn.disabled=true;
  const fd=new FormData(ev.currentTarget);
  try{const data=await api('/public/customer-portal/login',{method:'POST',body:JSON.stringify({customerId:String(fd.get('customerId')||'')})});sessionToken=data.sessionToken;saveSession(sessionToken);portalData=data;render();refreshTimer=setInterval(()=>void load(),20000);}
  catch(e){box.textContent=e.message;box.hidden=false;}finally{btn.disabled=false;}
});
q('#customerQuoteOrder').addEventListener('change',()=>{
  const o=portalData?.orders.find(x=>x.id===q('#customerQuoteOrder').value);
  if(o){q('#customerQuoteDevice').value=[o.device.brand,o.device.model].filter(Boolean).join(' ');if(o.homePointId)q('#customerQuotePoint').value=o.homePointId;}
});
q('#customerQuoteForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();const btn=ev.currentTarget.querySelector('button');const status=q('#customerQuoteStatus');btn.disabled=true;status.hidden=true;
  const fd=new FormData(ev.currentTarget);
  try{
    const data=await api('/public/customer-portal/quotes',{method:'POST',body:JSON.stringify({
      requestedPointId:String(fd.get('requestedPointId')||''),serviceOrderId:String(fd.get('serviceOrderId')||'')||null,
      deviceDescription:String(fd.get('deviceDescription')||''),issueDescription:String(fd.get('issueDescription')||'')
    })});
    portalData=data;render();ev.currentTarget.reset();status.textContent='Zapytanie zostało wysłane. Odpowiedź serwisanta pojawi się w sekcji „Wyceny i rozmowy”.';status.hidden=false;
  }catch(e){status.textContent=e.message;status.hidden=false;}finally{btn.disabled=false;}
});
q('#copyCustomerCode').addEventListener('click',async()=>{
  const code=portalData?.customerPortalCode||'';
  if(!code)return;
  const button=q('#copyCustomerCode');
  try{await navigator.clipboard.writeText(code);button.textContent='Skopiowano';}
  catch{button.textContent=code;}
  window.setTimeout(()=>{button.textContent='Kopiuj kod';},1600);
});
document.addEventListener('click',(ev)=>{const button=ev.target.closest('[data-customer-section]');if(button)showSection(button.dataset.customerSection);});
q('#customerLogout').addEventListener('click',()=>showLogin());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load();});
sessionToken=readSession();if(sessionToken){void load();refreshTimer=setInterval(()=>void load(),20000);}else showLogin();
})();