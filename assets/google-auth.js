(() => {
  'use strict';

  const config = window.LOCKON_WEB_AUTH || {};
  const apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const tokenKey = 'lockon.web.session';

  const readToken = () => {
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

  const writeToken = (value) => {
    try {
      localStorage.setItem(tokenKey, value);
      sessionStorage.removeItem(tokenKey);
      return;
    } catch {}
    try { sessionStorage.setItem(tokenKey, value); } catch {}
  };

  const clearToken = () => {
    try { localStorage.removeItem(tokenKey); } catch {}
    try { sessionStorage.removeItem(tokenKey); } catch {}
  };

  const loginButton = document.getElementById('navLoginButton');
  const panelLink = document.getElementById('navPanelLink');
  const dialog = document.getElementById('webLoginDialog');
  const closeDialog = document.getElementById('closeWebLogin');
  const codeForm = document.getElementById('webAuthCodeForm');
  const codeInput = document.getElementById('webAuthCode');
  const codeSubmit = document.getElementById('webAuthCodeSubmit');
  const codeStatus = document.getElementById('webAuthCodeStatus');

  if (!apiBaseUrl) return;

  const api = async (path, options = {}, token = '') => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', 'Bearer ' + token);

    const response = await fetch(apiBaseUrl + path, {
      ...options,
      headers,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || 'Nie udało się połączyć z ServiceOS.');
      error.code = payload?.error || 'REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const setCodeStatus = (text, error = false) => {
    if (!codeStatus) return;
    codeStatus.textContent = text;
    codeStatus.classList.toggle('auth-error', error);
  };

  const renderSignedOut = () => {
    if (loginButton) loginButton.hidden = false;
    if (panelLink) panelLink.hidden = true;
  };

  const renderSignedIn = () => {
    if (loginButton) loginButton.hidden = true;
    if (panelLink) panelLink.hidden = false;
    setCodeStatus('Telefon jest już połączony. Możesz otworzyć panel.');
  };

  const saveSession = (payload, openPanel = true) => {
    if (!payload?.token) throw new Error('Backend nie zwrócił sesji ServiceOS.');
    writeToken(payload.token);
    renderSignedIn();
    try { dialog?.close(); } catch {}
    if (openPanel) window.location.href = 'panel.html';
  };

  const restore = async () => {
    const token = readToken();
    if (!token) {
      renderSignedOut();
      return false;
    }
    try {
      await api('/me', {}, token);
      renderSignedIn();
      return true;
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) clearToken();
      renderSignedOut();
      if (error?.status !== 401 && error?.status !== 403) {
        setCodeStatus('Sesja jest zapisana, ale ServiceOS jest chwilowo niedostępny. Spróbuj ponownie za moment.', true);
      }
      return false;
    }
  };

  const openDialog = () => {
    if (typeof dialog?.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    setCodeStatus('Kod działa tylko raz i nie zmienia Twoich uprawnień.');
    window.setTimeout(() => codeInput?.focus(), 90);
  };

  loginButton?.addEventListener('click', openDialog);
  closeDialog?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  const normalizedCode = () => String(codeInput?.value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  const syncCodeField = () => {
    if (!codeInput) return;
    const clean = normalizedCode();
    codeInput.value = clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
    const complete = clean.length === 8;
    codeInput.dataset.complete = complete ? 'true' : 'false';
    if (codeSubmit) codeSubmit.disabled = !complete;
    if (!codeStatus?.classList.contains('auth-error')) {
      setCodeStatus(complete
        ? 'Kod jest kompletny. Możesz połączyć telefon.'
        : 'Kod działa tylko raz i nie zmienia Twoich uprawnień.');
    }
  };

  codeInput?.addEventListener('input', () => {
    codeStatus?.classList.remove('auth-error');
    syncCodeField();
  });

  const redeemCode = async () => {
    const clean = normalizedCode();
    if (clean.length !== 8) {
      setCodeStatus('Wpisz pełny kod w formacie ABCD-EFGH.', true);
      codeInput?.focus();
      return;
    }

    const code = clean.slice(0, 4) + '-' + clean.slice(4);
    if (codeSubmit) codeSubmit.disabled = true;
    if (codeInput) codeInput.disabled = true;
    setCodeStatus('Sprawdzam kod i łączę telefon…');

    try {
      const payload = await api('/website/redeem', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      if (codeInput) codeInput.value = '';
      saveSession(payload, true);
    } catch (error) {
      setCodeStatus(error instanceof Error ? error.message : 'Kod jest nieprawidłowy albo wygasł.', true);
      if (codeInput) {
        codeInput.disabled = false;
        codeInput.select();
      }
      syncCodeField();
    } finally {
      if (codeInput) codeInput.disabled = false;
      syncCodeField();
    }
  };

  codeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void redeemCode();
  });

  window.LockOnWebAuth = Object.freeze({
    api,
    token: () => readToken(),
    clear: () => clearToken()
  });

  syncCodeField();
  void restore();

  const params = new URLSearchParams(window.location.search);
  if (params.get('login') === '1') {
    window.setTimeout(() => {
      if (!readToken()) openDialog();
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('login');
      history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }, 80);
  }
})();
