(() => {
  const pendingScanKey='lockon.pending.service.scan.v1';
  let pendingScanToken='';
  try{
    const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    pendingScanToken=String(hash.get('scan')||'').trim().slice(0,100);
    if(pendingScanToken){
      sessionStorage.setItem(pendingScanKey,pendingScanToken);
      history.replaceState(null,'',location.pathname+location.search);
    }else{
      pendingScanToken=sessionStorage.getItem(pendingScanKey)||'';
    }
  }catch{}
  const onboardingKey = 'lockon.employee.onboarding.v1';
  let onboardingAccepted = false;
  try { onboardingAccepted = localStorage.getItem(onboardingKey) === 'accepted'; } catch {}
  if (!onboardingAccepted) {
    window.location.replace('index.html?next=panel#start');
    return;
  }

  const config = window.LOCKON_WEB_AUTH || {};
  const apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const tokenKey = 'lockon.web.session';
  const readStoredToken = () => {
    try {
      const persistent = localStorage.getItem(tokenKey) || '';
      if (persistent) return persistent;
      const legacy = sessionStorage.getItem(tokenKey) || '';
      if (legacy) {
        localStorage.setItem(tokenKey, legacy);
        sessionStorage.removeItem(tokenKey);
        return legacy;
      }
    } catch {}
    try { return sessionStorage.getItem(tokenKey) || ''; } catch { return ''; }
  };
  const clearStoredToken = () => {
    try { localStorage.removeItem(tokenKey); } catch {}
    try { sessionStorage.removeItem(tokenKey); } catch {}
  };
  let token = readStoredToken();
  let me = null;
  let orders = [];
  let transfers = [];
  let customerQuotes = [];
  let servicePoints = [];
  let admin = null;
  let auditEvents = [];
  let financeData = null;
  let activePointId = '';
  let transferFilter = '';
  let orderFilter = 'ALL';
  let activeOrderId = '';
  let supportConversation = null;
  let supportPresence = [];
  let supportTickets = [];
  let mobileHelpToolResult = null;
  let mobileHelpTarget = 'BOT';
  let mobileHelpSending = false;
  let technicianWorkspace = null;
  let technicianNotes = [];
  let invoiceWarehouse = [];
  let monthlyInvoicePeriod = '';
  let pendingServiceCardOrder = null;
  let scannerStream = null;
  let scannerFrame = 0;
  let scannerBusy = false;
  let newOrderBusy = false;

  const STATUS_LABELS = {
    RECEIVED:'Przyjęto urządzenie', DIAGNOSIS:'Diagnoza', WAITING_PARTS:'Oczekiwanie na części',
    IN_REPAIR:'W naprawie', REPAIR_DONE:'Naprawa zakończona', READY:'Gotowe do odbioru', COMPLETED:'Zakończone',
    CANCELLED:'Anulowane', REJECTED:'Odrzucone'
  };
  const TRANSFER_LABELS = {
    REQUESTED:'Oczekuje', IN_TRANSIT:'W drodze', DELIVERED:'Dostarczono',
    ACCEPTED:'Przyjęte', REJECTED:'Odrzucone', CANCELLED:'Anulowane'
  };
  const SERVICE_READ = new Set(['OWNER','BOSS','COORDINATOR','SUPPORT','TECHNICIAN','USER']);
  const SERVICE_EDIT = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN']);
  const SERVICE_CREATE = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN','USER']);
  const SERVICE_TRANSFER = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN','USER']);
  const SERVICE_MANAGE = new Set(['OWNER','BOSS','COORDINATOR']);
  const FINANCE_READ = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN']);
  const CUSTOMER_QUOTE_STAFF = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN']);

  const esc = (value) => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept','application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    if (token) headers.set('Authorization','Bearer ' + token);
    const response = await fetch(apiBaseUrl + path, {
      ...options, headers, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || 'Błąd ServiceOS (' + response.status + ').');
      error.code = payload?.error || 'REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const toast = (message, kind = 'ok') => {
    const el = document.getElementById('panelToast');
    if (!el) return;
    el.textContent = message;
    el.className = 'panel-toast ' + kind;
    el.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => { el.hidden = true; }, 3600);
  };

  const redirectLogin = (clear = true) => {
    if (clear) clearStoredToken();
    window.location.replace('index.html?login=1');
  };

  const role = () => String(me?.user?.role || '');
  const canReadService = () => SERVICE_READ.has(role());
  const canEditService = () => SERVICE_EDIT.has(role());
  const canCreateService = () => SERVICE_CREATE.has(role());
  const canTransferService = () => SERVICE_TRANSFER.has(role());
  const canCancelService = () => canCreateService();
  const canManageService = () => SERVICE_MANAGE.has(role());
  const canReadFinance = () => FINANCE_READ.has(role());
  const canHandleCustomerQuotes = () => CUSTOMER_QUOTE_STAFF.has(role());
  const isOwner = () => role() === 'OWNER';
  const canSupportStaff = () => isOwner() || role() === 'SUPPORT' || me?.user?.supportEnabled === true;
  const pointIds = () => (me?.points || []).map((point) => point.id);
  const canOperatePoint = (pointId) => ['OWNER','BOSS'].includes(role()) || pointIds().includes(pointId);

  const showView = (name) => {
    if (name === 'admin' && !isOwner()) name = 'more';
    if (name === 'earnings' && !canReadFinance()) name = 'more';
    if (name === 'quotes' && !canHandleCustomerQuotes()) name = 'more';
    if (name === 'workspace' && role() !== 'TECHNICIAN') name = 'more';
    if (name === 'tech-notes' && role() !== 'TECHNICIAN') name = 'more';
    if (name === 'invoices' && !canEditService()) name = 'more';
    if (['new','orders','transfers','scan'].includes(name) && !canReadService()) name = 'home';
    if (name === 'new' && !canCreateService()) name = 'home';

    document.querySelectorAll('.panel-view').forEach((view) => view.classList.toggle('active', view.id === 'view-' + name));

    const advanced = ['quotes','earnings','admin','scan','workspace','tech-notes','invoices','support'];
    const bottomName = advanced.includes(name) ? 'more' : name;
    document.querySelectorAll('.panel-bottom-nav [data-panel-nav]').forEach((button) => {
      button.classList.toggle('active', button.dataset.panelNav === bottomName);
    });

    window.scrollTo({top:0,behavior:'auto'});
    if (name !== 'scan') stopServiceScanner();
    if (name === 'orders') renderOrders();
    if (name === 'transfers') void loadTransfers();
    if (name === 'workspace') void loadTechnicianWorkspace();
    if (name === 'tech-notes') void loadTechnicianNotes();
    if (name === 'invoices') void loadInvoiceWarehouse();
    if (name === 'earnings') void loadFinance();
    if (name === 'quotes') void loadCustomerQuotes();
    if (name === 'admin') void loadAdmin();
    if (name === 'support') void loadSupport();
  };

  const formatDate = (value) => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'}); }
    catch { return String(value); }
  };

  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map((x) => x[0]).join('').toUpperCase();
  const ROLE_LABELS = {
    OWNER:'Właściciel',
    BOSS:'Kierownik',
    COORDINATOR:'Koordynator',
    SUPPORT:'Obsługa',
    TECHNICIAN:'Serwisant',
    USER:'Pracownik'
  };
  const accountRoleLabel = (value) => ROLE_LABELS[String(value || '').toUpperCase()] || 'Pracownik';

  const renderAccount = () => {
    const user = me?.user || {};
    document.getElementById('panelGreeting').textContent = user.name ? 'Dzień dobry, ' + String(user.name).split(' ')[0] + '.' : 'Dzień dobry.';
    document.getElementById('panelAccountButton').textContent = initials(user.name);
    document.getElementById('accountInitials').textContent = initials(user.name);
    document.getElementById('accountName').textContent = user.name || 'Konto ServiceOS';
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountRole').textContent = accountRoleLabel(user.role);
    document.querySelectorAll('[data-open-account] b').forEach((el) => { el.textContent = initials(user.name); });

    document.querySelectorAll('.owner-only').forEach((el) => { el.hidden = !isOwner(); });
    document.querySelectorAll('.management-only').forEach((el) => { el.hidden = !canManageService(); });
    document.querySelectorAll('.service-edit-only').forEach((el) => { el.hidden = !canEditService(); });
    document.querySelectorAll('.finance-only').forEach((el) => { el.hidden = !canReadFinance(); });
    document.querySelectorAll('.quote-staff-only').forEach((el) => { el.hidden = !canHandleCustomerQuotes(); });
    document.querySelectorAll('.support-staff-only').forEach((el) => { el.hidden = !canSupportStaff(); });
    document.querySelectorAll('.technician-only').forEach((el) => { el.hidden = role() !== 'TECHNICIAN'; });

    if (!canReadService()) {
      document.querySelectorAll('[data-panel-nav="new"],[data-panel-nav="orders"],[data-panel-nav="transfers"]').forEach((el) => { el.hidden = true; });
    } else if (!canCreateService()) {
      document.querySelectorAll('[data-panel-nav="new"]').forEach((el) => { el.hidden = true; });
    }
  };

  const syncMobileIntakeMode = () => {
    const orderType=document.getElementById('mobileOrderType')?.value||'REPAIR';
    const point=(me?.points||[]).find((item)=>item.id===activePointId);
    const text=document.getElementById('mobileIntakeAutoText');
    if(text)text.textContent=(point?'Punkt: '+point.name+(point.city?' · '+point.city:'')+'. ':'')+
      (orderType==='COMPLAINT'
        ? 'Reklamacja uruchamia przepływ reklamacyjny automatycznie.'
        : 'Naprawa uruchamia standardowy przepływ serwisowy automatycznie.');
  };

  const renderPoints = () => {
    const select = document.getElementById('panelPointSelect');
    const points = me?.points || [];
    if (!activePointId || !points.some((p) => p.id === activePointId)) {
      activePointId = points.some((p)=>p.id===me?.activePointId) ? me.activePointId : (points[0]?.id || '');
    }
    select.innerHTML = points.map((point) => '<option value="' + esc(point.id) + '">' + esc(point.name) + (point.city ? ' · ' + esc(point.city) : '') + '</option>').join('');
    select.value = activePointId;
    syncMobileIntakeMode();
  };


  const stopServiceScanner = () => {
    if(scannerFrame){cancelAnimationFrame(scannerFrame);scannerFrame=0;}
    if(scannerStream){
      scannerStream.getTracks().forEach((track)=>track.stop());
      scannerStream=null;
    }
    const video=document.getElementById('mobileScannerVideo');
    if(video)video.srcObject=null;
  };

  const extractStaffScanToken = (value) => {
    const raw=String(value||'').trim();
    try{
      const url=new URL(raw,location.href);
      const params=new URLSearchParams(String(url.hash||'').replace(/^#/,''));
      const tokenValue=String(params.get('scan')||'').trim();
      if(tokenValue)return tokenValue.slice(0,100);
    }catch{}
    return '';
  };

  const formatServiceScanCode = (value) => {
    let raw=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(raw.startsWith('SV'))raw=raw.slice(2);
    raw=raw.slice(0,8);
    return raw?'SV-'+(raw.match(/.{1,4}/g)||[]).join('-'):'';
  };

  const processServiceScan = async ({tokenValue='',codeValue=''}={}) => {
    if(scannerBusy)return;
    if(!activePointId)return toast('Wybierz aktywny punkt przed skanowaniem.','error');
    const code=formatServiceScanCode(codeValue);
    if(!tokenValue&&!code)return toast('Zeskanuj QR albo wpisz kod SV-XXXX-XXXX.','error');
    scannerBusy=true;
    const status=document.getElementById('mobileScannerResult');
    const submit=document.querySelector('#mobileScannerForm button');
    if(submit)submit.disabled=true;
    if(status){status.className='panel-form-status';status.textContent='Sprawdzam urządzenie i logistykę…';}
    try{
      const result=await api('/service/scan',{
        method:'POST',
        body:JSON.stringify({token:tokenValue||undefined,code:code||undefined})
      });
      try{sessionStorage.removeItem(pendingScanKey);}catch{}
      pendingScanToken='';
      stopServiceScanner();
      const labels={
        SERVICE_ACCEPTED:'Urządzenie przyjęte w serwisie.',
        RETURN_ACCEPTED_READY:'Urządzenie wróciło do punktu macierzystego i jest gotowe do odbioru.',
        RETURN_ACCEPTED:'Przyjęto zwrot urządzenia.',
        ALREADY_AT_POINT:'Urządzenie jest już przypisane do tego punktu.',
        OPEN_ORDER:'Otwieram zlecenie.'
      };
      if(status){status.className='panel-form-status ok';status.textContent=labels[result.scanAction]||'Skan zapisany.';}
      toast(labels[result.scanAction]||'Skan zapisany.');
      await Promise.all([loadOrders(),loadTransfers()]);
      if(result.order?.id){
        showView('orders');
        await openOrder(result.order.id);
      }
    }catch(error){
      if(status){status.className='panel-form-status error';status.textContent=error.message||'Nie udało się przyjąć urządzenia.';}
      toast(error.message||'Nie udało się przyjąć urządzenia.','error');
    }finally{
      scannerBusy=false;
      if(submit)submit.disabled=false;
    }
  };

  const startServiceScanner = async () => {
    if(scannerStream||scannerBusy)return;
    const status=document.getElementById('mobileScannerCameraStatus');
    if(!navigator.mediaDevices?.getUserMedia){
      if(status)status.textContent='Ta przeglądarka nie udostępnia aparatu. Użyj aparatu telefonu do otwarcia QR albo wpisz kod ręcznie.';
      return;
    }
    if(!('BarcodeDetector' in window)){
      if(status)status.textContent='Skaner QR w tej przeglądarce nie jest dostępny. Zeskanuj QR zwykłym aparatem telefonu albo wpisz kod ręcznie.';
      return;
    }
    try{
      scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const video=document.getElementById('mobileScannerVideo');
      if(!video)throw new Error('Brak podglądu aparatu.');
      video.srcObject=scannerStream;
      await video.play();
      const detector=new window.BarcodeDetector({formats:['qr_code']});
      if(status)status.textContent='Skieruj aparat na QR z karty urządzenia.';
      const detect=async()=>{
        if(!scannerStream||scannerBusy)return;
        try{
          const codes=await detector.detect(video);
          const raw=codes?.[0]?.rawValue||'';
          const tokenValue=extractStaffScanToken(raw);
          if(tokenValue){
            if(status)status.textContent='QR rozpoznany. Przyjmuję urządzenie…';
            await processServiceScan({tokenValue});
            return;
          }
        }catch{}
        if(scannerStream)scannerFrame=requestAnimationFrame(()=>void detect());
      };
      scannerFrame=requestAnimationFrame(()=>void detect());
    }catch(error){
      stopServiceScanner();
      if(status)status.textContent=error?.message||'Nie udało się uruchomić aparatu. Użyj kodu ręcznego.';
    }
  };

  const activeOrders = () => orders.filter((order) => !['COMPLETED','CANCELLED','REJECTED'].includes(order.status));
  const openTransfers = () => transfers.filter((item) => ['REQUESTED','IN_TRANSIT','DELIVERED'].includes(item.status));

  const renderKpis = () => {
    document.getElementById('kpiActive').textContent = canReadService() ? String(activeOrders().length) : '—';
    document.getElementById('kpiTransfers').textContent = canReadService() ? String(openTransfers().length) : '—';
    if (admin?.system) {
      document.getElementById('kpiWebSessions').textContent = String(admin.system.webSessions ?? 0);
      document.getElementById('kpiBlocked').textContent = String(admin.system.blockedUsers ?? 0);
    }
  };

  const orderCard = (order, compact = false) => {
    const transfer = order.latestTransfer;
    const location = order.currentLocationLabel || order.currentPointName || order.pointName;
    const context = [
      {label:'Punkt macierzysty',value:order.homePointName || order.pointName,kind:'home'},
      {label:'Urządzenie jest teraz',value:location,kind:'location'},
      {label:'Serwisant',value:order.assignedTechnicianName || 'Nieprzypisany',kind:'technician'},
      {label:'Termin',value:order.estimatedCompletionAt ? formatDate(order.estimatedCompletionAt) : 'Brak terminu',kind:'eta'},
      order.finalCost != null ? {label:'Cena',value:Number(order.finalCost).toFixed(2)+' PLN',kind:'price'} :
        order.estimatedCost != null ? {label:'Wycena',value:'około '+Number(order.estimatedCost).toFixed(2)+' PLN',kind:'price'} : null,
      transfer ? {label:transfer.kind==='RETURN_HOME'?'Powrót urządzenia':'Przekazanie',value:(TRANSFER_LABELS[transfer.status] || transfer.status)+' → '+(transfer.toPointName || ''),kind:'transfer'} : null
    ].filter(Boolean);
    const shownContext = compact ? context.slice(0,2) : context;
    const contextHtml = '<div class="panel-order-context'+(compact?' compact':'')+'">' + shownContext.map((item) =>
      '<div class="'+esc(item.kind)+'"><span>'+esc(item.label)+'</span><strong>'+esc(item.value)+'</strong></div>'
    ).join('') + '</div>';
    const workflow = order.workflow || null;
    const cardStatus = STATUS_LABELS[order.status] || order.statusLabel || 'W toku';
    return '<article class="panel-order-card workflow-' + esc(String(workflow?.attentionCode || 'ACTIVE').toLowerCase()) + '" data-order-id="' + esc(order.id) + '">' +
      '<div class="panel-order-top">' +
        '<div class="panel-order-number"><strong>#' + esc(order.orderNumber) + '</strong><small>' + esc(formatDate(order.receivedAt)) + '</small></div>' +
        '<div class="panel-order-main"><strong>' + esc(order.customerName) + '</strong><span>' + esc(order.brand + ' ' + order.model) + '</span><small>' + esc(order.handlingMode === 'TRANSFER_ONLY' ? 'Tylko przekazanie' : 'Zlecenie serwisowe') + '</small></div>' +
        '<div class="panel-status-pill">' + esc(cardStatus) + '</div>' +
      '</div>' +
      contextHtml +
      (workflow ? '<div class="mobile-workflow-strip">' +
        '<div><span>Etap ' + esc(workflow.stageNumber) + '/' + esc(workflow.stageTotal) + '</span><strong>' + esc(workflow.stageLabel) + '</strong><progress max="100" value="' + esc(workflow.progressPercent) + '"></progress></div>' +
        '<div><span>Następna akcja</span><strong>' + esc(workflow.nextAction) + '</strong></div>' +
        '<em class="' + esc(String(workflow.attentionCode || '').toLowerCase()) + '">' + esc(workflow.attentionLabel) +
          (workflow.dueInMinutes != null && workflow.dueInMinutes < 0 ? '<small>' + esc(Math.ceil(Math.abs(workflow.dueInMinutes)/60)) + ' h po terminie</small>' : '') +
          (workflow.dueInMinutes != null && workflow.dueInMinutes >= 0 && workflow.dueInMinutes <= 1440 ? '<small>' + esc(Math.max(1,Math.ceil(workflow.dueInMinutes/60))) + ' h do terminu</small>' : '') +
        '</em>' +
      '</div>' : '') +
      (!compact && order.imei ? '<div class="panel-order-meta"><span>IMEI ' + esc(order.imei) + '</span></div>' : '') +
      '<button type="button" data-open-order="' + esc(order.id) + '">Otwórz szczegóły →</button>' +
    '</article>';
  };

  const renderHome = () => {
    const host = document.getElementById('homeOrders');
    const focus = document.getElementById('panelFocus');
    if (!canReadService()) {
      host.innerHTML = '<div class="panel-list-empty">Twoja rola nie ma dostępu do modułu Serwis.</div>';
      if (focus) focus.innerHTML = '';
      renderKpis();
      return;
    }
    const first = orders.find((order) => order.workflow?.nextActionCode !== 'NONE');
    if (focus) {
      focus.innerHTML = first?.workflow
        ? '<button type="button" data-open-order="' + esc(first.id) + '" class="' + esc(String(first.workflow.attentionCode || 'ACTIVE').toLowerCase()) + '">' +
            '<div><span>NASTĘPNA AKCJA · #' + esc(first.orderNumber) + '</span><strong>' + esc(first.workflow.nextAction) + '</strong><small>' + esc(first.brand + ' ' + first.model) + ' · ' + esc(first.workflow.stageLabel) + (first.estimatedCompletionAt ? ' · termin ' + esc(formatDate(first.estimatedCompletionAt)) : '') + '</small></div>' +
            '<b>→</b>' +
          '</button>'
        : '<div class="panel-focus-clear"><span>✓</span><strong>Brak pilnych działań w Twoim zakresie.</strong></div>';
    }
    const homeLimit = window.matchMedia?.('(max-width: 760px)').matches ? 2 : 4;
    host.innerHTML = orders.slice(0,homeLimit).map((order) => orderCard(order,true)).join('') || '<div class="panel-list-empty">Brak zleceń w Twoim zakresie.</div>';
    renderKpis();
  };

  const renderOrders = () => {
    const query = String(document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
    const filters = [
      ['ALL','Wszystkie'],
      ['ACTION_NOW','Działaj teraz'],
      ['DUE_SOON','Kończy się termin'],
      ['OVERDUE','Po terminie'],
      ['IN_TRANSIT','W drodze'],
      ['WAITING_SERVICE','Czeka na serwis'],
      ['WAITING_PARTS','Czeka na części'],
      ['READY_FOR_PICKUP','Gotowe']
    ];
    const filterHost = document.getElementById('orderWorkflowFilters');
    if (filterHost) filterHost.innerHTML = filters.map(([code,label]) => {
      const count = code === 'ALL' ? orders.length : orders.filter((order)=>order.workflow?.flags?.includes(code)).length;
      return '<button class="' + (orderFilter === code ? 'active' : '') + '" data-order-filter="' + code + '">' + esc(label) + '<b>' + count + '</b></button>';
    }).join('');
    const visible = orders.filter((order) => {
      if (orderFilter !== 'ALL' && !order.workflow?.flags?.includes(orderFilter)) return false;
      if (!query) return true;
      return [order.orderNumber,order.customerName,order.brand,order.model,order.imei,order.pointName,order.workflow?.nextAction].some((value) => String(value || '').toLowerCase().includes(query));
    });
    const host = document.getElementById('ordersList');
    host.innerHTML = visible.map((order) => orderCard(order,false)).join('') || '<div class="panel-list-empty">Brak zleceń w tej sekcji.</div>';
  };

  const loadOrders = async () => {
    if (!canReadService()) { orders = []; return; }
    orders = await api('/service/orders');
    renderHome();
    renderOrders();
  };

  const transferActions = (transfer) => {
    const source = canOperatePoint(transfer.fromPointId);
    const destination = canOperatePoint(transfer.toPointId);
    if (!canEditService()) return '';
    const buttons = [];
    if (transfer.status === 'IN_TRANSIT' && destination) buttons.push('<button class="mini-action primary" data-transfer-action="DELIVERED" data-transfer-id="' + esc(transfer.id) + '">Dostarczono</button>');
    if (transfer.status === 'IN_TRANSIT' && source) buttons.push('<button class="mini-action" data-transfer-action="CANCELLED" data-transfer-id="' + esc(transfer.id) + '">Anuluj</button>');
    if (transfer.status === 'DELIVERED' && destination) {
      buttons.push('<button class="mini-action primary" data-transfer-action="ACCEPTED" data-transfer-id="' + esc(transfer.id) + '">Przyjmij</button>');
      buttons.push('<button class="mini-action danger" data-transfer-action="REJECTED" data-transfer-id="' + esc(transfer.id) + '">Odrzuć</button>');
    }
    return buttons.join('');
  };

  const renderTransfers = () => {
    const filtered = transfers.filter((item) => !transferFilter || item.status === transferFilter);
    const host = document.getElementById('transfersList');
    host.innerHTML = filtered.map((item) =>
      '<article class="panel-transfer-card">' +
        '<div class="transfer-icon">' + (item.status === 'ACCEPTED' ? '✓' : '⇄') + '</div>' +
        '<div class="transfer-content"><strong>#' + esc(item.orderNumber) + ' · ' + esc(item.customerName) + '</strong>' +
          '<span>' + esc(item.device || '') + '</span>' +
          '<small>' + esc(item.kind === 'RETURN_HOME' ? 'Powrót do punktu macierzystego · ' : 'Do serwisu · ') + esc(item.fromPointName) + ' → ' + esc(item.toPointName) + ' · ' + esc(TRANSFER_LABELS[item.status] || item.status) + ' · ' + esc(formatDate(item.updatedAt)) + '</small>' +
          (item.note ? '<p>' + esc(item.note) + '</p>' : '') +
        '</div>' +
        '<div class="transfer-actions">' + transferActions(item) + '</div>' +
      '</article>'
    ).join('') || '<div class="panel-list-empty">Brak przekazań w tym widoku.</div>';
    renderKpis();
  };

  const loadTransfers = async () => {
    if (!canReadService()) { transfers=[]; servicePoints=[]; return; }
    [transfers,servicePoints] = await Promise.all([
      api('/service/transfers'),
      api('/service/service-points')
    ]);
    renderTransfers();
    renderHome();
  };

  const updateTransfer = async (id,status) => {
    try {
      const result = await api('/service/transfers/' + encodeURIComponent(id) + '/status', {
        method:'POST', body:JSON.stringify({status})
      });
      toast(result?.notification?.sent ? 'Etap zapisany. Klient dostał wiadomość.' : 'Etap przekazania zapisany.');
      await Promise.all([loadTransfers(),loadOrders()]);
    } catch (error) { toast(error.message || 'Nie udało się zmienić etapu.','error'); }
  };


  const mobilePartRowHtml=(part={})=>'<div class="mobile-cost-part-row" data-mobile-part-row>'+
    '<input data-part-description maxlength="240" placeholder="Część, np. wyświetlacz" value="'+esc(part.description||'')+'">'+
    '<input data-part-quantity type="number" min="0.01" step="0.01" value="'+esc(part.quantity??1)+'" aria-label="Ilość">'+
    '<input data-part-cost type="number" min="0" step="0.01" value="'+esc(part.unitCostGross??0)+'" aria-label="Koszt brutto sztuki">'+
    '<label><input data-part-invoice type="checkbox"'+(part.invoiceReceived?' checked':'')+'> FV</label>'+
    '<input data-part-invoice-number maxlength="120" placeholder="Numer FV" value="'+esc(part.invoiceNumber||'')+'">'+
    '<input data-part-supplier maxlength="180" placeholder="Dostawca" value="'+esc(part.supplier||'')+'">'+
    '<input data-part-purchased type="date" value="'+esc(part.purchasedAt?String(part.purchasedAt).slice(0,10):'')+'">'+
    '<button type="button" data-mobile-part-remove>×</button>'+
  '</div>';

  const renderMobileCostingSection=(order,costing,editable)=>{
    if(!costing)return '';
    const invoiceRows=(costing.invoices||[]).map((invoice)=>'<article class="mobile-order-invoice"><div><strong>'+esc(invoice.invoiceNumber||invoice.fileName)+'</strong><span>'+esc(invoice.supplier||'Brak dostawcy')+(invoice.invoiceDate?' · '+esc(invoice.invoiceDate):'')+(invoice.grossAmount!=null?' · '+esc(money(invoice.grossAmount)):'')+'</span><small>'+esc(invoice.fileName)+'</small></div><button type="button" data-invoice-download="'+esc(invoice.id)+'">Pobierz</button></article>').join('')||'<div class="panel-list-empty">Brak faktur PDF dla tego zlecenia.</div>';
    return '<div class="order-dialog-section mobile-order-costing"><span>WYCENA, CZĘŚCI I FAKTURY</span>'+
      '<div class="mobile-cost-summary"><div><small>Części</small><strong>'+esc(money(costing.partsCostGross))+'</strong></div><div><small>Robocizna</small><strong>'+esc(money(costing.laborCostGross))+'</strong></div><div><small>Koszt wewnętrzny</small><strong>'+esc(money(costing.internalCostGross))+'</strong></div><div><small>Marża</small><strong>'+esc(costing.marginGross==null?'—':money(costing.marginGross))+'</strong></div></div>'+
      (editable?'<div class="mobile-cost-edit"><label><small>Robocizna (PLN)</small><input id="mobileLaborCost" type="number" min="0" step="0.01" value="'+esc(costing.laborCostGross||0)+'"></label><label><small>Inne koszty (PLN)</small><input id="mobileOtherCost" type="number" min="0" step="0.01" value="'+esc(costing.otherCostGross||0)+'"></label></div>'+
        '<div id="mobilePartsEditor" class="mobile-parts-editor">'+(costing.parts||[]).map(mobilePartRowHtml).join('')+'</div>'+
        '<div class="order-dialog-actions"><button class="mini-action" type="button" data-mobile-part-add>+ Część</button><button class="mini-action primary" type="button" data-save-mobile-costing="'+esc(order.id)+'">Zapisz koszty</button></div>'+
        '<div class="mobile-invoice-upload"><strong>Dodaj fakturę zakupu PDF</strong><div class="mobile-invoice-meta"><input id="mobileInvoiceNumber" maxlength="120" placeholder="Numer faktury"><input id="mobileInvoiceSupplier" maxlength="180" placeholder="Dostawca"><input id="mobileInvoiceDate" type="date"><input id="mobileInvoiceAmount" type="number" min="0" step="0.01" placeholder="Kwota brutto"></div><input id="mobileInvoiceFile" type="file" accept="application/pdf,.pdf"><button class="mini-action primary" type="button" data-upload-mobile-invoice="'+esc(order.id)+'">Dodaj PDF</button></div>'
      :'')+
      '<div class="mobile-order-invoices">'+invoiceRows+'</div>'+
    '</div>';
  };

  const saveMobileCosting=async(orderId)=>{
    const rows=[...document.querySelectorAll('[data-mobile-part-row]')];
    const parts=rows.map((row)=>({
      description:String(row.querySelector('[data-part-description]')?.value||'').trim(),
      quantity:Number(row.querySelector('[data-part-quantity]')?.value||1),
      unitCostGross:Number(row.querySelector('[data-part-cost]')?.value||0),
      invoiceReceived:row.querySelector('[data-part-invoice]')?.checked===true,
      invoiceNumber:String(row.querySelector('[data-part-invoice-number]')?.value||'').trim(),
      supplier:String(row.querySelector('[data-part-supplier]')?.value||'').trim(),
      purchasedAt:String(row.querySelector('[data-part-purchased]')?.value||'').trim()
    }));
    if(parts.some((part)=>!part.description||!Number.isFinite(part.quantity)||part.quantity<=0||!Number.isFinite(part.unitCostGross)||part.unitCostGross<0)){
      return toast('Sprawdź opis, ilość i koszt każdej części.','error');
    }
    try{
      await api('/service/orders/'+encodeURIComponent(orderId)+'/costing',{method:'POST',body:JSON.stringify({
        laborCostGross:Number(document.getElementById('mobileLaborCost')?.value||0),
        otherCostGross:Number(document.getElementById('mobileOtherCost')?.value||0),
        parts
      })});
      toast('Koszty części i robocizny zapisane.');
      await openOrder(orderId);
    }catch(error){toast(error.message||'Nie udało się zapisać kosztów.','error');}
  };

  const uploadMobileInvoice=async(orderId)=>{
    const input=document.getElementById('mobileInvoiceFile');
    const file=input?.files?.[0];
    if(!file)return toast('Wybierz fakturę PDF.','error');
    if(file.size<=0||file.size>20*1024*1024)return toast('PDF może mieć maksymalnie 20 MB.','error');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')return toast('Wybrany plik nie jest prawidłowym PDF.','error');
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const sha256=[...new Uint8Array(digest)].map((value)=>value.toString(16).padStart(2,'0')).join('');
    const button=document.querySelector('[data-upload-mobile-invoice="'+CSS.escape(orderId)+'"]');
    if(button)button.disabled=true;
    try{
      const intent=await api('/service/orders/'+encodeURIComponent(orderId)+'/invoices/upload-intent',{method:'POST',body:JSON.stringify({
        fileName:file.name,sizeBytes:file.size,sha256,
        invoiceNumber:String(document.getElementById('mobileInvoiceNumber')?.value||'').trim(),
        supplier:String(document.getElementById('mobileInvoiceSupplier')?.value||'').trim(),
        invoiceDate:String(document.getElementById('mobileInvoiceDate')?.value||'').trim(),
        grossAmount:document.getElementById('mobileInvoiceAmount')?.value||null
      })});
      const upload=await fetch(intent.uploadUrl,{method:'PUT',headers:intent.requiredHeaders||{'content-type':'application/pdf','x-amz-meta-sha256':sha256},body:bytes,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      if(!upload.ok)throw new Error('Magazyn PDF odrzucił plik (HTTP '+upload.status+').');
      await api('/service/invoices/'+encodeURIComponent(intent.invoiceId)+'/complete',{method:'POST',body:'{}'});
      toast('Faktura PDF dodana do magazynu.');
      await openOrder(orderId);
    }catch(error){toast(error.message||'Nie udało się dodać faktury.','error');}
    finally{if(button?.isConnected)button.disabled=false;}
  };

  const openOrder = async (id) => {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    activeOrderId = id;
    const dialog = document.getElementById('orderDialog');
    const host = document.getElementById('orderDialogContent');
    const activeTransfer = order.openTransfer || (order.latestTransfer && ['REQUESTED','IN_TRANSIT','DELIVERED'].includes(order.latestTransfer.status) ? order.latestTransfer : null);
    const currentServicePointId = activeTransfer ? '' : (order.currentPointId || order.homePointId || order.pointId);
    const homePointId = order.homePointId || order.pointId;
    const canOperateCurrentPoint = Boolean(currentServicePointId) && activePointId === currentServicePointId && canOperatePoint(currentServicePointId);
    const canTransferOrderHere = canTransferService() && canOperateCurrentPoint && !activeTransfer;
    const canEditOrderHere = canEditService() && canOperateCurrentPoint && !activeTransfer;
    const canCancelOrderHere = canCancelService() && canOperateCurrentPoint && !activeTransfer;
    const transferOnly = order.handlingMode === 'TRANSFER_ONLY';
    const availableServices = servicePoints.filter((point) => point.acceptsExternalRepairs && point.id !== currentServicePointId && point.id !== homePointId);
    const transferOnlyDestinations = [
      ...(currentServicePointId !== homePointId ? [{id:homePointId,name:order.homePointName || order.pointName,city:'punkt macierzysty',home:true}] : []),
      ...servicePoints.filter((point) => point.acceptsExternalRepairs && point.id !== currentServicePointId && point.id !== homePointId)
    ];

    let notes = [];
    let costing = null;
    try { notes = await api('/service/orders/' + encodeURIComponent(order.id) + '/notes'); } catch {}
    if(canEditService()){
      try { costing = await api('/service/orders/' + encodeURIComponent(order.id) + '/costing'); } catch {}
    }

    host.innerHTML =
      '<div class="order-dialog-head"><span>ZLECENIE #' + esc(order.orderNumber) + '</span><h2>' + esc(order.brand + ' ' + order.model) + '</h2><p>' + esc(order.customerName) + ' · ' + esc(order.pointName) + '</p></div>' +
      (order.workflow ? '<div class="order-dialog-section mobile-workflow-dialog"><span>CO ROBIMY DALEJ</span><div class="mobile-workflow-dialog-grid"><div><small>Etap ' + esc(order.workflow.stageNumber) + '/' + esc(order.workflow.stageTotal) + '</small><strong>' + esc(order.workflow.stageLabel) + '</strong></div><div><small>Następna akcja</small><strong>' + esc(order.workflow.nextAction) + '</strong></div><em class="' + esc(String(order.workflow.attentionCode || '').toLowerCase()) + '">' + esc(order.workflow.attentionLabel) + '</em></div></div>' : '') +
      '<div class="order-detail-grid">' +
        '<div><span>Tryb</span><strong>' + esc(transferOnly ? 'Tylko przekazanie' : 'Normalny serwis') + '</strong></div>' +
        '<div><span>Status</span><strong>' + esc(transferOnly && order.status !== 'CANCELLED' ? 'Tylko przekazanie' : order.statusLabel) + '</strong></div>' +
        '<div><span>IMEI</span><strong>' + esc(order.imei || '—') + '</strong></div>' +
        '<div><span>Punkt macierzysty</span><strong>' + esc(order.homePointName || order.pointName) + '</strong></div>' +
        '<div><span>Lokalizacja</span><strong>' + esc(order.currentLocationLabel || order.currentPointName || 'W transporcie') + '</strong></div>' +
        (!transferOnly ? '<div><span>Technik</span><strong>' + esc(order.assignedTechnicianName || 'Nieprzypisany') + '</strong></div><div><span>Termin</span><strong>' + esc(order.estimatedCompletionAt ? formatDate(order.estimatedCompletionAt) : '—') + '</strong></div><div><span>Cena orientacyjna</span><strong>' + esc(order.estimatedCost == null ? '—' : Number(order.estimatedCost).toFixed(2) + ' PLN') + '</strong></div><div><span>Cena końcowa</span><strong>' + esc(order.finalCost == null ? '—' : Number(order.finalCost).toFixed(2) + ' PLN') + '</strong></div>' : '') +
      '</div>' +
      '<div class="order-dialog-section"><span>OPIS USTERKI</span><p class="order-note-text">' + esc(order.issueDescription || '—') + '</p></div>' +
      (canEditOrderHere && !transferOnly ? '<div class="order-dialog-section"><span>CENY ZLECENIA</span><div class="mobile-price-grid"><label><small>Cena orientacyjna (PLN)</small><input id="mobileEstimatedCost" class="order-note-input" type="number" min="0" step="0.01" value="' + esc(order.estimatedCost == null ? '' : order.estimatedCost) + '"></label><label><small>Cena końcowa (PLN)</small><input id="mobileFinalCost" class="order-note-input" type="number" min="0" step="0.01" value="' + esc(order.finalCost == null ? '' : order.finalCost) + '"></label></div><div class="order-dialog-actions"><button class="mini-action primary" data-save-order-prices="' + esc(order.id) + '">Zapisz ceny</button></div></div>' : '') +
      (canCancelOrderHere && !canEditService() && order.status !== 'CANCELLED'
        ? '<div class="order-dialog-section transfer-only-mobile"><span>OBSŁUGA ZLECENIA</span><p class="order-note-text">Możesz uzupełnić dane przyjęcia, przekazać urządzenie dalej albo anulować zlecenie. Etapy naprawy są zablokowane.</p><div class="order-dialog-actions"><button class="mini-action danger" data-cancel-service="' + esc(order.id) + '">Anuluj zlecenie</button></div></div>'
        : canEditOrderHere && transferOnly
        ? '<div class="order-dialog-section transfer-only-mobile"><span>TRYB PRZEKAZANIA</span><p class="order-note-text">Etapy naprawy są zablokowane. Możesz tylko przekazywać urządzenie dalej albo anulować to zlecenie.</p>' + (order.status !== 'CANCELLED' ? '<div class="order-dialog-actions"><button class="mini-action danger" data-cancel-service="' + esc(order.id) + '">Anuluj zlecenie</button></div>' : '') + '</div>'
        : canEditOrderHere ? '<div class="order-dialog-section"><span>STATUS NAPRAWY</span><select id="mobileOrderStatus" class="order-status-select">' +
        Object.entries(STATUS_LABELS).map(([value,label]) => '<option value="' + value + '"' + (value === order.status ? ' selected' : '') + (((value === 'READY' && (order.canMarkReady === false || order.status !== 'REPAIR_DONE')) || (value === 'COMPLETED' && order.status !== 'READY')) ? ' disabled' : '') + '>' + esc(label) + '</option>').join('') +
        '</select><div class="order-dialog-actions"><button class="mini-action primary" data-save-order-status="' + esc(order.id) + '">Zapisz status</button></div></div>'
        : (canEditService() ? '<div class="order-dialog-section status-readonly-mobile"><span>STATUS NAPRAWY</span><p class="order-note-text"><strong>' + esc(order.statusLabel) + '</strong><br>' + esc(activeTransfer ? 'Status jest zablokowany na czas transportu urządzenia.' : 'Status może zmienić tylko punkt, w którym fizycznie znajduje się urządzenie.') + '</p></div>' : '')) +
      '<div class="order-dialog-section"><span>LOGISTYKA URZĄDZENIA</span>' +
        '<p class="order-note-text"><strong>Macierzysty:</strong> ' + esc(order.homePointName || order.pointName) + '<br><strong>Teraz:</strong> ' + esc(order.currentLocationLabel || order.currentPointName || 'W transporcie') + '</p>' +
        (activeTransfer
          ? '<p class="order-note-text">' + esc(activeTransfer.kind === 'RETURN_HOME' ? 'Powrót do punktu macierzystego' : 'Przekazanie do serwisu') + ' · ' + esc(TRANSFER_LABELS[activeTransfer.status] || activeTransfer.status) + ': ' + esc(activeTransfer.fromPointName) + ' → ' + esc(activeTransfer.toPointName) + '</p>'
          : transferOnly
            ? (canTransferOrderHere
                ? '<select id="mobileTransferPoint" class="order-transfer-select"><option value="">Wybierz punkt docelowy…</option>' + transferOnlyDestinations.map((point) => '<option value="' + esc(point.id) + '">' + esc(point.name + (point.city ? ' · ' + point.city : '')) + '</option>').join('') + '</select><input id="mobileTransferNote" class="order-note-input" maxlength="500" placeholder="Notatka do protokołu przekazania (opcjonalnie)"><div class="order-dialog-actions"><button class="mini-action primary" data-send-transfer="' + esc(order.id) + '">Przekaż urządzenie dalej</button></div>'
                : '<p class="order-note-text">Przekazanie może rozpocząć użytkownik obsługujący aktualny punkt.</p>')
          : order.returnRequired
            ? (canTransferOrderHere && order.status === 'REPAIR_DONE'
                ? '<input id="mobileReturnNote" class="order-note-input" maxlength="500" placeholder="Notatka do zwrotu (opcjonalnie)"><div class="order-dialog-actions"><button class="mini-action primary" data-send-return="' + esc(order.id) + '">Odeślij do punktu macierzystego</button></div>'
                : '<p class="order-note-text">' + esc(order.status === 'REPAIR_DONE' ? 'Zwrot musi rozpocząć użytkownik obsługujący aktualny punkt urządzenia.' : 'Urządzenie jest poza punktem macierzystym. Po zakończeniu naprawy ustaw „Naprawa zakończona”, a następnie rozpocznij obowiązkowy zwrot.') + '</p>')
            : canTransferOrderHere && availableServices.length
              ? '<select id="mobileTransferPoint" class="order-transfer-select"><option value="">Wybierz serwis docelowy…</option>' + availableServices.map((point) => '<option value="' + esc(point.id) + '">' + esc(point.name + ' · ' + point.city) + '</option>').join('') + '</select><input id="mobileTransferNote" class="order-note-input" maxlength="500" placeholder="Notatka dla serwisu (opcjonalnie)"><div class="order-dialog-actions"><button class="mini-action primary" data-send-transfer="' + esc(order.id) + '">Wyślij do serwisu</button></div>'
              : '<p class="order-note-text">Brak aktywnego transportu.</p>') +
      '</div>' +
      renderMobileCostingSection(order,costing,canEditOrderHere) +
      '<div class="order-dialog-section mobile-service-card-tools"><span>KARTA SERWISOWA</span><p class="order-note-text">Karta klienta ma QR otwierający jego portal bez wpisywania kodu. Karta urządzenia ma QR i kod ręczny do logistyki pracownika.</p><div class="order-dialog-actions"><button class="mini-action primary" data-service-card-print="PHYSICAL_AND_ONLINE" data-service-card-order="'+esc(order.id)+'">A4: klient + urządzenie</button><button class="mini-action" data-service-card-print="ONLINE_ONLY" data-service-card-order="'+esc(order.id)+'">Tylko karta urządzenia</button></div></div>' +
      '<div class="order-dialog-section"><span>NOTATKI WEWNĘTRZNE</span>' +
        (canEditService() ? '<input id="mobileInternalNote" class="order-note-input" maxlength="2000" placeholder="Dodaj notatkę…"><div class="order-dialog-actions"><button class="mini-action" data-add-note="' + esc(order.id) + '">Dodaj</button></div>' : '') +
        '<div class="mobile-note-list">' + (notes.slice(0,5).map((note) => '<div><strong>' + esc(note.authorName) + '</strong><small>' + esc(formatDate(note.createdAt)) + '</small><p>' + esc(note.body) + '</p></div>').join('') || '<p class="order-note-text">Brak notatek.</p>') + '</div>' +
      '</div>';
    dialog.showModal();
  };

  const saveOrderPrices = async (id) => {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    if (order.handlingMode === 'TRANSFER_ONLY') return toast('To zlecenie służy wyłącznie do przekazywania urządzenia.','error');
    const estimatedRaw = document.getElementById('mobileEstimatedCost')?.value ?? '';
    const finalRaw = document.getElementById('mobileFinalCost')?.value ?? '';
    const estimatedCost = estimatedRaw === '' ? null : Number(estimatedRaw);
    const finalCost = finalRaw === '' ? null : Number(finalRaw);
    if ((estimatedCost != null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) ||
        (finalCost != null && (!Number.isFinite(finalCost) || finalCost < 0))) {
      return toast('Wpisz prawidłowe ceny.','error');
    }
    try {
      await api('/service/orders/' + encodeURIComponent(id) + '/details', {
        method:'POST',
        body:JSON.stringify({
          imei:order.imei || '',
          serialNumber:order.serialNumber || '',
          deviceNotes:order.deviceNotes || '',
          estimatedCompletionAt:order.estimatedCompletionAt || null,
          estimatedCost,
          finalCost
        })
      });
      toast('Ceny zlecenia zostały zapisane.');
      document.getElementById('orderDialog')?.close();
      await loadOrders();
    } catch (error) { toast(error.message || 'Nie udało się zapisać cen.','error'); }
  };

  const saveOrderStatus = async (id, forcedStatus = '') => {
    const order = orders.find((item) => item.id === id);
    const status = forcedStatus || document.getElementById('mobileOrderStatus')?.value;
    if (!status || !order) return;
    if (!canEditService() && !(canCancelService() && status === 'CANCELLED')) return toast('Nie masz uprawnień do zmiany statusu naprawy.','error');
    if (order.handlingMode === 'TRANSFER_ONLY' && status !== 'CANCELLED') return toast('W trybie przekazania można jedynie anulować zlecenie.','error');
    try {
      const result = await api('/service/orders/' + encodeURIComponent(id) + '/status', {
        method:'POST', body:JSON.stringify({status})
      });
      const settlement = result?.settlement;
      const settlementText = settlement ? ' Rozliczenie ' + Number(settlement.amount || 0).toFixed(2) + ' ' + String(settlement.currency || 'PLN') + ' dodano automatycznie.' : '';
      if (result?.notification?.sent) {
        toast('Status zapisany. Klient otrzymał e-mail.' + settlementText);
      } else if (result?.notification?.queued) {
        toast('Status zapisany. E-mail jest w kolejce do ponowienia.' + settlementText);
      } else if (result?.notification?.reason === 'NO_CUSTOMER_EMAIL') {
        toast('Status zapisany. Klient nie ma adresu e-mail.' + settlementText);
      } else if (result?.notification?.reason === 'NO_SENDER') {
        toast('Status zapisany, ale brak aktywnego firmowego nadawcy Gmail.' + settlementText,'error');
      } else {
        toast('Status zapisany.' + settlementText);
      }
      document.getElementById('orderDialog')?.close();
      await loadOrders();
    } catch (error) { toast(error.message || 'Nie udało się zapisać statusu.','error'); }
  };

  const sendOrderTransfer = async (id) => {
    if (!canTransferService()) return toast('Nie masz uprawnień do przekazania urządzenia.','error');
    const toPointId = document.getElementById('mobileTransferPoint')?.value || '';
    const note = document.getElementById('mobileTransferNote')?.value || '';
    if (!toPointId) return toast('Wybierz serwis docelowy.','error');
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    const currentPointId = order.currentPointId || order.homePointId || order.pointId;
    const homePointId = order.homePointId || order.pointId;
    const kind = order.handlingMode === 'TRANSFER_ONLY' && currentPointId !== homePointId && toPointId === homePointId ? 'RETURN_HOME' : 'OUTBOUND_SERVICE';
    try {
      const result = await api('/service/orders/' + encodeURIComponent(id) + '/transfer', {
        method:'POST', body:JSON.stringify({toPointId,note,kind})
      });
      toast(result?.notification?.sent ? 'Urządzenie wysłano. Klient dostał wiadomość.' : 'Urządzenie wysłano do serwisu.');
      document.getElementById('orderDialog')?.close();
      await Promise.all([loadOrders(),loadTransfers()]);
    } catch (error) { toast(error.message || 'Nie udało się wysłać urządzenia.','error'); }
  };

  const sendOrderReturn = async (id) => {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    const note = document.getElementById('mobileReturnNote')?.value || '';
    try {
      const result = await api('/service/orders/' + encodeURIComponent(id) + '/transfer', {
        method:'POST',
        body:JSON.stringify({kind:'RETURN_HOME',toPointId:order.homePointId || order.pointId,note})
      });
      toast(result?.notification?.sent ? 'Urządzenie wraca do punktu macierzystego. Klient dostał wiadomość.' : 'Rozpoczęto zwrot do punktu macierzystego.');
      document.getElementById('orderDialog')?.close();
      await Promise.all([loadOrders(),loadTransfers()]);
    } catch (error) { toast(error.message || 'Nie udało się rozpocząć zwrotu.','error'); }
  };

  const addOrderNote = async (id) => {
    const body = String(document.getElementById('mobileInternalNote')?.value || '').trim();
    if (!body) return;
    try {
      await api('/service/orders/' + encodeURIComponent(id) + '/notes', {
        method:'POST', body:JSON.stringify({body})
      });
      toast('Notatka dodana.');
      await openOrder(id);
    } catch (error) { toast(error.message || 'Nie udało się dodać notatki.','error'); }
  };


  const localDayKey=(value)=>{
    const date=value instanceof Date?value:new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  };

  const renderTechnicianWorkspace=()=>{
    const summary=document.getElementById('technicianWorkspaceSummary');
    const calendar=document.getElementById('technicianWorkspaceCalendar');
    const queues=document.getElementById('technicianWorkspaceQueues');
    if(!summary||!calendar||!queues)return;
    const data=technicianWorkspace;
    if(!data){summary.innerHTML='';calendar.innerHTML='<div class="panel-list-empty">Ładowanie planu…</div>';queues.innerHTML='';return;}
    const counts=data.counts||{};
    summary.innerHTML=[
      ['Aktywne',counts.active||0],['W naprawie',counts.inRepair||0],['Czeka na części',counts.waitingParts||0],['Do odbioru',counts.readyForPickup||0],['Po terminie',counts.overdue||0]
    ].map(([label,value])=>'<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('');

    const days=Array.from({length:7},(_,index)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()+index);return date;});
    calendar.innerHTML=days.map((date)=>{
      const key=localDayKey(date);
      const items=(data.orders||[]).filter((order)=>order.estimatedCompletionAt&&localDayKey(order.estimatedCompletionAt)===key);
      return '<section><header><strong>'+esc(date.toLocaleDateString('pl-PL',{weekday:'short',day:'2-digit',month:'2-digit'}))+'</strong><b>'+items.length+'</b></header>'+
        (items.map((order)=>'<button type="button" data-workspace-order="'+esc(order.id)+'"><span>#'+esc(order.orderNumber)+' · '+esc(order.brand)+' '+esc(order.model)+'</span><strong>'+esc(order.customerName)+'</strong><small>'+esc(order.statusLabel||STATUS_LABELS[order.status]||order.status)+'</small></button>').join('')||'<small class="mobile-workspace-empty">Brak terminu</small>')+
      '</section>';
    }).join('');

    const groups=[
      ['Czeka na części',(data.orders||[]).filter((order)=>order.status==='WAITING_PARTS')],
      ['Gotowe / czeka na odbiór',(data.orders||[]).filter((order)=>['REPAIR_DONE','READY'].includes(order.status))],
      ['Bez terminu',(data.orders||[]).filter((order)=>!order.estimatedCompletionAt)]
    ];
    queues.innerHTML=groups.map(([label,items])=>'<section><h3>'+esc(label)+' <b>'+items.length+'</b></h3>'+
      (items.slice(0,15).map((order)=>'<button type="button" data-workspace-order="'+esc(order.id)+'"><span>#'+esc(order.orderNumber)+'</span><strong>'+esc(order.brand+' '+order.model)+'</strong><small>'+esc(order.customerName)+'</small></button>').join('')||'<div class="panel-list-empty">Pusto.</div>')+
    '</section>').join('');
  };

  const loadTechnicianWorkspace=async()=>{
    if(role()!=='TECHNICIAN')return;
    try{technicianWorkspace=await api('/service/technician-workspace');renderTechnicianWorkspace();}
    catch(error){toast(error.message||'Nie udało się pobrać planu serwisanta.','error');}
  };

  const renderTechnicianNotes=()=>{
    const host=document.getElementById('technicianNotesList');if(!host)return;
    host.innerHTML=technicianNotes.map((note)=>'<article class="'+(note.pinned?'pinned':'')+'"><header><strong>'+(note.pinned?'📌 ':'')+esc(note.title||'Notatka')+'</strong><button type="button" data-tech-note-delete="'+esc(note.id)+'">Usuń</button></header><p>'+esc(note.body).replace(/\n/g,'<br>')+'</p><small>'+esc(formatDate(note.updatedAt))+'</small></article>').join('')||'<div class="panel-list-empty">Twój pokój notatek jest pusty.</div>';
  };

  const loadTechnicianNotes=async()=>{
    if(role()!=='TECHNICIAN')return;
    try{technicianNotes=await api('/service/technician-notes');renderTechnicianNotes();}
    catch(error){toast(error.message||'Nie udało się pobrać prywatnych notatek.','error');}
  };

  const submitTechnicianNote=async(event)=>{
    event.preventDefault();
    if(role()!=='TECHNICIAN')return;
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
    const body=String(fd.get('body')||'').trim();if(!body)return;
    button.disabled=true;
    try{
      await api('/service/technician-notes',{method:'POST',body:JSON.stringify({
        title:String(fd.get('title')||'').trim(),body,pinned:fd.get('pinned')==='on'
      })});
      form.reset();await loadTechnicianNotes();toast('Prywatna notatka zapisana.');
    }catch(error){toast(error.message||'Nie udało się zapisać notatki.','error');}
    finally{button.disabled=false;}
  };

  const deleteTechnicianNote=async(id)=>{
    if(!window.confirm('Usunąć tę prywatną notatkę?'))return;
    try{await api('/service/technician-notes/'+encodeURIComponent(id),{method:'DELETE'});await loadTechnicianNotes();toast('Notatka usunięta.');}
    catch(error){toast(error.message||'Nie udało się usunąć notatki.','error');}
  };

  const renderInvoiceWarehouse=()=>{
    const host=document.getElementById('invoiceWarehouseList');
    const summary=document.getElementById('invoiceWarehouseSummary');
    if(!host||!summary)return;
    const total=invoiceWarehouse.reduce((sum,item)=>sum+Number(item.grossAmount||0),0);
    summary.innerHTML='<article><span>Dokumenty</span><strong>'+invoiceWarehouse.length+'</strong></article><article><span>Suma opisanych FV</span><strong>'+esc(money(total))+'</strong></article>';
    host.innerHTML=invoiceWarehouse.map((invoice)=>'<article><div><strong>'+esc(invoice.invoiceNumber||invoice.fileName)+'</strong><span>'+(invoice.orderNumber!=null?'Zlecenie #'+esc(invoice.orderNumber)+' · ':'')+esc(invoice.device||'Urządzenie')+'</span><small>'+esc(invoice.supplier||'Brak dostawcy')+(invoice.invoiceDate?' · '+esc(invoice.invoiceDate):'')+(invoice.grossAmount!=null?' · '+esc(money(invoice.grossAmount)):'')+'</small></div><button type="button" data-invoice-download="'+esc(invoice.id)+'">Pobierz</button></article>').join('')||'<div class="panel-list-empty">Brak faktur w wybranym miesiącu.</div>';
  };

  const loadInvoiceWarehouse=async()=>{
    if(!canEditService())return;
    const input=document.getElementById('invoiceWarehouseMonth');
    if(input&&!input.value)input.value=new Date().toISOString().slice(0,7);
    const month=input?.value||new Date().toISOString().slice(0,7);
    try{
      const result=await api('/service/invoices?month='+encodeURIComponent(month));
      invoiceWarehouse=result.invoices||[];renderInvoiceWarehouse();
    }catch(error){toast(error.message||'Nie udało się pobrać magazynu faktur.','error');}
  };

  const downloadInvoice=async(id)=>{
    try{
      const result=await api('/service/invoices/'+encodeURIComponent(id)+'/download-intent',{method:'POST',body:'{}'});
      const opened=window.open(result.downloadUrl,'_blank','noopener,noreferrer');
      if(!opened){const a=document.createElement('a');a.href=result.downloadUrl;a.rel='noopener';a.click();}
    }catch(error){toast(error.message||'Nie udało się pobrać faktury.','error');}
  };

  const downloadInvoiceMonth=async(period)=>{
    const month=period||document.getElementById('invoiceWarehouseMonth')?.value||new Date().toISOString().slice(0,7);
    try{
      const batch=await api('/service/invoices/download-batch',{method:'POST',body:JSON.stringify({period:month})});
      const files=batch.files||[];
      for(let index=0;index<files.length;index+=1){
        const item=files[index];
        const a=document.createElement('a');a.href=item.downloadUrl;a.rel='noopener';a.download=String(item.fileName||('faktura-'+(index+1)+'.pdf')).replace(/[\\/]/g,'_');
        document.body.appendChild(a);a.click();a.remove();
        if(index<files.length-1)await new Promise((resolve)=>setTimeout(resolve,120));
      }
      toast(files.length?'Uruchomiono pobieranie '+files.length+' faktur PDF.':'Brak faktur do pobrania.');
      return files.length;
    }catch(error){toast(error.message||'Nie udało się pobrać faktur.','error');return 0;}
  };

  const checkMonthlyInvoicePrompt=async()=>{
    if(role()!=='TECHNICIAN')return;
    try{
      const prompt=await api('/service/invoices/monthly-prompt');
      if(!prompt.show||!prompt.period)return;
      monthlyInvoicePeriod=prompt.period;
      const title=document.getElementById('monthlyInvoiceTitle');
      const text=document.getElementById('monthlyInvoiceText');
      if(title)title.textContent='Faktury · '+prompt.period;
      if(text)text.textContent='Masz '+prompt.count+' faktur PDF. Możesz pobrać wszystkie teraz albo wrócić do magazynu później.';
      document.getElementById('monthlyInvoiceDialog')?.showModal();
    }catch{}
  };

  const dismissMonthlyInvoicePrompt=async()=>{
    if(!monthlyInvoicePeriod)return;
    try{await api('/service/invoices/monthly-prompt/dismiss',{method:'POST',body:JSON.stringify({period:monthlyInvoicePeriod})});}
    catch{}
    document.getElementById('monthlyInvoiceDialog')?.close();
  };

  const money = (value) => new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(value || 0));

  const renderFinance = () => {
    if (!financeData) return;
    const summary = financeData.summary || {};
    const revenue = document.getElementById('financeRevenue');
    const technicians = document.getElementById('financeTechnicians');
    const boss = document.getElementById('financeBoss');
    if (revenue) revenue.textContent = money(summary.approvedRevenue);
    if (technicians) technicians.textContent = money(summary.technicianShare);
    if (boss) boss.textContent = money(summary.bossShare);
    const host = document.getElementById('financePoints');
    if (!host) return;
    host.innerHTML = (financeData.points || []).map((point) =>
      '<details class="mobile-finance-point"><summary><div><strong>'+esc(point.pointName)+'</strong><span>'+esc(point.pointCity || 'Punkt ServiceOS')+' · '+esc(point.entries?.length || 0)+' wpisów</span></div><div><span>Przychód <b>'+esc(money(point.approvedRevenue))+'</b></span><span>Firma <b>'+esc(money(point.bossShare))+'</b></span></div></summary><div class="mobile-finance-entries">' +
        (point.entries || []).map((entry) =>
          '<article><div><strong>'+(entry.orderNumber != null ? 'Zlecenie #'+esc(entry.orderNumber) : 'Wpis ręczny')+'</strong><span>'+esc(entry.technician?.name || 'Serwisant')+' · '+esc(entry.workDate)+'</span></div><b>'+esc(money(entry.amount))+'</b><small>'+esc(entry.splitTechnicianPercent)+'% / '+esc(entry.splitBossPercent)+'% · serwisant '+esc(money(entry.technicianShare))+' · firma '+esc(money(entry.bossShare))+'</small></article>'
        ).join('') +
      '</div></details>'
    ).join('') || '<div class="panel-list-empty">Brak rozliczeń.</div>';
  };

  const quoteStatusLabel=(status)=>({OPEN:'Oczekuje',QUOTED:'Wycena wysłana',CLOSED:'Zamknięte',CANCELLED:'Anulowane'}[status]||status);

  const renderCustomerQuotes = () => {
    const host=document.getElementById('customerQuotesList');
    if(!host)return;
    host.innerHTML=customerQuotes.map((item)=>{
      const routed=item.routedPointName!==item.requestedPointName
        ? '<small>Przekierowano: '+esc(item.requestedPointName)+' → '+esc(item.routedPointName)+'</small>'
        : '<small>Punkt: '+esc(item.routedPointName)+'</small>';
      const messages=(item.messages||[]).slice(-8).map((m)=>
        '<p class="customer-quote-message '+esc(String(m.senderKind||'').toLowerCase())+'"><b>'+
        esc(m.senderKind==='CUSTOMER'?'Klient':m.senderKind==='STAFF'?(m.senderName||'Serwis'):'ServiceOS')+
        ':</b> '+esc(m.body)+'<small>'+esc(formatDate(m.createdAt))+'</small></p>'
      ).join('');
      const priced=item.quoteAmount!=null
        ? '<div class="customer-quote-price"><span>Aktualna wycena</span><strong>'+esc(Number(item.quoteAmount).toFixed(2))+' '+esc(item.currency||'PLN')+'</strong>'+(item.quoteNote?'<small>'+esc(item.quoteNote)+'</small>':'')+'</div>'
        : '';
      const actions=['CLOSED','CANCELLED'].includes(item.status)?'':
        '<div class="customer-quote-actions">'+
          '<input data-quote-amount="'+esc(item.id)+'" type="number" min="0" step="0.01" placeholder="Kwota PLN" value="'+(item.quoteAmount!=null?esc(item.quoteAmount):'')+'">'+
          '<input data-quote-note="'+esc(item.id)+'" maxlength="1000" placeholder="Opis wyceny">'+
          '<button type="button" data-customer-quote-price="'+esc(item.id)+'">Wyślij wycenę</button>'+
        '</div>'+
        '<div class="customer-quote-actions">'+
          '<input data-quote-reply="'+esc(item.id)+'" maxlength="1000" placeholder="Wiadomość dla klienta">'+
          '<button type="button" data-customer-quote-reply="'+esc(item.id)+'">Odpowiedz</button>'+
          '<button type="button" class="secondary" data-customer-quote-close="'+esc(item.id)+'">Zamknij</button>'+
        '</div>';
      return '<article class="customer-quote-card">'+
        '<div class="customer-quote-head"><div><strong>'+esc(item.customerName)+' · '+esc(item.deviceDescription)+'</strong>'+routed+
        '<small>'+esc(item.customerEmail||item.customerPhone||'Brak kontaktu')+' · '+esc(formatDate(item.updatedAt))+'</small></div><span>'+esc(quoteStatusLabel(item.status))+'</span></div>'+
        '<p>'+esc(item.issueDescription)+'</p>'+
        (item.assignedTechnicianName?'<small>Serwisant: '+esc(item.assignedTechnicianName)+'</small>':'<small>Oczekuje na przypisanie serwisanta.</small>')+
        priced+'<div class="customer-quote-messages">'+messages+'</div>'+actions+
      '</article>';
    }).join('')||'<div class="panel-list-empty">Brak zapytań o wycenę w Twoim zakresie.</div>';
  };

  const loadCustomerQuotes = async () => {
    if(!canHandleCustomerQuotes())return;
    const params=new URLSearchParams();
    if(activePointId&& !['OWNER','BOSS'].includes(role())) params.set('pointId',activePointId);
    customerQuotes=await api('/service/customer-quotes'+(params.toString()?'?'+params.toString():''));
    renderCustomerQuotes();
  };

  const replyCustomerQuote = async (id) => {
    const input=document.querySelector('[data-quote-reply="'+CSS.escape(id)+'"]');
    const message=String(input?.value||'').trim();
    if(!message)return toast('Wpisz wiadomość dla klienta.','error');
    try{
      await api('/service/customer-quotes/'+encodeURIComponent(id)+'/reply',{method:'POST',body:JSON.stringify({message})});
      toast('Odpowiedź została zapisana w portalu klienta.');
      await loadCustomerQuotes();
    }catch(error){toast(error.message||'Nie udało się wysłać odpowiedzi.','error');}
  };

  const priceCustomerQuote = async (id) => {
    const amount=Number(document.querySelector('[data-quote-amount="'+CSS.escape(id)+'"]')?.value);
    const note=String(document.querySelector('[data-quote-note="'+CSS.escape(id)+'"]')?.value||'').trim();
    if(!Number.isFinite(amount)||amount<0)return toast('Podaj prawidłową kwotę wyceny.','error');
    try{
      await api('/service/customer-quotes/'+encodeURIComponent(id)+'/quote',{method:'POST',body:JSON.stringify({amount,note})});
      toast('Wycena została przekazana klientowi.');
      await loadCustomerQuotes();
    }catch(error){toast(error.message||'Nie udało się zapisać wyceny.','error');}
  };

  const closeCustomerQuote = async (id) => {
    try{
      await api('/service/customer-quotes/'+encodeURIComponent(id)+'/close',{method:'POST',body:'{}'});
      toast('Zapytanie zostało zamknięte.');
      await loadCustomerQuotes();
    }catch(error){toast(error.message||'Nie udało się zamknąć zapytania.','error');}
  };

  const mobileSupportAuthor=(author)=>({user:'Ty',assistant:'Bot ServiceOS',support:'Konsultant',system:'ServiceOS'}[author]||'ServiceOS');

  const runMobileLocalTool = async (action) => {
    mobileHelpToolResult={kind:action.type==='SPEED_TEST'?'speed':'diag',title:action.type==='SPEED_TEST'?'Test internetu':'Diagnostyka ServiceOS',lines:['Trwa pomiar…']};
    renderMobileSupport();
    try{
      if(action.type==='SPEED_TEST'){
        const samples=[];
        for(let index=0;index<3;index+=1){
          const started=performance.now();
          const response=await fetch('https://speed.cloudflare.com/__down?bytes=1000',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
          if(!response.ok)throw new Error('Serwer testowy: HTTP '+response.status);
          await response.arrayBuffer();samples.push(performance.now()-started);
        }
        const started=performance.now();
        const response=await fetch('https://speed.cloudflare.com/__down?bytes=5000000',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('Serwer testowy: HTTP '+response.status);
        const bytes=(await response.arrayBuffer()).byteLength;
        const elapsed=Math.max(1,performance.now()-started);
        const download=((bytes*8)/(elapsed*1000)).toFixed(1);
        const latency=Math.round(samples.reduce((sum,value)=>sum+value,0)/samples.length);
        let upload='nie udało się zmierzyć';
        try{
          const uploadBytes=1000000;
          const body=new Uint8Array(uploadBytes);
          const upStarted=performance.now();
          const up=await fetch('https://speed.cloudflare.com/__up',{method:'POST',body,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/octet-stream'}});
          if(!up.ok)throw new Error('HTTP '+up.status);
          await up.arrayBuffer().catch(()=>new ArrayBuffer(0));
          upload=((uploadBytes*8)/(Math.max(1,performance.now()-upStarted)*1000)).toFixed(1)+' Mb/s';
        }catch{}
        const quality=Number(download)>=100&&latency<=35?'Bardzo dobre':Number(download)>=30&&latency<=70?'Dobre':Number(download)>=10&&latency<=120?'Wystarczające':'Słabe';
        mobileHelpToolResult={kind:'speed',title:'Wynik testu internetu',lines:['Pobieranie: '+download+' Mb/s','Wysyłanie: '+upload,'Opóźnienie: '+latency+' ms','Ocena łącza: '+quality]};
      }else{
        let internetOk=false,internetLatency=null,apiOk=false,apiLatency=null,apiError='';
        try{
          const start=performance.now();const response=await fetch('https://speed.cloudflare.com/__down?bytes=1000',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
          internetOk=response.ok;await response.arrayBuffer();internetLatency=Math.round(performance.now()-start);
        }catch{}
        try{
          const start=performance.now();const response=await fetch(apiBaseUrl+'/health',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
          apiOk=response.ok;apiLatency=Math.round(performance.now()-start);if(!response.ok)apiError='HTTP '+response.status;
        }catch(error){apiError=error?.message||'Brak połączenia';}
        mobileHelpToolResult={kind:'diag',title:'Diagnostyka ServiceOS',lines:[
          'Internet: '+(internetOk?'działa':'brak odpowiedzi')+(internetLatency==null?'':' · '+internetLatency+' ms'),
          'Centralne API: '+(apiOk?'działa':'problem')+(apiLatency==null?'':' · '+apiLatency+' ms'),
          ...(apiError?['API: '+apiError]:[])
        ]};
      }
    }catch(error){
      mobileHelpToolResult={kind:'diag',title:'Nie udało się wykonać pomiaru',lines:[error?.message||'Błąd diagnostyki.']};
    }
    renderMobileSupport();
  };

  const runMobileHelpAction = async (action) => {
    if(!action)return;
    if(action.type==='SPEED_TEST'||action.type==='CONNECTIVITY_TEST'){
      await runMobileLocalTool(action);return;
    }
    if(action.type==='BROWSER_SEARCH'&&action.query){
      const query=String(action.query).trim().slice(0,180);
      const url=action.provider==='YOUTUBE'
        ? 'https://www.youtube.com/results?search_query='+encodeURIComponent(query)
        : 'https://www.google.com/search?q='+encodeURIComponent(query);
      window.open(url,'_blank','noopener,noreferrer');
      return;
    }
    if(action.type==='OPEN_ORDER'&&action.orderId){
      showView('orders');
      await loadOrders();
      await openOrder(action.orderId);
      return;
    }
    if(action.type==='OPEN_USER'&&action.userId&&isOwner()){
      showView('admin');
      await loadAdmin();
      const card=document.querySelector('[data-mobile-admin-user="'+CSS.escape(action.userId)+'"]');
      card?.scrollIntoView({behavior:'smooth',block:'center'});
      card?.querySelector('details')?.setAttribute('open','');
      return;
    }
    if(action.type==='NAVIGATE'&&action.target){
      const target=String(action.target);
      if(['service','administration'].includes(target)){
        showView(target==='service'?'orders':'admin');
      }else if(target==='earnings')showView('earnings');
      else if(target==='support')showView('support');
      else if(target==='settings')document.getElementById('panelAccountButton')?.click();
    }
  };

  const renderMobileSupport = () => {
    const stateHost=document.getElementById('mobileSupportState');
    const messagesHost=document.getElementById('mobileHelpMessages');
    if(!stateHost||!messagesHost)return;
    const state=supportConversation?.consultantState||'BOT';
    const joinedName=supportConversation?.assignedSupportName||'Konsultant';
    if(state==='BOT')mobileHelpTarget='BOT';
    const consultantLabel=state==='WAITING'?'Konsultant / kolejka':'Konsultant';
    const targetControls=state==='BOT'?'':(
      '<div class="mobile-help-targets" role="group" aria-label="Odbiorca wiadomości">'+
        '<button type="button" data-mobile-help-target="BOT" class="'+(mobileHelpTarget==='BOT'?'active bot':'bot')+'">Bot ServiceOS</button>'+
        '<button type="button" data-mobile-help-target="CONSULTANT" class="'+(mobileHelpTarget==='CONSULTANT'?'active consultant':'consultant')+'">'+consultantLabel+'</button>'+
      '</div>'
    );
    stateHost.className='mobile-support-state '+state.toLowerCase();
    stateHost.innerHTML=(state==='JOINED'
      ? '<strong>'+esc(joinedName)+' dołączył do rozmowy</strong><span>Bot nadal jest dostępny. Wybierz poniżej, czy kolejna wiadomość ma trafić do bota, czy bezpośrednio do konsultanta.</span>'
      : state==='WAITING'
        ? '<strong>Prośba trafiła do kolejki konsultanta</strong><span>Nie musisz czekać bezczynnie — bot nadal odpowiada i może pomóc od razu. Wiadomość do konsultanta możesz zostawić w kolejce.</span>'
        : '<strong>Bot ServiceOS jest gotowy do pomocy</strong><span>Opisz problem. Bot spróbuje go rozwiązać, zaproponuje następny krok i w razie potrzeby możesz poprosić człowieka.</span>')+targetControls;
    stateHost.querySelectorAll('[data-mobile-help-target]').forEach(button=>{
      button.addEventListener('click',()=>{
        mobileHelpTarget=button.dataset.mobileHelpTarget==='CONSULTANT'?'CONSULTANT':'BOT';
        renderMobileSupport();
      });
    });
    const request=document.getElementById('mobileRequestConsultant');
    if(request){
      request.hidden=false;
      request.disabled=false;
      request.textContent=state==='BOT'
        ? 'Poproś konsultanta o dołączenie'
        : state==='WAITING'
          ? 'Anuluj prośbę o konsultanta'
          : 'Zakończ rozmowę z konsultantem';
    }
    const input=document.getElementById('mobileHelpInput');
    const send=document.getElementById('mobileHelpSend');
    if(input)input.placeholder=mobileHelpTarget==='CONSULTANT'
      ? (state==='WAITING'?'Zostaw wiadomość dla konsultanta w kolejce…':'Napisz bezpośrednio do konsultanta…')
      : 'Opisz problem albo zapytaj o zlecenie, klienta lub funkcję ServiceOS…';
    if(send){
      send.textContent=mobileHelpSending?'Wysyłanie…':'Wyślij';
      send.disabled=mobileHelpSending;
      const sendLabel=mobileHelpTarget==='CONSULTANT'?'Wyślij wiadomość do konsultanta':'Wyślij wiadomość do bota ServiceOS';
      send.setAttribute('aria-label',sendLabel);
      send.setAttribute('title',sendLabel);
    }
    if(input)input.disabled=mobileHelpSending;
    const thread=(supportConversation?.messages||[]).map(message=>{
      const action=message.action&&message.action.type!=='WEBSITE_CODE'
        ? '<button type="button" class="mobile-help-action" data-mobile-help-action="'+esc(encodeURIComponent(JSON.stringify(message.action)))+'">'+esc(message.action.label||'Otwórz w ServiceOS')+' →</button>'
        : '';
      const channel=message.author==='user'&&message.target
        ? '<small class="mobile-help-channel-badge '+esc(String(message.target).toLowerCase())+'">'+(message.target==='CONSULTANT'?'Do konsultanta':'Do bota')+'</small>'
        : '';
      return '<article class="mobile-help-message '+esc(message.author)+'"><div><strong>'+esc(mobileSupportAuthor(message.author))+'</strong><time>'+esc(formatDate(message.createdAt))+'</time></div>'+channel+'<p>'+esc(message.text).replace(/\n/g,'<br>')+'</p>'+action+'</article>';
    }).join('')||'<div class="panel-list-empty">Napisz pierwszą wiadomość. Bot ServiceOS jest dostępny od razu i będzie prowadzić Cię do rozwiązania.</div>';
    const typing=mobileHelpSending&&mobileHelpTarget==='BOT'
      ? '<article class="mobile-help-message assistant typing" aria-live="polite"><div><strong>Bot ServiceOS</strong></div><p><span class="mobile-help-typing-dot"></span><span class="mobile-help-typing-dot"></span><span class="mobile-help-typing-dot"></span> Szukam najlepszego rozwiązania…</p></article>'
      : '';
    const tool=mobileHelpToolResult
      ? '<article class="mobile-help-tool '+esc(mobileHelpToolResult.kind)+'"><strong>'+esc(mobileHelpToolResult.title)+'</strong>'+mobileHelpToolResult.lines.map(line=>'<span>'+esc(line)+'</span>').join('')+'</article>'
      : '';
    messagesHost.innerHTML=thread+typing+tool;
    messagesHost.scrollTop=messagesHost.scrollHeight;
  };

  const renderMobileSupportStaff = () => {
    if(!canSupportStaff())return;
    const presenceHost=document.getElementById('mobileSupportPresence');
    const ticketsHost=document.getElementById('mobileSupportTickets');
    if(presenceHost){
      presenceHost.innerHTML=supportPresence.map(person=>
        '<article class="mobile-presence-row '+esc(String(person.consultantState||'BOT').toLowerCase())+'"><i></i><div><strong>'+esc(person.name)+'</strong><span>'+esc(roleLabel(person.role))+' · '+esc((person.clientTypes||[]).map(x=>x==='WEB'?'WWW / telefon':'desktop').join(' + '))+'</span></div><b>'+esc(person.consultantState==='WAITING'?'CZEKA':person.consultantState==='JOINED'?'W ROZMOWIE':'BOT')+'</b></article>'
      ).join('')||'<div class="panel-list-empty">Brak aktywnych użytkowników.</div>';
    }
    if(ticketsHost){
      ticketsHost.innerHTML=supportTickets.filter(ticket=>ticket.status==='OPEN').map(ticket=>{
        const msgs=(ticket.messages||[]).map(message=>'<div class="mobile-ticket-message '+esc(message.author)+'"><b>'+esc(mobileSupportAuthor(message.author))+'</b><p>'+esc(message.text).replace(/\n/g,'<br>')+'</p><small>'+esc(formatDate(message.createdAt))+'</small></div>').join('');
        return '<article class="mobile-support-ticket"><div class="mobile-support-ticket-head"><div><strong>'+esc(ticket.userName)+'</strong><span>'+esc(ticket.userEmail)+' · '+esc(ticket.pointName)+'</span></div><b>'+(ticket.assignedSupportUserId?'DOŁĄCZONO':'CZEKA')+'</b></div>'+
          '<div class="mobile-ticket-thread">'+msgs+'</div>'+
          '<div class="mobile-ticket-actions">'+
            (!ticket.assignedSupportUserId?'<button class="mini-action primary" data-mobile-support-take="'+esc(ticket.id)+'">Dołącz</button>':'')+
            '<input data-mobile-support-reply-input="'+esc(ticket.id)+'" maxlength="2000" placeholder="Napisz do użytkownika…">'+
            '<button class="mini-action primary" data-mobile-support-reply="'+esc(ticket.id)+'">Wyślij</button>'+
            '<button class="mini-action" data-mobile-support-close="'+esc(ticket.id)+'">Zamknij</button>'+
          '</div></article>';
      }).join('')||'<div class="panel-list-empty">Nikt nie czeka teraz na konsultanta.</div>';
    }
  };

  const loadSupport = async (silent=false) => {
    try{
      const jobs=[api('/support/conversation')];
      if(canSupportStaff())jobs.push(api('/support/presence'),api('/support/tickets'));
      const result=await Promise.all(jobs);
      supportConversation=result[0];
      if(canSupportStaff()){supportPresence=result[1]||[];supportTickets=result[2]||[];}
      renderMobileSupport();
      renderMobileSupportStaff();
    }catch(error){if(!silent)toast(error.message||'Nie udało się pobrać pomocy.','error');}
  };

  const sendMobileHelp = async (message) => {
    const value=String(message||'').trim();
    if(!value||mobileHelpSending)return;
    const target=mobileHelpTarget;
    mobileHelpSending=true;
    renderMobileSupport();
    try{
      const result=await api('/assistant/chat',{method:'POST',body:JSON.stringify({message:value,target})});
      if(!supportConversation)supportConversation={id:'',status:'OPEN',messages:[],consultantState:'BOT'};
      supportConversation.messages=[...(supportConversation.messages||[]),result.userMessage,...(result.assistantMessage?[result.assistantMessage]:[])];
      supportConversation.consultantState=result.consultantState||supportConversation.consultantState;
      const input=document.getElementById('mobileHelpInput');
      if(input)input.value='';
      if(result.action&&['SPEED_TEST','CONNECTIVITY_TEST'].includes(result.action.type))void runMobileLocalTool(result.action);
      window.setTimeout(()=>void loadSupport(true),500);
    }catch(error){toast(error.message||'Nie udało się wysłać wiadomości.','error');}
    finally{
      mobileHelpSending=false;
      renderMobileSupport();
      document.getElementById('mobileHelpInput')?.focus();
    }
  };

  const requestMobileConsultant = async () => {
    const state=supportConversation?.consultantState||'BOT';
    try{
      if(state==='BOT'){
        await api('/support/request',{method:'POST',body:JSON.stringify({pointId:activePointId||me?.point?.id||'',message:'Proszę konsultanta o dołączenie do rozmowy.'})});
        mobileHelpTarget='BOT';
        toast('Prośba o konsultanta została wysłana. Bot nadal jest dostępny.');
      }else{
        if(state==='JOINED'&&!window.confirm('Zakończyć kanał konsultanta? Bot ServiceOS pozostanie dostępny.'))return;
        await api('/support/leave',{method:'POST',body:'{}'});
        mobileHelpTarget='BOT';
        toast(state==='WAITING'?'Prośba o konsultanta została anulowana.':'Rozmowa z konsultantem została zakończona.');
      }
      await loadSupport(true);
    }catch(error){toast(error.message||'Nie udało się zmienić statusu konsultanta.','error');}
  };

  const mobileSupportAction = async (id,action) => {
    try{
      if(action==='reply'){
        const input=document.querySelector('[data-mobile-support-reply-input="'+CSS.escape(id)+'"]');
        const message=String(input?.value||'').trim();
        if(!message)return;
        await api('/support/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:JSON.stringify({message})});
      }else{
        if(action==='close'&&!window.confirm('Zamknąć tę rozmowę wsparcia?'))return;
        await api('/support/tickets/'+encodeURIComponent(id)+'/'+action,{method:'POST',body:'{}'});
      }
      await loadSupport(true);
    }catch(error){toast(error.message||'Operacja wsparcia nie powiodła się.','error');}
  };

  const loadFinance = async () => {
    if (!canReadFinance()) return;
    financeData = await api('/finance/revenues');
    renderFinance();
  };

  const loadAdmin = async () => {
    if (!isOwner()) return;
    admin = await api('/admin/overview');
    document.getElementById('adminSessions').textContent = String(admin.system?.activeSessions ?? 0);
    document.getElementById('adminBlocked').textContent = String(admin.system?.blockedUsers ?? 0);
    document.getElementById('adminServices').textContent = String(admin.system?.servicePoints ?? 0);
    document.getElementById('adminTransfers').textContent = String(admin.system?.openTransfers ?? 0);
    renderAdminPending();
    renderAdminUsers();
    renderAdminPoints();
    renderAdminAuditSelectors();
    renderKpis();
    await loadAudit();
  };

  const AUDIT_STATUS_LABELS={
    RECEIVED:'Przyjęto urządzenie',DIAGNOSIS:'Diagnoza',WAITING_PARTS:'Oczekiwanie na części',IN_REPAIR:'W naprawie',
    REPAIR_DONE:'Naprawa zakończona',READY:'Gotowe do odbioru',COMPLETED:'Zakończone',CANCELLED:'Anulowane',REJECTED:'Odrzucone',
    REQUESTED:'Oczekuje na przekazanie',IN_TRANSIT:'W drodze',DELIVERED:'Dostarczono',ACCEPTED:'Przyjęto',
    PENDING:'Oczekuje',PROCESSING:'Wysyłanie',SENT:'Wysłano',FAILED:'Błąd wysyłki',APPROVED:'Zatwierdzone',SETTLED:'Rozliczone',
    OPEN:'Otwarte',CLOSED:'Zamknięte',PAID:'Wypłacone',ACTIVE:'Aktywne'
  };
  const AUDIT_ROLE_LABELS={OWNER:'Właściciel',BOSS:'Szef',COORDINATOR:'Koordynator',SUPPORT:'Konsultant wsparcia',TECHNICIAN:'Serwisant',USER:'Pracownik punktu'};
  const AUDIT_ENTITY_LABELS={service_order:'zlecenie serwisowe',notification:'wiadomość e-mail',revenue:'rozliczenie',user:'konto pracownika',point:'punkt',support_conversation:'zgłoszenie wsparcia',customer_quote_request:'zapytanie o wycenę',customer:'klient',auth_session:'sesja'};
  const auditValue=(value)=>{
    if(value==null||value==='')return '—';
    if(typeof value==='boolean')return value?'Tak':'Nie';
    if(typeof value==='string')return AUDIT_STATUS_LABELS[value]||AUDIT_ROLE_LABELS[value]||value;
    if(typeof value==='number')return String(value);
    try{return JSON.stringify(value);}catch{return String(value);}
  };
  const auditActionLabel = (action) => {
    const labels={
      SERVICE_ORDER_CREATED:'Utworzono zlecenie',SERVICE_STATUS_CHANGED:'Zmieniono status zlecenia',SERVICE_ORDER_DETAILS_UPDATED:'Zmieniono dane zlecenia',
      SERVICE_TRANSFER_SENT:'Wysłano urządzenie do serwisu',SERVICE_RETURN_SENT:'Rozpoczęto powrót urządzenia',SERVICE_NOTE_ADDED:'Dodano notatkę serwisową',
      USER_APPROVED:'Aktywowano konto pracownika',USER_REJECTED:'Odrzucono wniosek o dostęp',USER_ACCESS_UPDATED:'Zmieniono dostęp pracownika',
      USER_BLOCKED:'Zablokowano konto',USER_UNBLOCKED:'Odblokowano konto',USER_SESSIONS_REVOKED:'Wylogowano konto ze wszystkich urządzeń',
      ALL_SESSIONS_REVOKED:'Wylogowano pozostałe konta',LOGIN_DESKTOP:'Zalogowano w aplikacji desktopowej',LOGIN_WEB:'Zalogowano w panelu WWW',
      WEBSITE_CODE_CREATED:'Wygenerowano kod do połączenia WWW',GMAIL_CONNECTED:'Połączono firmowy Gmail',GMAIL_DISCONNECTED:'Odłączono firmowy Gmail',
      GMAIL_TEST_SENT:'Wysłano wiadomość testową Gmail',NOTIFICATION_RETRIED:'Ponowiono wysyłkę e-mail',NOTIFICATION_SETTINGS_UPDATED:'Zmieniono ustawienia powiadomień',
      SUPPORT_REQUESTED:'Poproszono konsultanta o pomoc',SUPPORT_TAKEN:'Konsultant przejął zgłoszenie',SUPPORT_REPLIED:'Konsultant odpowiedział',SUPPORT_CLOSED:'Zamknięto zgłoszenie wsparcia',
      REVENUE_AUTO_APPROVED:'Dodano przychód ze zlecenia',REVENUE_REVIEWED:'Sprawdzono wpis rozliczeniowy',TECHNICIAN_SETTLEMENT_UPDATED:'Zmieniono procent rozliczenia serwisanta',
      POINT_CREATED:'Utworzono punkt',POINT_SERVICE_UPDATED:'Zmieniono ustawienia serwisu punktu',
      CUSTOMER_QUOTE_CREATED:'Klient poprosił o wycenę',CUSTOMER_QUOTE_REPLIED:'Odpowiedziano klientowi',CUSTOMER_QUOTE_PRICED:'Wysłano klientowi wycenę',
      CUSTOMER_QUOTE_CLOSED:'Zamknięto zapytanie o wycenę',CUSTOMER_PORTAL_LOGIN:'Klient otworzył swój portal'
    };
    if(labels[action])return labels[action];
    if(String(action||'').startsWith('SERVICE_TRANSFER_')){
      const status=String(action).slice('SERVICE_TRANSFER_'.length);
      return {REQUESTED:'Utworzono przekazanie urządzenia',IN_TRANSIT:'Urządzenie jest w drodze',DELIVERED:'Urządzenie dostarczono do punktu',ACCEPTED:'Punkt przyjął urządzenie',REJECTED:'Punkt odrzucił przekazanie',CANCELLED:'Anulowano przekazanie'}[status]||'Zmieniono etap przekazania';
    }
    return String(action||'').replaceAll('_',' ').toLowerCase();
  };
  const auditDescription=(event)=>{
    const order=event.orderNumber!=null?' #'+event.orderNumber:'';
    const point=event.pointName?' w punkcie '+event.pointName:'';
    const target=event.entityName?' „'+event.entityName+'”':'';
    const personDevice=[event.customerSummary,event.deviceSummary].filter(Boolean).join(' · ');
    switch(event.action){
      case 'SERVICE_ORDER_CREATED':return 'Utworzono zlecenie'+order+(personDevice?' dla '+personDevice:'')+point+'.';
      case 'SERVICE_STATUS_CHANGED':return 'Zlecenie'+order+' zmieniło etap z „'+auditValue(event.before)+'” na „'+auditValue(event.after)+'”'+point+'.';
      case 'SERVICE_ORDER_DETAILS_UPDATED':return 'Zaktualizowano dane zlecenia'+order+(personDevice?' · '+personDevice:'')+point+'.';
      case 'SERVICE_NOTE_ADDED':return 'Dodano wewnętrzną notatkę do zlecenia'+order+point+'.';
      case 'SERVICE_TRANSFER_SENT':return 'Rozpoczęto przekazanie urządzenia ze zlecenia'+order+' do serwisu.';
      case 'SERVICE_RETURN_SENT':return 'Rozpoczęto powrót urządzenia ze zlecenia'+order+' do punktu macierzystego.';
      case 'USER_APPROVED':return 'Konto pracownika'+target+' zostało zaakceptowane i aktywowane.';
      case 'USER_REJECTED':return 'Odrzucono wniosek o dostęp dla konta'+target+'.';
      case 'USER_ACCESS_UPDATED':return 'Zmieniono rolę, przypisane punkty lub parametry konta'+target+'.';
      case 'USER_BLOCKED':return 'Konto'+target+' zostało zablokowane, a jego aktywne sesje unieważniono.';
      case 'USER_UNBLOCKED':return 'Konto'+target+' zostało odblokowane.';
      case 'USER_SESSIONS_REVOKED':return 'Konto'+target+' zostało wylogowane ze wszystkich aktywnych urządzeń.';
      case 'ALL_SESSIONS_REVOKED':return 'Unieważniono aktywne sesje użytkowników zgodnie z poleceniem administratora.';
      case 'LOGIN_DESKTOP':return 'Zalogowano się do ServiceOS w aplikacji na komputerze.';
      case 'LOGIN_WEB':return 'Zalogowano się do mobilnego panelu ServiceOS w przeglądarce.';
      case 'WEBSITE_CODE_CREATED':return 'Wygenerowano jednorazowy kod do połączenia panelu WWW z kontem ServiceOS.';
      case 'GMAIL_CONNECTED':return 'Połączono firmowe konto Gmail używane do wiadomości serwisowych'+point+'.';
      case 'GMAIL_DISCONNECTED':return 'Odłączono firmowe konto Gmail'+point+'.';
      case 'GMAIL_TEST_SENT':return 'Wysłano wiadomość testową z firmowego Gmaila'+point+'.';
      case 'NOTIFICATION_RETRIED':return 'Ręcznie ponowiono wysyłkę wiadomości do klienta'+order+'.';
      case 'NOTIFICATION_SETTINGS_UPDATED':return 'Zmieniono ustawienia automatycznych wiadomości do klientów'+point+'.';
      case 'TECHNICIAN_SETTLEMENT_UPDATED':return 'Zmieniono procent rozliczenia serwisanta'+target+'.';
      case 'REVENUE_AUTO_APPROVED':return 'Automatycznie zapisano przychód z zakończonego zlecenia'+order+point+'.';
      case 'REVENUE_REVIEWED':return 'Sprawdzono ręczny wpis rozliczeniowy'+point+'.';
      case 'POINT_CREATED':return 'Utworzono nowy punkt'+target+'.';
      case 'POINT_SERVICE_UPDATED':return 'Zmieniono ustawienia obsługi serwisowej punktu'+target+'.';
      case 'SUPPORT_REQUESTED':return 'Utworzono prośbę o pomoc konsultanta'+point+'.';
      case 'SUPPORT_TAKEN':return 'Konsultant przejął zgłoszenie pomocy'+point+'.';
      case 'SUPPORT_REPLIED':return 'Konsultant odpowiedział w zgłoszeniu pomocy'+point+'.';
      case 'SUPPORT_CLOSED':return 'Zamknięto zgłoszenie pomocy'+point+'.';
      case 'CUSTOMER_QUOTE_CREATED':return 'Klient'+(event.customerSummary?' '+event.customerSummary:'')+' wysłał prośbę o zdalną wycenę'+point+'.';
      case 'CUSTOMER_QUOTE_REPLIED':return 'Wysłano odpowiedź do klienta w sprawie zdalnej wyceny'+point+'.';
      case 'CUSTOMER_QUOTE_PRICED':return 'Przekazano klientowi zdalną wycenę'+point+'.';
      case 'CUSTOMER_QUOTE_CLOSED':return 'Zamknięto rozmowę o zdalnej wycenie'+point+'.';
      case 'CUSTOMER_PORTAL_LOGIN':return 'Klient poprawnie otworzył swój prywatny portal historii serwisowej.';
      default:
        if(String(event.action||'').startsWith('SERVICE_TRANSFER_'))return 'Zmieniono etap przekazania urządzenia dla zlecenia'+order+': '+auditValue(event.transferStatus||String(event.action).slice('SERVICE_TRANSFER_'.length))+'.';
        return 'Wykonano działanie: '+auditActionLabel(event.action)+'.';
    }
  };

  const renderAdminAuditSelectors = () => {
    const users = document.getElementById('adminAuditUser');
    const points = document.getElementById('adminAuditPoint');
    if (users) users.innerHTML = '<option value="">Wszyscy użytkownicy</option>' + (admin?.users || []).map((user)=>'<option value="'+esc(user.id)+'">'+esc(user.name)+'</option>').join('');
    if (points) points.innerHTML = '<option value="">Wszystkie punkty</option>' + (admin?.points || []).map((point)=>'<option value="'+esc(point.id)+'">'+esc(point.name)+'</option>').join('');
  };

  const renderAdminAudit = () => {
    const host = document.getElementById('adminAudit');
    if (!host) return;
    host.innerHTML = auditEvents.map((event) => {
      const meta = [
        event.pointName ? '<span>Punkt: <strong>'+esc(event.pointName)+'</strong></span>' : '',
        event.orderNumber != null ? '<span>Zlecenie: <strong>#'+esc(event.orderNumber)+'</strong></span>' : '',
        event.customerSummary ? '<span>Klient: <strong>'+esc(event.customerSummary)+'</strong></span>' : '',
        event.deviceSummary ? '<span>Urządzenie: <strong>'+esc(event.deviceSummary)+'</strong></span>' : ''
      ].filter(Boolean).join('');
      const statuses = [
        event.notificationStatus ? '<span>E-mail: <strong>'+esc(auditValue(event.notificationStatus))+'</strong></span>' : '',
        event.transferStatus ? '<span>Przekazanie: <strong>'+esc(auditValue(event.transferStatus))+'</strong></span>' : '',
        event.settlementStatus ? '<span>Rozliczenie: <strong>'+esc(auditValue(event.settlementStatus))+'</strong></span>' : ''
      ].filter(Boolean).join('');
      const change = event.before != null || event.after != null
        ? '<div class="mobile-audit-change"><span>'+esc(auditValue(event.before))+'</span><b>→</b><span>'+esc(auditValue(event.after))+'</span></div>'
        : '';
      const source=event.clientType==='WEB'?'panel WWW':event.clientType==='DESKTOP'?'aplikacja desktopowa':'';
      const actor=[event.actorName||'System',roleLabel(event.actorRole),source].filter(Boolean).join(' · ');
      const technical='<details><summary>Dane techniczne i identyfikatory</summary><div class="mobile-audit-tech"><span>Typ: <strong>'+esc(AUDIT_ENTITY_LABELS[event.entityType]||String(event.entityType||'').replaceAll('_',' ').toLowerCase())+'</strong></span>'+(event.entityId?'<span>ID: <strong>'+esc(event.entityId)+'</strong></span>':'')+'</div><pre>'+esc(JSON.stringify(event.metadata||{},null,2))+'</pre></details>';
      return '<article class="mobile-audit-card"><div class="mobile-audit-head"><div><strong>'+esc(auditActionLabel(event.action))+'</strong><span>'+esc(actor)+'</span></div><time>'+esc(formatDate(event.createdAt))+'</time></div><p class="mobile-audit-description">'+esc(auditDescription(event))+'</p>'+(meta?'<div class="mobile-audit-meta">'+meta+'</div>':'')+change+(statuses?'<div class="mobile-audit-status">'+statuses+'</div>':'')+technical+'</article>';
    }).join('') || '<div class="panel-list-empty">Brak zdarzeń dla wybranych filtrów.</div>';
  };

  const loadAudit = async () => {
    if (!isOwner()) return;
    const form = document.getElementById('adminAuditFilters');
    const params = new URLSearchParams();
    if (form) {
      const values = new FormData(form);
      for (const [key,value] of values.entries()) if (String(value).trim()) params.set(key,String(value).trim());
    }
    const result = await api('/admin/audit' + (params.toString() ? '?' + params.toString() : ''));
    auditEvents = result.events || [];
    renderAdminAudit();
  };

  const roleLabel=(role)=>AUDIT_ROLE_LABELS[role]||'Bez roli';
  const ADMIN_PRIMARY_ROLES=['BOSS','COORDINATOR','TECHNICIAN','USER'];

  const renderAdminPending = () => {
    const host=document.getElementById('adminPending');
    if(!host)return;
    const users=admin?.pendingUsers||[];
    const points=admin?.points||[];
    host.innerHTML=users.map((user)=>{
      const requested=user.requestedPoint||null;
      const legacySupport=requested?.requestedRole==='SUPPORT';
      const suggested=ADMIN_PRIMARY_ROLES.includes(requested?.requestedRole)?requested.requestedRole:'USER';
      const requestedText=requested?(requested.pointName+(requested.city?' · '+requested.city:'')):'Nie podano punktu';
      return '<article class="admin-pending-card" data-pending-user="'+esc(user.id)+'">'+
        '<div class="admin-pending-head"><div><strong>'+esc(user.name)+'</strong><span>'+esc(user.email)+'</span></div><b>OCZEKUJE</b></div>'+
        '<div class="admin-pending-request"><span>Zgłoszony punkt<strong>'+esc(requestedText)+'</strong></span><span>Proponowana rola<strong>'+esc(roleLabel(suggested))+'</strong></span></div>'+
        '<label class="mobile-admin-field"><span>Główna rola po akceptacji</span><select data-pending-role="'+esc(user.id)+'">'+ADMIN_PRIMARY_ROLES.map(role=>'<option value="'+role+'"'+(role===suggested?' selected':'')+'>'+esc(roleLabel(role))+'</option>').join('')+'</select></label>'+
        (requested?'<label class="mobile-support-toggle requested"><input type="checkbox" data-pending-requested="'+esc(user.id)+'" checked><span><strong>Użyj zgłoszonego punktu</strong><small>ServiceOS przypisze istniejący punkt o tej nazwie lub utworzy go, jeśli jeszcze go nie ma.</small></span></label>':'')+
        '<div class="mobile-account-points">'+points.map(point=>'<label><input type="checkbox" data-pending-point-user="'+esc(user.id)+'" value="'+esc(point.id)+'"><span>'+esc(point.name)+'<small>'+esc(point.city||'')+'</small></span></label>').join('')+'</div>'+
        '<label class="mobile-support-toggle"><input type="checkbox" data-pending-support="'+esc(user.id)+'"'+(legacySupport?' checked':'')+'><span><strong>Wsparcie LockOn</strong><small>Dodatkowe uprawnienie konsultanta. Nie zastępuje głównej roli.</small></span></label>'+
        '<div class="admin-pending-actions"><button class="mini-action primary" data-admin-approve="'+esc(user.id)+'">Akceptuj konto</button><button class="mini-action danger" data-admin-reject="'+esc(user.id)+'">Odrzuć</button></div>'+
      '</article>';
    }).join('')||'<div class="panel-list-empty">Brak nowych wniosków do akceptacji.</div>';
  };

  const approveAdminUser = async (id) => {
    const role=document.querySelector('[data-pending-role="'+CSS.escape(id)+'"]')?.value||'USER';
    const supportEnabled=document.querySelector('[data-pending-support="'+CSS.escape(id)+'"]')?.checked===true;
    const useRequested=document.querySelector('[data-pending-requested="'+CSS.escape(id)+'"]')?.checked===true;
    const pointIds=role==='BOSS'?[]:[...document.querySelectorAll('[data-pending-point-user="'+CSS.escape(id)+'"]:checked')].map(el=>el.value);
    try{
      await api('/admin/users/'+encodeURIComponent(id)+'/approve',{method:'POST',body:JSON.stringify({role,pointIds,createRequestedPoint:role!=='BOSS'&&useRequested,supportEnabled})});
      toast('Konto zostało zaakceptowane.');
      await loadAdmin();
    }catch(error){toast(error.message||'Nie udało się zaakceptować konta.','error');}
  };

  const rejectAdminUser = async (id) => {
    if(!window.confirm('Odrzucić ten wniosek o dostęp?'))return;
    try{
      await api('/admin/users/'+encodeURIComponent(id)+'/reject',{method:'POST',body:'{}'});
      toast('Wniosek został odrzucony.');
      await loadAdmin();
    }catch(error){toast(error.message||'Nie udało się odrzucić wniosku.','error');}
  };

  const renderAdminUsers = () => {
    const host=document.getElementById('adminUsers');
    const users=admin?.users||[];
    const points=admin?.points||[];
    host.innerHTML=users.map((user)=>{
      const owner=user.role==='OWNER';
      const assigned=owner||user.role==='BOSS'?'Wszystkie punkty':points.filter(p=>(user.pointIds||[]).includes(p.id)).map(p=>p.name).join(', ')||'Brak punktu';
      const effectiveRole=user.role==='SUPPORT'?'USER':(user.role||'USER');
      const supportEnabled=user.supportEnabled===true||user.role==='SUPPORT'||owner;
      return '<article class="admin-user-card admin-user-card-v2 '+(user.blocked?'blocked':'')+'" data-mobile-admin-user="'+esc(user.id)+'">'+
        '<div class="mobile-admin-user-head"><div><strong>'+esc(user.name)+'</strong><span>'+esc(user.email)+'</span></div><div class="mobile-admin-badges">'+
          (user.blocked?'<b class="danger">ZABLOKOWANE</b>':'<b>AKTYWNE</b>')+
          (supportEnabled&&!owner?'<b class="support">WSPARCIE</b>':'')+
        '</div></div>'+
        '<div class="mobile-admin-summary"><span><small>Główna rola</small><strong>'+esc(roleLabel(user.role))+'</strong></span><span><small>Punkty</small><strong>'+esc(assigned)+'</strong></span><span><small>Ostatnie logowanie</small><strong>'+esc(formatDate(user.lastLoginAt))+'</strong></span></div>'+
        (user.blocked&&user.blockedReason?'<div class="mobile-block-reason">'+esc(user.blockedReason)+'</div>':'')+
        (!owner?'<details class="mobile-account-edit"><summary>Edytuj konto i uprawnienia</summary>'+
          '<label class="mobile-admin-field"><span>Główna rola</span><select data-admin-role="'+esc(user.id)+'">'+ADMIN_PRIMARY_ROLES.map(role=>'<option value="'+role+'"'+(role===effectiveRole?' selected':'')+'>'+esc(roleLabel(role))+'</option>').join('')+'</select></label>'+
          '<div class="mobile-account-points">'+points.map(p=>'<label><input type="checkbox" data-admin-point-user="'+esc(user.id)+'" value="'+esc(p.id)+'"'+((user.pointIds||[]).includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'<small>'+esc(p.city||'')+'</small></span></label>').join('')+'</div>'+
          (effectiveRole==='TECHNICIAN'?'<label class="mobile-admin-field"><span>Udział serwisanta (%)</span><input type="number" min="0" max="100" step="0.01" data-admin-split="'+esc(user.id)+'" value="'+esc(user.technicianSplitPercent??50)+'"></label>':'')+
          '<label class="mobile-support-toggle"><input type="checkbox" data-admin-support="'+esc(user.id)+'"'+(supportEnabled?' checked':'')+'><span><strong>Wsparcie LockOn</strong><small>Może dołączać do rozmów użytkowników z przypisanych punktów.</small></span></label>'+
          '<button class="mini-action primary wide" data-admin-save-user="'+esc(user.id)+'">Zapisz uprawnienia</button></details>':'')+
        '<div class="admin-user-actions">'+
          (!owner?'<button class="mini-action '+(user.blocked?'primary':'danger')+'" data-admin-block="'+esc(user.id)+'" data-blocked="'+(user.blocked?'1':'0')+'">'+(user.blocked?'Odblokuj konto':'Zablokuj konto')+'</button>':'')+
          '<button class="mini-action" data-admin-logout-user="'+esc(user.id)+'">Wyloguj urządzenia</button>'+
        '</div>'+
      '</article>';
    }).join('')||'<div class="panel-list-empty">Brak użytkowników.</div>';
  };

  const saveAdminUser = async (id) => {
    const role=document.querySelector('[data-admin-role="'+CSS.escape(id)+'"]')?.value||'USER';
    const pointIds=[...document.querySelectorAll('[data-admin-point-user="'+CSS.escape(id)+'"]:checked')].map(el=>el.value);
    const splitEl=document.querySelector('[data-admin-split="'+CSS.escape(id)+'"]');
    const technicianSplitPercent=role==='TECHNICIAN'?Number(splitEl?.value??50):null;
    const supportEnabled=document.querySelector('[data-admin-support="'+CSS.escape(id)+'"]')?.checked===true;
    try{await api('/admin/users/'+encodeURIComponent(id)+'/access',{method:'POST',body:JSON.stringify({role,pointIds,technicianSplitPercent,supportEnabled})});toast('Konto zostało zaktualizowane.');await loadAdmin();}catch(error){toast(error.message||'Nie udało się zapisać konta.','error');}
  };

  const renderAdminPoints = () => {
    const host = document.getElementById('adminPoints');
    host.innerHTML = (admin?.points || []).map((point) =>
      '<article class="admin-point-card">' +
        '<div><strong>' + esc(point.name) + '</strong><span>' + esc(point.city) + '</span><small>Aktywni technicy: ' + esc(point.activeTechnicianCount || 0) + (point.autoServiceEnabled ? ' · automatyczny cel przekazania' : '') + (point.externalRepairsPaused ? ' · PRZYJĘCIA WSTRZYMANE' : '') + '</small></div>' +
        '<div class="point-switches">' +
          '<label><input type="checkbox" data-point-service="' + esc(point.id) + '"' + (point.manualServiceEnabled ? ' checked' : '') + '> Ręczny serwis</label>' +
          '<label><input type="checkbox" data-point-external="' + esc(point.id) + '"' + (point.manualAcceptsExternalRepairs ? ' checked' : '') + (!point.manualServiceEnabled ? ' disabled' : '') + '> Ręczne przekazania</label>' +
          '<label><input type="checkbox" data-point-pause="' + esc(point.id) + '"' + (point.externalRepairsPaused ? ' checked' : '') + '> Wstrzymaj</label>' +
        '</div>' +
      '</article>'
    ).join('');
  };

  const blockUser = async (id, currentlyBlocked) => {
    const blocked=!currentlyBlocked;
    if(!window.confirm(blocked?'Zablokować konto i natychmiast wylogować je ze wszystkich urządzeń?':'Odblokować to konto?'))return;
    const reason=blocked?'Ręczna blokada konta przez właściciela':'';
    try {
      await api('/admin/users/' + encodeURIComponent(id) + '/block', {method:'POST',body:JSON.stringify({blocked,reason})});
      toast(blocked ? 'Konto zablokowane i wylogowane.' : 'Konto odblokowane.');
      await loadAdmin();
    } catch (error) { toast(error.message || 'Operacja nie powiodła się.','error'); }
  };

  const logoutUser = async (id) => {
    if (!window.confirm('Wylogować tego użytkownika ze wszystkich urządzeń?')) return;
    try {
      const result = await api('/admin/users/' + encodeURIComponent(id) + '/logout-all',{method:'POST',body:'{}'});
      toast('Unieważniono sesje: ' + String(result.revoked ?? 0));
      await loadAdmin();
    } catch (error) { toast(error.message || 'Nie udało się wylogować użytkownika.','error'); }
  };

  const updatePoint = async (pointId) => {
    const serviceEnabled = document.querySelector('[data-point-service="' + CSS.escape(pointId) + '"]')?.checked === true;
    const external = document.querySelector('[data-point-external="' + CSS.escape(pointId) + '"]');
    const acceptsExternalRepairs = serviceEnabled && external?.checked === true;
    const externalRepairsPaused = document.querySelector('[data-point-pause="' + CSS.escape(pointId) + '"]')?.checked === true;
    try {
      await api('/admin/points/' + encodeURIComponent(pointId) + '/service', {
        method:'POST', body:JSON.stringify({serviceEnabled,acceptsExternalRepairs,externalRepairsPaused})
      });
      toast('Konfiguracja punktu zapisana.');
      await loadAdmin();
    } catch (error) { toast(error.message || 'Nie udało się zapisać punktu.','error'); }
  };

  const pdfPayloadToObjectUrl = (payload) => {
    const binary=atob(String(payload?.pdfBase64||''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
    if(bytes.length<5||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Serwer zwrócił nieprawidłowy PDF.');
    return URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  };

  const openServiceCardPdf = async (orderId,printMode) => {
    const popup=window.open('about:blank','_blank');
    try{
      const payload=await api('/service/orders/'+encodeURIComponent(orderId)+'/service-card',{
        method:'POST',body:JSON.stringify({printMode})
      });
      const url=pdfPayloadToObjectUrl(payload);
      if(popup&&!popup.closed){
        popup.location.replace(url);
      }else{
        const a=document.createElement('a');a.href=url;a.download=String(payload.fileName||'karta-serwisowa.pdf').replace(/[\\/]/g,'_');
        document.body.appendChild(a);a.click();a.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
      return payload;
    }catch(error){
      try{popup?.close();}catch{}
      throw error;
    }
  };

  const chooseCreatedServiceCard = async (printMode) => {
    if(!pendingServiceCardOrder)return;
    const status=document.getElementById('serviceCardChoiceStatus');
    const buttons=[...document.querySelectorAll('[data-service-card-choice]')];
    buttons.forEach((button)=>button.disabled=true);
    if(status){status.className='panel-form-status';status.textContent='Generuję kartę serwisową…';}
    try{
      await openServiceCardPdf(pendingServiceCardOrder.id,printMode);
      document.getElementById('serviceCardChoiceDialog')?.close();
      toast(printMode==='PHYSICAL_AND_ONLINE'?'Otworzono kartę A4 do wydruku.':'Otworzono kartę urządzenia do wydruku.');
      pendingServiceCardOrder=null;
    }catch(error){
      if(status){status.className='panel-form-status error';status.textContent=error.message||'Nie udało się przygotować karty.';}
    }finally{buttons.forEach((button)=>button.disabled=false);}
  };

  const submitNewOrder = async (event) => {
    event.preventDefault();
    if (!canCreateService() || newOrderBusy) return;
    const submittedForm=event.currentTarget;
    const form = new FormData(submittedForm);
    const payload = Object.fromEntries(form.entries());
    delete payload.pointId;
    delete payload.handlingMode;
    payload.imei = String(payload.imei || '').replace(/\D/g,'');
    if (!activePointId) return toast('Najpierw wybierz aktywny punkt.','error');
    if (!String(payload.email||'').trim() || !String(payload.phone||'').replace(/\D/g,'')) {
      return toast('E-mail i telefon klienta są wymagane.','error');
    }
    if (!payload.imei || !String(payload.serialNumber||'').trim() || !String(payload.deviceNotes||'').trim()) {
      return toast('IMEI, numer seryjny i uwagi do urządzenia są wymagane.','error');
    }
    if (!/^\d{14,16}$/.test(payload.imei)) return toast('IMEI powinien zawierać 14–16 cyfr.','error');
    if (payload.estimatedCompletionAt) payload.estimatedCompletionAt = new Date(payload.estimatedCompletionAt).toISOString();
    else delete payload.estimatedCompletionAt;
    if (payload.estimatedCost !== undefined && payload.estimatedCost !== '') payload.estimatedCost = Number(payload.estimatedCost);
    else delete payload.estimatedCost;
    const status = document.getElementById('newOrderStatus');
    const submitButton = submittedForm.querySelector('button[type="submit"]');
    newOrderBusy = true;
    if (submitButton) submitButton.disabled = true;
    status.className = 'panel-form-status';
    status.textContent = 'Zapisywanie…';
    try {
      const result = await api('/service/orders',{method:'POST',body:JSON.stringify(payload)});
      status.className = 'panel-form-status ok';
      status.textContent = 'Utworzono zlecenie #' + String(result.order?.orderNumber || '') + '. Karta klienta jest wysyłana e-mailem.';
      submittedForm.reset();
      syncMobileIntakeMode();
      if (result.notification?.sent) {
        toast('Zlecenie utworzone. Klient dostał e-mail z kartą serwisową PDF.');
      } else if (result.notification?.queued) {
        toast('Zlecenie utworzone. Karta serwisowa klienta jest w kolejce e-mail.');
      } else if (result.notification?.reason === 'NO_SENDER') {
        toast('Zlecenie utworzone, ale brak aktywnego firmowego nadawcy Gmail. E-mail wymaga ponowienia.','error');
      } else {
        toast('Zlecenie utworzone.');
      }
      await loadOrders();
      if(result.serviceCard?.required&&result.order?.id){
        pendingServiceCardOrder={id:result.order.id,orderNumber:result.order.orderNumber};
        const title=document.getElementById('serviceCardChoiceTitle');
        if(title)title.textContent='Zlecenie #'+String(result.order.orderNumber||'')+' utworzone';
        const choice=document.getElementById('serviceCardChoiceStatus');
        if(choice){choice.textContent='';choice.className='panel-form-status';}
        document.getElementById('serviceCardChoiceDialog')?.showModal();
      }else{
        window.setTimeout(() => showView('orders'),500);
      }
    } catch (error) {
      status.className = 'panel-form-status error';
      status.textContent = error.message || 'Nie udało się utworzyć zlecenia.';
    } finally {
      newOrderBusy = false;
      if (submitButton) submitButton.disabled = false;
    }
  };

  const submitPoint = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name:String(form.get('name') || ''),
      city:String(form.get('city') || ''),
      serviceEnabled:form.get('serviceEnabled') === 'on',
      acceptsExternalRepairs:form.get('acceptsExternalRepairs') === 'on',
      serviceNote:String(form.get('serviceNote') || '')
    };
    try {
      await api('/admin/points',{method:'POST',body:JSON.stringify(payload)});
      event.currentTarget.reset();
      toast('Nowy punkt został utworzony.');
      await loadAdmin();
    } catch (error) { toast(error.message || 'Nie udało się utworzyć punktu.','error'); }
  };

  const wireEvents = () => {
    document.addEventListener('click',(event) => {
      const nav = event.target.closest('[data-panel-nav]');
      if (nav) {
        if(nav.dataset.closeDialog)document.getElementById(nav.dataset.closeDialog)?.close();
        showView(nav.dataset.panelNav); return;
      }
      const open = event.target.closest('[data-open-order]');
      if (open) { void openOrder(open.dataset.openOrder); return; }
      const transfer = event.target.closest('[data-transfer-action]');
      if (transfer) { void updateTransfer(transfer.dataset.transferId,transfer.dataset.transferAction); return; }
      const saveStatus = event.target.closest('[data-save-order-status]');
      if (saveStatus) { void saveOrderStatus(saveStatus.dataset.saveOrderStatus); return; }
      const savePrices = event.target.closest('[data-save-order-prices]');
      if (savePrices) { void saveOrderPrices(savePrices.dataset.saveOrderPrices); return; }
      const cancelService = event.target.closest('[data-cancel-service]');
      if (cancelService) { if (window.confirm('Anulować to zlecenie?')) void saveOrderStatus(cancelService.dataset.cancelService,'CANCELLED'); return; }
      const sendTransfer = event.target.closest('[data-send-transfer]');
      if (sendTransfer) { void sendOrderTransfer(sendTransfer.dataset.sendTransfer); return; }
      const sendReturn = event.target.closest('[data-send-return]');
      if (sendReturn) { void sendOrderReturn(sendReturn.dataset.sendReturn); return; }
      const orderFilterButton = event.target.closest('[data-order-filter]');
      if (orderFilterButton) { orderFilter = orderFilterButton.dataset.orderFilter || 'ALL'; renderOrders(); return; }
      const workspaceOrder=event.target.closest('[data-workspace-order]');
      if(workspaceOrder){showView('orders');void openOrder(workspaceOrder.dataset.workspaceOrder);return;}
      const techNoteDelete=event.target.closest('[data-tech-note-delete]');
      if(techNoteDelete){void deleteTechnicianNote(techNoteDelete.dataset.techNoteDelete);return;}
      const invoiceDownload=event.target.closest('[data-invoice-download]');
      if(invoiceDownload){void downloadInvoice(invoiceDownload.dataset.invoiceDownload);return;}
      const addPart=event.target.closest('[data-mobile-part-add]');
      if(addPart){
        document.getElementById('mobilePartsEditor')?.insertAdjacentHTML('beforeend',mobilePartRowHtml());
        return;
      }
      const removePart=event.target.closest('[data-mobile-part-remove]');
      if(removePart){removePart.closest('[data-mobile-part-row]')?.remove();return;}
      const saveCosting=event.target.closest('[data-save-mobile-costing]');
      if(saveCosting){void saveMobileCosting(saveCosting.dataset.saveMobileCosting);return;}
      const uploadInvoice=event.target.closest('[data-upload-mobile-invoice]');
      if(uploadInvoice){void uploadMobileInvoice(uploadInvoice.dataset.uploadMobileInvoice);return;}
      const addNote = event.target.closest('[data-add-note]');
      if (addNote) { void addOrderNote(addNote.dataset.addNote); return; }
      const cardPrint=event.target.closest('[data-service-card-print]');
      if(cardPrint){
        const orderId=cardPrint.dataset.serviceCardOrder;
        const mode=cardPrint.dataset.serviceCardPrint;
        cardPrint.disabled=true;
        void openServiceCardPdf(orderId,mode)
          .then(()=>toast('Karta serwisowa została otwarta do druku.'))
          .catch(error=>toast(error.message||'Nie udało się przygotować karty.','error'))
          .finally(()=>{if(cardPrint.isConnected)cardPrint.disabled=false;});
        return;
      }
      const cardChoice=event.target.closest('[data-service-card-choice]');
      if(cardChoice){void chooseCreatedServiceCard(cardChoice.dataset.serviceCardChoice);return;}
      const helpAction=event.target.closest('[data-mobile-help-action]');
      if(helpAction){try{void runMobileHelpAction(JSON.parse(decodeURIComponent(helpAction.dataset.mobileHelpAction)));}catch{}return;}
      const supportTake=event.target.closest('[data-mobile-support-take]');
      if(supportTake){void mobileSupportAction(supportTake.dataset.mobileSupportTake,'take');return;}
      const supportReply=event.target.closest('[data-mobile-support-reply]');
      if(supportReply){void mobileSupportAction(supportReply.dataset.mobileSupportReply,'reply');return;}
      const supportClose=event.target.closest('[data-mobile-support-close]');
      if(supportClose){void mobileSupportAction(supportClose.dataset.mobileSupportClose,'close');return;}
      const quoteReply=event.target.closest('[data-customer-quote-reply]');
      if(quoteReply){void replyCustomerQuote(quoteReply.dataset.customerQuoteReply);return;}
      const quotePrice=event.target.closest('[data-customer-quote-price]');
      if(quotePrice){void priceCustomerQuote(quotePrice.dataset.customerQuotePrice);return;}
      const quoteClose=event.target.closest('[data-customer-quote-close]');
      if(quoteClose){if(window.confirm('Zamknąć to zapytanie klienta?'))void closeCustomerQuote(quoteClose.dataset.customerQuoteClose);return;}
      const approveUserButton=event.target.closest('[data-admin-approve]');
      if(approveUserButton){void approveAdminUser(approveUserButton.dataset.adminApprove);return;}
      const rejectUserButton=event.target.closest('[data-admin-reject]');
      if(rejectUserButton){void rejectAdminUser(rejectUserButton.dataset.adminReject);return;}
      const block = event.target.closest('[data-admin-block]');
      if (block) { void blockUser(block.dataset.adminBlock,block.dataset.blocked === '1'); return; }
      const saveAdminUserButton = event.target.closest('[data-admin-save-user]');
      if (saveAdminUserButton) { void saveAdminUser(saveAdminUserButton.dataset.adminSaveUser); return; }
      const logoutUserButton = event.target.closest('[data-admin-logout-user]');
      if (logoutUserButton) { void logoutUser(logoutUserButton.dataset.adminLogoutUser); return; }
      const filter = event.target.closest('[data-transfer-filter]');
      if (filter) {
        transferFilter = filter.dataset.transferFilter || '';
        document.querySelectorAll('[data-transfer-filter]').forEach((el) => el.classList.toggle('active',el === filter));
        renderTransfers();
        return;
      }
      const openAccount = event.target.closest('[data-open-account]');
      if (openAccount) { document.getElementById('accountDialog')?.showModal(); return; }
      const close = event.target.closest('[data-close-dialog]');
      if (close) document.getElementById(close.dataset.closeDialog)?.close();
    });

    document.getElementById('panelPointSelect')?.addEventListener('change',async(event) => {
      const select=event.currentTarget;
      const previous=activePointId;
      const next=String(select.value||'');
      if(!next||next===previous)return;
      select.disabled=true;
      try{
        const updated=await api('/me/active-point',{method:'POST',body:JSON.stringify({pointId:next})});
        activePointId=updated.activePointId||next;
        me={...me,...updated};
        syncMobileIntakeMode();
        renderHome();
        renderOrders();
        if(activeOrderId)await openOrder(activeOrderId);
      }catch(error){
        activePointId=previous;
        select.value=previous;
        toast(error.message||'Nie udało się zmienić aktywnego punktu.','error');
      }finally{
        select.disabled=false;
      }
    });
    document.getElementById('panelAccountButton')?.addEventListener('click',()=>document.getElementById('accountDialog')?.showModal());
    document.getElementById('orderSearch')?.addEventListener('input',renderOrders);
    document.getElementById('refreshHome')?.addEventListener('click',()=>void refreshData());
    document.getElementById('refreshOrders')?.addEventListener('click',()=>void loadOrders());
    document.getElementById('refreshTransfers')?.addEventListener('click',()=>void loadTransfers());
    document.getElementById('refreshCustomerQuotes')?.addEventListener('click',()=>void loadCustomerQuotes());
    document.getElementById('refreshAdmin')?.addEventListener('click',()=>void loadAdmin());
    document.getElementById('refreshSupport')?.addEventListener('click',()=>void loadSupport());
    document.getElementById('mobileHelpForm')?.addEventListener('submit',(event)=>{event.preventDefault();const input=document.getElementById('mobileHelpInput');const value=input?.value||'';if(input)input.value='';void sendMobileHelp(value);});
    document.getElementById('mobileRequestConsultant')?.addEventListener('click',()=>void requestMobileConsultant());
    document.getElementById('refreshEarnings')?.addEventListener('click',()=>void loadFinance());
    document.getElementById('refreshTechnicianWorkspace')?.addEventListener('click',()=>void loadTechnicianWorkspace());
    document.getElementById('refreshTechnicianNotes')?.addEventListener('click',()=>void loadTechnicianNotes());
    document.getElementById('refreshInvoiceWarehouse')?.addEventListener('click',()=>void loadInvoiceWarehouse());
    document.getElementById('invoiceWarehouseMonth')?.addEventListener('change',()=>void loadInvoiceWarehouse());
    document.getElementById('downloadInvoiceMonth')?.addEventListener('click',()=>void downloadInvoiceMonth());
    document.getElementById('technicianNoteForm')?.addEventListener('submit',submitTechnicianNote);
    document.getElementById('monthlyInvoiceDownload')?.addEventListener('click',async()=>{
      const count=await downloadInvoiceMonth(monthlyInvoicePeriod);
      if(count>=0)await dismissMonthlyInvoicePrompt();
    });
    document.getElementById('monthlyInvoiceDismiss')?.addEventListener('click',()=>void dismissMonthlyInvoicePrompt());
    document.getElementById('newOrderForm')?.addEventListener('submit',submitNewOrder);
    document.getElementById('mobileOrderType')?.addEventListener('change',syncMobileIntakeMode);
    document.getElementById('mobileScannerStart')?.addEventListener('click',()=>void startServiceScanner());
    document.getElementById('mobileScannerCode')?.addEventListener('input',(event)=>{event.target.value=formatServiceScanCode(event.target.value);});
    document.getElementById('mobileScannerForm')?.addEventListener('submit',(event)=>{
      event.preventDefault();
      void processServiceScan({codeValue:document.getElementById('mobileScannerCode')?.value||''});
    });
    document.getElementById('mobilePointForm')?.addEventListener('submit',submitPoint);
    document.getElementById('adminAuditFilters')?.addEventListener('submit',(event)=>{event.preventDefault();void loadAudit();});
    document.getElementById('panelLogout')?.addEventListener('click',async()=>{
      try { await api('/auth/logout',{method:'POST',body:'{}'}); } catch {}
      clearStoredToken();
      redirectLogin(false);
    });
    document.getElementById('logoutEveryone')?.addEventListener('click',async()=>{
      if(!window.confirm('Wylogować wszystkich użytkowników poza bieżącą sesją OWNER?')) return;
      try {
        const result=await api('/admin/logout-all',{method:'POST',body:JSON.stringify({exceptCurrent:true})});
        toast('Unieważniono sesje: ' + String(result.revoked ?? 0));
        await loadAdmin();
      } catch(error){ toast(error.message || 'Operacja nie powiodła się.','error'); }
    });

    document.getElementById('adminPoints')?.addEventListener('change',(event)=>{
      const service=event.target.closest('[data-point-service]');
      const external=event.target.closest('[data-point-external]');
      const id=service?.dataset.pointService || external?.dataset.pointExternal;
      if(id) void updatePoint(id);
    });
  };

  const refreshData = async () => {
    const jobs=[];
    if(canReadService()) jobs.push(loadOrders(),loadTransfers());
    if(canHandleCustomerQuotes()) jobs.push(loadCustomerQuotes());
    if(isOwner()) jobs.push(loadAdmin());
    await Promise.all(jobs);
    renderHome();
  };

  const boot = async () => {
    if (!apiBaseUrl || !token) return redirectLogin(false);
    try {
      me = await api('/me');
    } catch (error) {
      if (error?.status === 401) return redirectLogin(true);
      if (error?.status === 403) {
        const bootLabel = document.querySelector('#panelBoot .panel-boot-copy span');
        if (bootLabel) bootLabel.textContent = error.message || 'Konto nie ma dostępu do panelu. Sesja pozostaje zapisana.';
        return;
      }
      const bootLabel = document.querySelector('#panelBoot .panel-boot-copy span');
      if (bootLabel) bootLabel.textContent = 'Brak połączenia z ServiceOS. Sesja jest zachowana — ponawiam…';
      window.setTimeout(() => void boot(), 3500);
      return;
    }
    renderAccount();
    renderPoints();
    wireEvents();
    syncMobileIntakeMode();
    try { await refreshData(); }
    catch (error) { toast(error.message || 'Nie udało się pobrać danych.','error'); }
    document.getElementById('panelBoot')?.classList.add('hidden');
    window.setTimeout(()=>document.getElementById('panelBoot')?.remove(),350);
    if(pendingScanToken&&canReadService()){
      showView('scan');
      void processServiceScan({tokenValue:pendingScanToken});
    }else if(role()==='TECHNICIAN'){
      void loadTechnicianWorkspace();
      void checkMonthlyInvoicePrompt();
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>undefined);
    window.setInterval(()=>{
      if(canHandleCustomerQuotes()&&document.visibilityState==='visible') void loadCustomerQuotes();
    },20000);
    window.setInterval(()=>{
      if(document.visibilityState==='visible'&&document.getElementById('view-support')?.classList.contains('active')) void loadSupport(true);
    },4000);
  };

  void boot();
})();