(() => {
  const config = window.LOCKON_WEB_AUTH || {};
  const clientId = String(config.googleClientId || '').trim();
  const apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const tokenKey = 'lockon.web.session';

  const loginButton = document.getElementById('navLoginButton');
  const panelLink = document.getElementById('navPanelLink');
  const dialog = document.getElementById('webLoginDialog');
  const closeDialog = document.getElementById('closeWebLogin');
  const signInHost = document.getElementById('googleSignInButton');
  const codeInput = document.getElementById('webAuthCode');
  const codeSubmit = document.getElementById('webAuthCodeSubmit');
  const codeStatus = document.getElementById('webAuthCodeStatus');
  const accountState = document.getElementById('googleAccountState');
  const accountName = document.getElementById('googleAccountName');
  const accountEmail = document.getElementById('googleAccountEmail');
  const signOut = document.getElementById('googleSignOut');

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
    if (accountState) accountState.hidden = true;
  };

  const renderSignedIn = (payload) => {
    const user = payload?.user || {};
    if (loginButton) loginButton.hidden = true;
    if (panelLink) panelLink.hidden = false;
    if (accountState) accountState.hidden = false;
    if (accountName) accountName.textContent = user.name || 'Konto ServiceOS';
    if (accountEmail) accountEmail.textContent = user.email || '';
    setCodeStatus('Sesja aktywna. Możesz otworzyć mobilny panel.');
  };

  const saveSession = (payload, openPanel = true) => {
    if (!payload?.token) throw new Error('Backend nie zwrócił sesji ServiceOS.');
    sessionStorage.setItem(tokenKey, payload.token);
    renderSignedIn(payload);
    try { dialog?.close(); } catch {}
    if (openPanel) window.location.href = 'panel.html';
  };

  const restore = async () => {
    const token = sessionStorage.getItem(tokenKey) || '';
    if (!token) { renderSignedOut(); return false; }
    try {
      const payload = await api('/me', {}, token);
      renderSignedIn(payload);
      return true;
    } catch {
      sessionStorage.removeItem(tokenKey);
      renderSignedOut();
      return false;
    }
  };

  loginButton?.addEventListener('click', () => {
    if (typeof dialog?.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    setTimeout(() => codeInput?.focus(), 80);
  });
  closeDialog?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  codeInput?.addEventListener('input', () => {
    const clean = String(codeInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    codeInput.value = clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
  });

  const redeemCode = async () => {
    const code = String(codeInput?.value || '').trim();
    if (!code) return;
    if (codeSubmit) codeSubmit.disabled = true;
    setCodeStatus('Sprawdzam kod…');
    try {
      const payload = await api('/website/redeem', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      if (codeInput) codeInput.value = '';
      saveSession(payload, true);
    } catch (error) {
      setCodeStatus(error instanceof Error ? error.message : 'Kod jest nieprawidłowy.', true);
    } finally {
      if (codeSubmit) codeSubmit.disabled = false;
    }
  };

  codeSubmit?.addEventListener('click', () => void redeemCode());
  codeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void redeemCode();
  });

  signOut?.addEventListener('click', async () => {
    const token = sessionStorage.getItem(tokenKey) || '';
    sessionStorage.removeItem(tokenKey);
    try { if (token) await api('/auth/logout', { method: 'POST', body: '{}' }, token); } catch {}
    window.google?.accounts?.id?.disableAutoSelect?.();
    renderSignedOut();
    setCodeStatus('Wylogowano.');
  });

  const loadGoogleIdentity = () => new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=pl';
    script.async = true;
    script.defer = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Nie udało się załadować Google Identity Services.'));
    document.head.appendChild(script);
  });

  const initializeGoogle = async () => {
    if (!clientId || !signInHost) return;
    const google = await loadGoogleIdentity();
    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response) => {
        try {
          setCodeStatus('Weryfikuję konto Google…');
          const payload = await api('/auth/google-web', {
            method: 'POST',
            body: JSON.stringify({ idToken: String(response?.credential || '') })
          });
          saveSession(payload, true);
        } catch (error) {
          sessionStorage.removeItem(tokenKey);
          renderSignedOut();
          setCodeStatus(error instanceof Error ? error.message : 'Brak dostępu do ServiceOS.', true);
        }
      }
    });
    google.accounts.id.renderButton(signInHost, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 320
    });
  };

  window.LockOnWebAuth = Object.freeze({
    api,
    token: () => sessionStorage.getItem(tokenKey) || '',
    clear: () => sessionStorage.removeItem(tokenKey)
  });

  void restore();
  void initializeGoogle().catch((error) => setCodeStatus(error instanceof Error ? error.message : 'Logowanie Google jest chwilowo niedostępne.', true));

  const params = new URLSearchParams(window.location.search);
  if (params.get('login') === '1') loginButton?.click();
})();
