(()=>{'use strict';
const apiBase='https://br-steep-bonus-b1f1qh8u-lockonapi.compute.c-5.eu-central-1.aws.neon.tech';
const loading=document.getElementById('trackLoading');
const errorBox=document.getElementById('trackError');
const content=document.getElementById('trackContent');
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=(value)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'});};
const money=(value,currency='PLN')=>value==null?'—':new Intl.NumberFormat('pl-PL',{style:'currency',currency:String(currency||'PLN').trim()||'PLN'}).format(Number(value));
const token=decodeURIComponent((location.hash.match(/(?:^#|&)t=([^&]+)/)||[])[1]||'');
const fail=(message)=>{loading.hidden=true;content.hidden=true;errorBox.hidden=false;document.getElementById('trackErrorText').textContent=message||'Link jest nieprawidłowy albo nieaktywny.';};
if(!apiBase||!token||!/^[A-Za-z0-9_-]{43}$/.test(token)){fail('Link śledzenia jest nieprawidłowy albo niepełny.');return;}
fetch(apiBase+'/public/service-track?token='+encodeURIComponent(token),{method:'GET',headers:{Accept:'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})
.then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.message||'Nie udało się pobrać zlecenia.');return payload;})
.then(({order,statusHistory=[],transfers=[]})=>{
  document.getElementById('orderNumber').textContent='#'+order.orderNumber;
  document.getElementById('deviceName').textContent=[order.device?.brand,order.device?.model].filter(Boolean).join(' ')||'Urządzenie';
  document.getElementById('issueDescription').textContent=order.issueDescription||'Brak opisu.';
  document.getElementById('currentStatus').textContent=order.handlingMode==='TRANSFER_ONLY'&&order.status!=='CANCELLED'?'Tylko przekazanie · '+order.statusLabel:order.statusLabel;
  document.getElementById('updatedAt').textContent='Aktualizacja: '+formatDate(order.updatedAt);
  document.getElementById('pointName').textContent=order.pointName||'—';
  document.getElementById('currentPoint').textContent=order.currentPointName||order.homePointName||'W transporcie';
  document.getElementById('eta').textContent=order.estimatedCompletionAt?formatDate(order.estimatedCompletionAt):'Brak terminu';
  const price=order.finalCost!=null?money(order.finalCost,order.currency):(order.estimatedCost!=null?'około '+money(order.estimatedCost,order.currency):'Brak wyceny');
  document.getElementById('price').textContent=price;

  const statusEl=document.getElementById('statusTimeline');
  statusEl.innerHTML=statusHistory.length?statusHistory.map(item=>'<article><i></i><div><strong>'+esc(item.toLabel)+'</strong><span>'+esc(formatDate(item.changedAt))+(item.fromLabel?' · wcześniej: '+esc(item.fromLabel):'')+'</span></div></article>').join(''):'<div class="track-empty">Brak zapisanych zmian statusu.</div>';

  const transferLabels={REQUESTED:'Oczekuje',IN_TRANSIT:'W drodze',DELIVERED:'Dostarczono',ACCEPTED:'Przyjęto',REJECTED:'Odrzucono',CANCELLED:'Anulowano'};
  const transferEl=document.getElementById('transferTimeline');
  transferEl.innerHTML=transfers.length?transfers.map(item=>{
    const kind=item.kind==='RETURN_HOME'?'Powrót do punktu macierzystego':'Przekazanie urządzenia';
    const time=item.acceptedAt||item.deliveredAt||item.shippedAt||item.requestedAt||item.updatedAt;
    return '<article><div><strong>'+esc(item.fromPointName)+' → '+esc(item.toPointName)+'</strong><p>'+esc(kind)+'</p></div><span class="track-transfer-status">'+esc(transferLabels[item.status]||item.status)+'</span><small>'+esc(formatDate(time))+'</small></article>';
  }).join(''):'<div class="track-empty">Urządzenie nie było jeszcze przekazywane między punktami.</div>';

  loading.hidden=true;errorBox.hidden=true;content.hidden=false;
}).catch(error=>fail(error instanceof Error?error.message:'Nie udało się pobrać zlecenia.'));
})();