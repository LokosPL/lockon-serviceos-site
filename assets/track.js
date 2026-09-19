(()=>{'use strict';
const apiBase='https://br-steep-bonus-b1f1qh8u-lockonapi.compute.c-5.eu-central-1.aws.neon.tech';
const REFRESH_MS=20000;
const loading=document.getElementById('trackLoading');
const errorBox=document.getElementById('trackError');
const content=document.getElementById('trackContent');
const syncState=document.getElementById('syncState');
const currentCard=document.getElementById('currentCard');
const transferCard=document.getElementById('transferCard');
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=(value)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'});};
const formatClock=(value)=>{const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
const token=decodeURIComponent((location.hash.match(/(?:^#|&)t=([^&]+)/)||[])[1]||'');
let hasData=false;
let inFlight=false;
let timer=null;

const setSync=(message,warn=false)=>{
  syncState.textContent=message;
  syncState.classList.toggle('warn',warn);
};

const fail=(message)=>{
  loading.hidden=true;
  content.hidden=true;
  errorBox.hidden=false;
  document.getElementById('trackErrorText').textContent=message||'Sprawdź, czy otwierasz dokładnie link otrzymany w wiadomości od LockOn.';
};

const currentLocation=(order,transfers)=>{
  if(order.currentPointName)return order.currentPointName;
  const active=[...transfers].reverse().find((item)=>['REQUESTED','IN_TRANSIT'].includes(item.status));
  if(active)return active.fromPointName&&active.toPointName
    ? 'W drodze: '+active.fromPointName+' → '+active.toPointName
    : 'W transporcie';
  return order.homePointName||order.pointName||'—';
};

const render=({order,statusHistory=[],transfers=[]})=>{
  document.getElementById('orderNumber').textContent='#'+order.orderNumber;
  document.getElementById('deviceName').textContent=[order.device?.brand,order.device?.model].filter(Boolean).join(' ')||'Urządzenie';
  document.getElementById('issueDescription').textContent=order.issueDescription||'Brak dodatkowego opisu usterki.';
  document.getElementById('currentStatus').textContent=order.handlingMode==='TRANSFER_ONLY'&&order.status!=='CANCELLED'?'Przekazanie urządzenia · '+order.statusLabel:order.statusLabel;
  document.getElementById('updatedAt').textContent='Ostatnia zmiana: '+formatDate(order.updatedAt);
  currentCard.dataset.status=String(order.status||'').toUpperCase();

  document.getElementById('customerName').textContent=order.customerName||'—';
  document.getElementById('receivedAt').textContent=formatDate(order.receivedAt||order.createdAt);
  document.getElementById('homePoint').textContent=order.homePointName||order.pointName||'—';
  document.getElementById('currentPoint').textContent=currentLocation(order,transfers);
  const etaCard=document.getElementById('etaCard');
  if(order.estimatedCompletionAt){
    etaCard.hidden=false;
    document.getElementById('eta').textContent=formatDate(order.estimatedCompletionAt);
  }else{
    etaCard.hidden=true;
  }

  const statusEl=document.getElementById('statusTimeline');
  statusEl.innerHTML=statusHistory.length
    ? statusHistory.map((item)=>'<article><i></i><div><strong>'+esc(item.toLabel)+'</strong><span>'+esc(formatDate(item.changedAt))+'</span></div></article>').join('')
    : '<div class="track-empty">Pierwszy etap zlecenia jest już aktywny.</div>';

  const transferLabels={REQUESTED:'Oczekuje na przekazanie',IN_TRANSIT:'W drodze',DELIVERED:'Dostarczono',ACCEPTED:'Przyjęto',REJECTED:'Odrzucono',CANCELLED:'Anulowano'};
  const transferEl=document.getElementById('transferTimeline');
  transferCard.hidden=transfers.length===0;
  if(transfers.length){
    transferEl.innerHTML=transfers.map((item)=>{
      const kind=item.kind==='RETURN_HOME'?'Powrót do punktu macierzystego':'Przekazanie urządzenia';
      const time=item.acceptedAt||item.deliveredAt||item.shippedAt||item.requestedAt||item.updatedAt;
      return '<article><div><strong>'+esc(item.fromPointName)+' → '+esc(item.toPointName)+'</strong><p>'+esc(kind)+'</p></div><span class="track-transfer-status">'+esc(transferLabels[item.status]||item.status)+'</span><small>'+esc(formatDate(time))+'</small></article>';
    }).join('');
  }else{
    transferEl.textContent='';
  }

  loading.hidden=true;
  errorBox.hidden=true;
  content.hidden=false;
  hasData=true;
  setSync('Aktualne · sprawdzono '+formatClock(new Date()));
};

const load=async({initial=false}={})=>{
  if(inFlight)return;
  inFlight=true;
  if(!hasData&&initial){
    loading.hidden=false;
    errorBox.hidden=true;
    content.hidden=true;
  }else if(hasData){
    setSync('Sprawdzam aktualny status…');
  }

  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(apiBase+'/public/service-track?token='+encodeURIComponent(token),{
      method:'GET',
      headers:{Accept:'application/json'},
      credentials:'omit',
      cache:'no-store',
      referrerPolicy:'no-referrer',
      signal:controller.signal
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const err=new Error(payload?.message||'Nie udało się pobrać zlecenia.');
      err.httpStatus=response.status;
      throw err;
    }
    render(payload);
  }catch(error){
    if(hasData){
      setSync('Chwilowo nie udało się odświeżyć. Spróbujemy ponownie.',true);
    }else{
      const message=error?.name==='AbortError'
        ? 'Połączenie trwało zbyt długo. Otwórz ten sam link ponownie za chwilę.'
        : (error instanceof Error?error.message:'Nie udało się pobrać zlecenia.');
      fail(message);
    }
  }finally{
    window.clearTimeout(timeout);
    inFlight=false;
  }
};

if(!apiBase||!token||!/^[A-Za-z0-9_-]{43}$/.test(token)){
  fail('Link śledzenia jest nieprawidłowy albo niepełny.');
  return;
}

void load({initial:true});
timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},REFRESH_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load();});
window.addEventListener('focus',()=>void load());
window.addEventListener('pagehide',()=>{if(timer)window.clearInterval(timer);},{once:true});
})();