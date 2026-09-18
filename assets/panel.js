(() => {
  const config = window.LOCKON_WEB_AUTH || {};
  const apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const tokenKey = 'lockon.web.session';
  let token = sessionStorage.getItem(tokenKey) || '';
  let me = null;
  let orders = [];
  let transfers = [];
  let servicePoints = [];
  let admin = null;
  let activePointId = '';
  let transferFilter = '';
  let activeOrderId = '';

  const STATUS_LABELS = {
    RECEIVED:'Przyjęto urządzenie', DIAGNOSIS:'Diagnoza', WAITING_PARTS:'Oczekiwanie na części',
    IN_REPAIR:'W naprawie', REPAIR_DONE:'Naprawa zakończona', READY:'Gotowe do odbioru', COMPLETED:'Zakończone',
    CANCELLED:'Anulowane', REJECTED:'Odrzucone'
  };
  const TRANSFER_LABELS = {
    REQUESTED:'Oczekuje', IN_TRANSIT:'W drodze', DELIVERED:'Dostarczono',
    ACCEPTED:'Przyjęte', REJECTED:'Odrzucone', CANCELLED:'Anulowane'
  };
  const SERVICE_READ = new Set(['OWNER','BOSS','COORDINATOR','SUPPORT','TECHNICIAN']);
  const SERVICE_EDIT = new Set(['OWNER','BOSS','COORDINATOR','TECHNICIAN']);
  const SERVICE_MANAGE = new Set(['OWNER','BOSS','COORDINATOR']);

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

  const redirectLogin = () => {
    sessionStorage.removeItem(tokenKey);
    window.location.replace('index.html?login=1');
  };

  const role = () => String(me?.user?.role || '');
  const canReadService = () => SERVICE_READ.has(role());
  const canEditService = () => SERVICE_EDIT.has(role());
  const canManageService = () => SERVICE_MANAGE.has(role());
  const isOwner = () => role() === 'OWNER';
  const pointIds = () => (me?.points || []).map((point) => point.id);
  const canOperatePoint = (pointId) => ['OWNER','BOSS'].includes(role()) || pointIds().includes(pointId);

  const showView = (name) => {
    if (name === 'admin' && !isOwner()) name = 'home';
    if (['new','orders','transfers'].includes(name) && !canReadService()) name = 'home';
    document.querySelectorAll('.panel-view').forEach((view) => view.classList.toggle('active', view.id === 'view-' + name));
    document.querySelectorAll('[data-panel-nav]').forEach((button) => button.classList.toggle('active', button.dataset.panelNav === name));
    window.scrollTo({top:0,behavior:'instant'});
    if (name === 'orders') renderOrders();
    if (name === 'transfers') void loadTransfers();
    if (name === 'admin') void loadAdmin();
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

    document.querySelectorAll('.owner-only').forEach((el) => { el.hidden = !isOwner(); });
    document.querySelectorAll('.management-only').forEach((el) => { el.hidden = !canManageService(); });

    if (!canReadService()) {
      document.querySelectorAll('[data-panel-nav="new"],[data-panel-nav="orders"],[data-panel-nav="transfers"]').forEach((el) => { el.hidden = true; });
    } else if (!canEditService()) {
      document.querySelectorAll('[data-panel-nav="new"]').forEach((el) => { el.hidden = true; });
    }
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
    const meta = [
      'macierzysty: ' + (order.homePointName || order.pointName),
      'lokalizacja: ' + (order.currentLocationLabel || order.currentPointName || order.pointName),
      order.assignedTechnicianName ? 'technik: ' + order.assignedTechnicianName : '',
      transfer ? (transfer.kind === 'RETURN_HOME' ? 'powrót · ' : '') + (TRANSFER_LABELS[transfer.status] || transfer.status) + ' → ' + (transfer.toPointName || '') : ''
    ].filter(Boolean);
    return '<article class="panel-order-card" data-order-id="' + esc(order.id) + '">' +
      '<div class="panel-order-top">' +
        '<div class="panel-order-number">#' + esc(order.orderNumber) + '</div>' +
        '<div class="panel-order-main"><strong>' + esc(order.customerName) + '</strong><span>' + esc(order.brand + ' ' + order.model) + '</span><small>' + esc(meta.join(' · ')) + '</small></div>' +
        '<div class="panel-status-pill">' + esc(order.statusLabel || STATUS_LABELS[order.status] || order.status) + '</div>' +
      '</div>' +
      (compact ? '' : '<div class="panel-order-meta">' +
        (order.imei ? '<span>IMEI ' + esc(order.imei) + '</span>' : '') +
        (order.estimatedCompletionAt ? '<span>Termin ' + esc(formatDate(order.estimatedCompletionAt)) + '</span>' : '') +
      '</div>') +
      '<button type="button" data-open-order="' + esc(order.id) + '">Otwórz szczegóły →</button>' +
    '</article>';
  };

  const renderHome = () => {
    const host = document.getElementById('homeOrders');
    if (!canReadService()) {
      host.innerHTML = '<div class="panel-list-empty">Twoja rola nie ma dostępu do modułu Serwis.</div>';
      renderKpis();
      return;
    }
    host.innerHTML = orders.slice(0,4).map((order) => orderCard(order,true)).join('') || '<div class="panel-list-empty">Brak zleceń w Twoim zakresie.</div>';
    renderKpis();
  };

  const renderOrders = () => {
    const query = String(document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
    const visible = orders.filter((order) => {
      if (!query) return true;
      return [order.orderNumber,order.customerName,order.brand,order.model,order.imei,order.pointName].some((value) => String(value || '').toLowerCase().includes(query));
    });
    const host = document.getElementById('ordersList');
    host.innerHTML = visible.map((order) => orderCard(order,false)).join('') || '<div class="panel-list-empty">Brak zleceń pasujących do wyszukiwania.</div>';
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
    const currentServicePointId = order.currentPointId || order.homePointId || order.pointId;
    const homePointId = order.homePointId || order.pointId;
    const canOperateCurrentPoint = canOperatePoint(currentServicePointId);
    const availableServices = servicePoints.filter((point) => point.acceptsExternalRepairs && point.id !== currentServicePointId && point.id !== homePointId);

    let notes = [];
    try { notes = await api('/service/orders/' + encodeURIComponent(order.id) + '/notes'); } catch {}

    host.innerHTML =
      '<div class="order-dialog-head"><span>ZLECENIE #' + esc(order.orderNumber) + '</span><h2>' + esc(order.brand + ' ' + order.model) + '</h2><p>' + esc(order.customerName) + ' · ' + esc(order.pointName) + '</p></div>' +
      '<div class="order-detail-grid">' +
        '<div><span>Status</span><strong>' + esc(order.statusLabel) + '</strong></div>' +
        '<div><span>Technik</span><strong>' + esc(order.assignedTechnicianName || 'Nieprzypisany') + '</strong></div>' +
        '<div><span>IMEI</span><strong>' + esc(order.imei || '—') + '</strong></div>' +
        '<div><span>Termin</span><strong>' + esc(order.estimatedCompletionAt ? formatDate(order.estimatedCompletionAt) : '—') + '</strong></div>' +
        '<div><span>Punkt macierzysty</span><strong>' + esc(order.homePointName || order.pointName) + '</strong></div>' +
        '<div><span>Lokalizacja</span><strong>' + esc(order.currentLocationLabel || order.currentPointName || 'W transporcie') + '</strong></div>' +
      '</div>' +
      '<div class="order-dialog-section"><span>OPIS USTERKI</span><p class="order-note-text">' + esc(order.issueDescription || '—') + '</p></div>' +
      (canEditService() ? '<div class="order-dialog-section"><span>STATUS NAPRAWY</span><select id="mobileOrderStatus" class="order-status-select">' +
        Object.entries(STATUS_LABELS).map(([value,label]) => '<option value="' + value + '"' + (value === order.status ? ' selected' : '') + (((value === 'READY' && order.canMarkReady === false) || (value === 'COMPLETED' && (order.canMarkReady === false || order.status !== 'READY'))) ? ' disabled' : '') + '>' + esc(label) + '</option>').join('') +
        '</select><div class="order-dialog-actions"><button class="mini-action primary" data-save-order-status="' + esc(order.id) + '">Zapisz status</button></div></div>' : '') +
      '<div class="order-dialog-section"><span>LOGISTYKA URZĄDZENIA</span>' +
        '<p class="order-note-text"><strong>Macierzysty:</strong> ' + esc(order.homePointName || order.pointName) + '<br><strong>Teraz:</strong> ' + esc(order.currentLocationLabel || order.currentPointName || 'W transporcie') + '</p>' +
        (activeTransfer
          ? '<p class="order-note-text">' + esc(activeTransfer.kind === 'RETURN_HOME' ? 'Powrót do punktu macierzystego' : 'Przekazanie do serwisu') + ' · ' + esc(TRANSFER_LABELS[activeTransfer.status] || activeTransfer.status) + ': ' + esc(activeTransfer.fromPointName) + ' → ' + esc(activeTransfer.toPointName) + '</p>'
          : order.returnRequired
            ? (canEditService() && canOperateCurrentPoint && order.status === 'REPAIR_DONE'
                ? '<input id="mobileReturnNote" class="order-note-input" maxlength="500" placeholder="Notatka do zwrotu (opcjonalnie)"><div class="order-dialog-actions"><button class="mini-action primary" data-send-return="' + esc(order.id) + '">Odeślij do punktu macierzystego</button></div>'
                : '<p class="order-note-text">' + esc(order.status === 'REPAIR_DONE' ? 'Zwrot musi rozpocząć użytkownik obsługujący aktualny punkt urządzenia.' : 'Urządzenie jest poza punktem macierzystym. Po zakończeniu naprawy ustaw „Naprawa zakończona”, a następnie rozpocznij obowiązkowy zwrot.') + '</p>')
            : canEditService() && availableServices.length
              ? '<select id="mobileTransferPoint" class="order-transfer-select"><option value="">Wybierz serwis docelowy…</option>' + availableServices.map((point) => '<option value="' + esc(point.id) + '">' + esc(point.name + ' · ' + point.city) + '</option>').join('') + '</select><input id="mobileTransferNote" class="order-note-input" maxlength="500" placeholder="Notatka dla serwisu (opcjonalnie)"><div class="order-dialog-actions"><button class="mini-action primary" data-send-transfer="' + esc(order.id) + '">Wyślij do serwisu</button></div>'
              : '<p class="order-note-text">Brak aktywnego transportu.</p>') +
      '</div>' +
      '<div class="order-dialog-section"><span>NOTATKI WEWNĘTRZNE</span>' +
        (canEditService() ? '<input id="mobileInternalNote" class="order-note-input" maxlength="2000" placeholder="Dodaj notatkę…"><div class="order-dialog-actions"><button class="mini-action" data-add-note="' + esc(order.id) + '">Dodaj</button></div>' : '') +
        '<div class="mobile-note-list">' + (notes.slice(0,5).map((note) => '<div><strong>' + esc(note.authorName) + '</strong><small>' + esc(formatDate(note.createdAt)) + '</small><p>' + esc(note.body) + '</p></div>').join('') || '<p class="order-note-text">Brak notatek.</p>') + '</div>' +
      '</div>';
    dialog.showModal();
  };

  const saveOrderStatus = async (id) => {
    const status = document.getElementById('mobileOrderStatus')?.value;
    if (!status) return;
    try {
      const result = await api('/service/orders/' + encodeURIComponent(id) + '/status', {
        method:'POST', body:JSON.stringify({status})
      });
      toast(result?.notification?.sent ? 'Status zapisany i klient otrzymał e-mail.' : 'Status zapisany.');
      document.getElementById('orderDialog')?.close();
      await loadOrders();
    } catch (error) { toast(error.message || 'Nie udało się zapisać statusu.','error'); }
  };

  const sendOrderTransfer = async (id) => {
    const toPointId = document.getElementById('mobileTransferPoint')?.value || '';
    const note = document.getElementById('mobileTransferNote')?.value || '';
    if (!toPointId) return toast('Wybierz serwis docelowy.','error');
    try {
      const result = await api('/service/orders/' + encodeURIComponent(id) + '/transfer', {
        method:'POST', body:JSON.stringify({toPointId,note,kind:'OUTBOUND_SERVICE'})
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

  const loadAdmin = async () => {
    if (!isOwner()) return;
    admin = await api('/admin/overview');
    document.getElementById('adminSessions').textContent = String(admin.system?.activeSessions ?? 0);
    document.getElementById('adminBlocked').textContent = String(admin.system?.blockedUsers ?? 0);
    document.getElementById('adminServices').textContent = String(admin.system?.servicePoints ?? 0);
    document.getElementById('adminTransfers').textContent = String(admin.system?.openTransfers ?? 0);
    renderAdminUsers();
    renderAdminPoints();
    renderKpis();
  };

  const renderAdminUsers = () => {
    const host = document.getElementById('adminUsers');
    const users = admin?.users || [];
    host.innerHTML = users.map((user) => {
      const owner = user.role === 'OWNER';
      return '<article class="admin-user-card">' +
        '<div><strong>' + esc(user.name) + (user.blocked ? ' <span class="blocked-label">· ZABLOKOWANE</span>' : '') + '</strong><span>' + esc(user.email) + '</span><small>' + esc(user.role || 'Bez roli') + ' · ostatnio ' + esc(formatDate(user.lastLoginAt)) + (user.blockedReason ? ' · ' + esc(user.blockedReason) : '') + '</small></div>' +
        '<div class="admin-user-actions">' +
          (!owner ? '<button class="mini-action ' + (user.blocked ? 'primary' : 'danger') + '" data-admin-block="' + esc(user.id) + '" data-blocked="' + (user.blocked ? '1' : '0') + '">' + (user.blocked ? 'Odblokuj' : 'Zablokuj') + '</button>' : '') +
          '<button class="mini-action" data-admin-logout-user="' + esc(user.id) + '">Wyloguj</button>' +
        '</div>' +
      '</article>';
    }).join('') || '<div class="panel-list-empty">Brak użytkowników.</div>';
  };

  const renderAdminPoints = () => {
    const host = document.getElementById('adminPoints');
    host.innerHTML = (admin?.points || []).map((point) =>
      '<article class="admin-point-card">' +
        '<div><strong>' + esc(point.name) + '</strong><span>' + esc(point.city) + '</span><small>' + (point.serviceEnabled ? 'Serwis aktywny' : 'Bez własnego serwisu') + '</small></div>' +
        '<div class="point-switches">' +
          '<label><input type="checkbox" data-point-service="' + esc(point.id) + '"' + (point.serviceEnabled ? ' checked' : '') + '> Serwis</label>' +
          '<label><input type="checkbox" data-point-external="' + esc(point.id) + '"' + (point.acceptsExternalRepairs ? ' checked' : '') + (!point.serviceEnabled ? ' disabled' : '') + '> Zewnętrzne</label>' +
        '</div>' +
      '</article>'
    ).join('');
  };

  const blockUser = async (id, currentlyBlocked) => {
    const blocked = !currentlyBlocked;
    let reason = '';
    if (blocked) {
      const answer = window.prompt('Powód blokady (opcjonalnie):','');
      if (answer === null) return;
      reason = answer;
    }
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
    try {
      await api('/admin/points/' + encodeURIComponent(pointId) + '/service', {
        method:'POST', body:JSON.stringify({serviceEnabled,acceptsExternalRepairs})
      });
      toast('Konfiguracja punktu zapisana.');
      await loadAdmin();
    } catch (error) { toast(error.message || 'Nie udało się zapisać punktu.','error'); }
  };

  const submitNewOrder = async (event) => {
    event.preventDefault();
    if (!canEditService()) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.pointId = activePointId;
    payload.imei = String(payload.imei || '').replace(/\D/g,'');
    if (payload.estimatedCompletionAt) payload.estimatedCompletionAt = new Date(payload.estimatedCompletionAt).toISOString();
    else delete payload.estimatedCompletionAt;
    if (payload.estimatedCost !== undefined && payload.estimatedCost !== '') payload.estimatedCost = Number(payload.estimatedCost);
    else delete payload.estimatedCost;
    const status = document.getElementById('newOrderStatus');
    status.className = 'panel-form-status';
    status.textContent = 'Zapisywanie…';
    try {
      const result = await api('/service/orders',{method:'POST',body:JSON.stringify(payload)});
      status.className = 'panel-form-status ok';
      status.textContent = 'Utworzono zlecenie #' + String(result.order?.orderNumber || '') + '.';
      event.currentTarget.reset();
      toast(result.notification?.sent ? 'Zlecenie utworzone. Klient dostał potwierdzenie.' : 'Zlecenie utworzone.');
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
      const sendTransfer = event.target.closest('[data-send-transfer]');
      if (sendTransfer) { void sendOrderTransfer(sendTransfer.dataset.sendTransfer); return; }
      const sendReturn = event.target.closest('[data-send-return]');
      if (sendReturn) { void sendOrderReturn(sendReturn.dataset.sendReturn); return; }
      const addNote = event.target.closest('[data-add-note]');
      if (addNote) { void addOrderNote(addNote.dataset.addNote); return; }
      const block = event.target.closest('[data-admin-block]');
      if (block) { void blockUser(block.dataset.adminBlock,block.dataset.blocked === '1'); return; }
      const logoutUserButton = event.target.closest('[data-admin-logout-user]');
      if (logoutUserButton) { void logoutUser(logoutUserButton.dataset.adminLogoutUser); return; }
      const filter = event.target.closest('[data-transfer-filter]');
      if (filter) {
        transferFilter = filter.dataset.transferFilter || '';
        document.querySelectorAll('[data-transfer-filter]').forEach((el) => el.classList.toggle('active',el === filter));
        renderTransfers();
        return;
      }
      const close = event.target.closest('[data-close-dialog]');
      if (close) document.getElementById(close.dataset.closeDialog)?.close();
    });

    document.getElementById('panelPointSelect')?.addEventListener('change',(event) => { activePointId=event.target.value; });
    document.getElementById('panelAccountButton')?.addEventListener('click',()=>document.getElementById('accountDialog')?.showModal());
    document.getElementById('orderSearch')?.addEventListener('input',renderOrders);
    document.getElementById('refreshHome')?.addEventListener('click',()=>void refreshData());
    document.getElementById('refreshOrders')?.addEventListener('click',()=>void loadOrders());
    document.getElementById('refreshTransfers')?.addEventListener('click',()=>void loadTransfers());
    document.getElementById('refreshAdmin')?.addEventListener('click',()=>void loadAdmin());
    document.getElementById('newOrderForm')?.addEventListener('submit',submitNewOrder);
    document.getElementById('mobilePointForm')?.addEventListener('submit',submitPoint);
    document.getElementById('panelLogout')?.addEventListener('click',async()=>{
      try { await api('/auth/logout',{method:'POST',body:'{}'}); } catch {}
      redirectLogin();
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
    if(isOwner()) jobs.push(loadAdmin());
    await Promise.all(jobs);
    renderHome();
  };

  const boot = async () => {
    if (!apiBaseUrl || !token) return redirectLogin();
    try {
      me = await api('/me');
    } catch { return redirectLogin(); }
    renderAccount();
    renderPoints();
    wireEvents();
    try { await refreshData(); }
    catch (error) { toast(error.message || 'Nie udało się pobrać danych.','error'); }
    document.getElementById('panelBoot')?.classList.add('hidden');
    window.setTimeout(()=>document.getElementById('panelBoot')?.remove(),350);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>undefined);
  };

  void boot();
})();