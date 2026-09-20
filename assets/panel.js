(() => {
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
    if (['new','orders','transfers'].includes(name) && !canReadService()) name = 'home';
    if (name === 'new' && !canEditService()) name = 'home';

    document.querySelectorAll('.panel-view').forEach((view) => view.classList.toggle('active', view.id === 'view-' + name));

    const advanced = ['support','quotes','earnings','admin'];
    const bottomName = advanced.includes(name) ? 'more' : name;
    document.querySelectorAll('.panel-bottom-nav [data-panel-nav]').forEach((button) => {
      button.classList.toggle('active', button.dataset.panelNav === bottomName);
    });

    window.scrollTo({top:0,behavior:'instant'});
    if (name === 'orders') renderOrders();
    if (name === 'transfers') void loadTransfers();
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

  const renderAccount = () => {
    const user = me?.user || {};
    document.getElementById('panelGreeting').textContent = user.name ? 'Dzień dobry, ' + String(user.name).split(' ')[0] + '.' : 'Dzień dobry.';
    document.getElementById('panelAccountButton').textContent = initials(user.name);
    document.getElementById('accountInitials').textContent = initials(user.name);
    document.getElementById('accountName').textContent = user.name || 'Konto ServiceOS';
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountRole').textContent = user.role || '—';
    document.querySelectorAll('[data-open-account] b').forEach((el) => { el.textContent = initials(user.name); });

    document.querySelectorAll('.owner-only').forEach((el) => { el.hidden = !isOwner(); });
    document.querySelectorAll('.management-only').forEach((el) => { el.hidden = !canManageService(); });
    document.querySelectorAll('.service-edit-only').forEach((el) => { el.hidden = !canEditService(); });
    document.querySelectorAll('.finance-only').forEach((el) => { el.hidden = !canReadFinance(); });
    document.querySelectorAll('.quote-staff-only').forEach((el) => { el.hidden = !canHandleCustomerQuotes(); });
    document.querySelectorAll('.support-staff-only').forEach((el) => { el.hidden = !canSupportStaff(); });

    if (!canReadService()) {
      document.querySelectorAll('[data-panel-nav="new"],[data-panel-nav="orders"],[data-panel-nav="transfers"]').forEach((el) => { el.hidden = true; });
    } else if (!canEditService()) {
      document.querySelectorAll('[data-panel-nav="new"]').forEach((el) => { el.hidden = true; });
    }
  };

  const syncMobileHandlingMode = () => {
    const select=document.getElementById('mobileHandlingMode');
    const transferOnly=select?.value==='TRANSFER_ONLY';
    const info=document.getElementById('mobileTransferOnlyInfo');
    if(info) info.hidden=!transferOnly;
    document.querySelectorAll('[data-standard-service]').forEach((el)=>{
      const roleHidden=el.classList.contains('service-edit-only')&&!canEditService();
      el.hidden=transferOnly||roleHidden;
    });
  };

  const renderPoints = () => {
    const select = document.getElementById('panelPointSelect');
    const points = me?.points || [];
    if (!activePointId || !points.some((p) => p.id === activePointId)) activePointId = points[0]?.id || '';
    select.innerHTML = points.map((point) => '<option value="' + esc(point.id) + '">' + esc(point.name) + (point.city ? ' · ' + esc(point.city) : '') + '</option>').join('');
    select.value = activePointId;
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
    return '<article class="panel-order-card workflow-' + esc(String(workflow?.attentionCode || 'ACTIVE').toLowerCase()) + '" data-order-id="' + esc(order.id) + '">' +
      '<div class="panel-order-top">' +
        '<div class="panel-order-number"><strong>#' + esc(order.orderNumber) + '</strong><small>' + esc(formatDate(order.receivedAt)) + '</small></div>' +
        '<div class="panel-order-main"><strong>' + esc(order.customerName) + '</strong><span>' + esc(order.brand + ' ' + order.model) + '</span><small>' + esc(order.handlingMode === 'TRANSFER_ONLY' ? 'Tylko przekazanie' : 'Zlecenie serwisowe') + '</small></div>' +
        '<div class="panel-status-pill">' + esc(order.statusLabel || STATUS_LABELS[order.status] || order.status) + '</div>' +
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
    try { notes = await api('/service/orders/' + encodeURIComponent(order.id) + '/notes'); } catch {}

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
        method:'POST', body:JSON.stringify({status,actingPointId:activePointId})
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
    stateHost.className='mobile-support-state '+state.toLowerCase();
    stateHost.innerHTML=state==='JOINED'
      ? '<strong>'+esc(joinedName)+' jest w rozmowie</strong><span>Twoje wiadomości trafiają teraz do konsultanta. Bot nie odpowiada automatycznie.</span>'
      : state==='WAITING'
        ? '<strong>Czekasz na konsultanta</strong><span>Możesz nadal korzystać z bota. Gdy konsultant dołączy, pojawi się tutaj automatycznie.</span>'
        : '<strong>Najpierw pomaga bot ServiceOS</strong><span>Bot zna aplikację, zlecenia w Twoim zakresie i może przenieść Cię do właściwego miejsca.</span>';
    const request=document.getElementById('mobileRequestConsultant');
    if(request){
      request.hidden=state==='JOINED';
      request.disabled=state==='WAITING';
      request.textContent=state==='WAITING'?'Prośba wysłana — czekasz na konsultanta':'Poproś konsultanta o dołączenie';
    }
    const thread=(supportConversation?.messages||[]).map(message=>{
      const action=message.action&&message.action.type!=='WEBSITE_CODE'
        ? '<button type="button" class="mobile-help-action" data-mobile-help-action="'+esc(encodeURIComponent(JSON.stringify(message.action)))+'">'+esc(message.action.label||'Otwórz w ServiceOS')+' →</button>'
        : '';
      return '<article class="mobile-help-message '+esc(message.author)+'"><div><strong>'+esc(mobileSupportAuthor(message.author))+'</strong><time>'+esc(formatDate(message.createdAt))+'</time></div><p>'+esc(message.text).replace(/\n/g,'<br>')+'</p>'+action+'</article>';
    }).join('')||'<div class="panel-list-empty">Napisz pierwszą wiadomość. Możesz zapytać o zlecenie, proces lub obsługę ServiceOS.</div>';
    const tool=mobileHelpToolResult
      ? '<article class="mobile-help-tool '+esc(mobileHelpToolResult.kind)+'"><strong>'+esc(mobileHelpToolResult.title)+'</strong>'+mobileHelpToolResult.lines.map(line=>'<span>'+esc(line)+'</span>').join('')+'</article>'
      : '';
    messagesHost.innerHTML=thread+tool;
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
    if(!value)return;
    try{
      const result=await api('/assistant/chat',{method:'POST',body:JSON.stringify({message:value})});
      if(!supportConversation)supportConversation={id:'',status:'OPEN',messages:[],consultantState:'BOT'};
      supportConversation.messages=[...(supportConversation.messages||[]),result.userMessage,...(result.assistantMessage?[result.assistantMessage]:[])];
      supportConversation.consultantState=result.consultantState||supportConversation.consultantState;
      renderMobileSupport();
      if(result.action&&['SPEED_TEST','CONNECTIVITY_TEST'].includes(result.action.type))void runMobileLocalTool(result.action);
      window.setTimeout(()=>void loadSupport(true),500);
    }catch(error){toast(error.message||'Nie udało się wysłać wiadomości.','error');}
  };

  const requestMobileConsultant = async () => {
    try{
      await api('/support/request',{method:'POST',body:JSON.stringify({pointId:activePointId||me?.point?.id||'',message:'Proszę konsultanta o dołączenie do rozmowy.'})});
      toast('Prośba o konsultanta została wysłana.');
      await loadSupport(true);
    }catch(error){toast(error.message||'Nie udało się poprosić konsultanta.','error');}
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

  const submitNewOrder = async (event) => {
    event.preventDefault();
    if (!canCreateService()) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.pointId = activePointId;
    payload.imei = String(payload.imei || '').replace(/\D/g,'');
    if (payload.handlingMode === 'TRANSFER_ONLY') {
      delete payload.estimatedCompletionAt;
      delete payload.estimatedCost;
    } else {
      if (payload.estimatedCompletionAt) payload.estimatedCompletionAt = new Date(payload.estimatedCompletionAt).toISOString();
      else delete payload.estimatedCompletionAt;
      if (payload.estimatedCost !== undefined && payload.estimatedCost !== '') payload.estimatedCost = Number(payload.estimatedCost);
      else delete payload.estimatedCost;
    }
    const status = document.getElementById('newOrderStatus');
    status.className = 'panel-form-status';
    status.textContent = 'Zapisywanie…';
    try {
      const result = await api('/service/orders',{method:'POST',body:JSON.stringify(payload)});
      status.className = 'panel-form-status ok';
      status.textContent = 'Utworzono zlecenie #' + String(result.order?.orderNumber || '') + '.';
      event.currentTarget.reset();
      syncMobileHandlingMode();
      if (result.notification?.sent) {
        toast('Zlecenie utworzone. Klient dostał potwierdzenie e-mail.');
      } else if (result.notification?.queued) {
        toast('Zlecenie utworzone. E-mail czeka na ponowną wysyłkę.');
      } else if (result.notification?.reason === 'NO_CUSTOMER_EMAIL') {
        toast('Zlecenie utworzone. Klient nie podał adresu e-mail.');
      } else if (result.notification?.reason === 'NO_SENDER') {
        toast('Zlecenie utworzone, ale brak aktywnego firmowego nadawcy Gmail.','error');
      } else {
        toast('Zlecenie utworzone.');
      }
      await loadOrders();
      window.setTimeout(() => showView('orders'),700);
    } catch (error) {
      status.className = 'panel-form-status error';
      status.textContent = error.message || 'Nie udało się utworzyć zlecenia.';
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
      if (nav) { showView(nav.dataset.panelNav); return; }
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
      const addNote = event.target.closest('[data-add-note]');
      if (addNote) { void addOrderNote(addNote.dataset.addNote); return; }
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

    document.getElementById('panelPointSelect')?.addEventListener('change',(event) => {
      activePointId=event.target.value;
      renderHome();
      renderOrders();
      if (activeOrderId) void openOrder(activeOrderId);
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
    document.getElementById('newOrderForm')?.addEventListener('submit',submitNewOrder);
    document.getElementById('mobileHandlingMode')?.addEventListener('change',syncMobileHandlingMode);
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
    syncMobileHandlingMode();
    try { await refreshData(); }
    catch (error) { toast(error.message || 'Nie udało się pobrać danych.','error'); }
    document.getElementById('panelBoot')?.classList.add('hidden');
    window.setTimeout(()=>document.getElementById('panelBoot')?.remove(),350);
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