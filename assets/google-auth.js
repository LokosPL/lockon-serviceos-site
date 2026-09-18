(() => {
  const config = window.LOCKON_WEB_AUTH || {};
  const clientId = String(config.googleClientId || '').trim();
  const apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const signInHost = document.getElementById('googleSignInButton');
  const setupState = document.getElementById('googleAuthSetup');
  const accountState = document.getElementById('googleAccountState');
  const accountAvatar = document.getElementById('googleAccountAvatar');
  const accountName = document.getElementById('googleAccountName');
  const accountEmail = document.getElementById('googleAccountEmail');
  const signOut = document.getElementById('googleSignOut');
  const codeInput = document.getElementById('webAuthCode');
  const codeSubmit = document.getElementById('webAuthCodeSubmit');
  const codeStatus = document.getElementById('webAuthCodeStatus');

  if (!signInHost || !setupState || !accountState || !apiBaseUrl) return;

  const tokenKey = 'lockon.web.session';

  const setStatus = (message, error = false) => {
    if (!setupState) return;
    setupState.hidden = false;
    setupState.textContent = message;
    setupState.classList.toggle('auth-error', Boolean(error));
  };

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
      const error = new Error(payload?.message || 'Nie udało się zalogować do ServiceOS.');
      error.code = payload?.error || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  };

  const renderSignedOut = () => {
    accountState.hidden = true;
    setupState.hidden = false;
    signInHost.hidden = false;
    if (accountAvatar) {
      accountAvatar.removeAttribute('src');
      accountAvatar.hidden = true;
    }
  };

  const renderSignedIn = (payload) => {
    const user = payload?.user || {};
    setupState.hidden = true;
    signInHost.hidden = true;
    accountState.hidden = false;
    accountName.textContent = user.name || 'Konto ServiceOS';
    accountEmail.textContent = user.email || '';
    if (user.picture && accountAvatar) {
      accountAvatar.src = user.picture;
      accountAvatar.hidden = false;
    } else if (accountAvatar) {
      accountAvatar.removeAttribute('src');
      accountAvatar.hidden = true;
    }
    if (codeStatus) codeStatus.textContent = 'Sesja ServiceOS jest aktywna.';
  };

  const saveSession = (payload) => {
    if (!payload?.token) throw new Error('Backend nie zwrócił sesji ServiceOS.');
    sessionStorage.setItem(tokenKey, payload.token);
    renderSignedIn(payload);
  };

  const restore = async () => {
    const token = sessionStorage.getItem(tokenKey) || '';
    if (!token) return false;
    try {
      const payload = await api('/me', {}, token);
      renderSignedIn(payload);
      return true;
    } catch {
      sessionStorage.removeItem(tokenKey);
      return false;
    }
  };

  signOut?.addEventListener('click', async () => {
    const token = sessionStorage.getItem(tokenKey) || '';
    sessionStorage.removeItem(tokenKey);
    try {
      if (token) await api('/auth/logout', { method: 'POST', body: '{}' }, token);
    } catch {}
    window.google?.accounts?.id?.disableAutoSelect?.();
    if (codeStatus) codeStatus.textContent = 'Możesz zalogować się Google albo kodem z aplikacji.';
    renderSignedOut();
  });

  codeInput?.addEventListener('input', () => {
    const clean = String(codeInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    codeInput.value = clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
  });

  const redeemCode = async () => {
    const code = String(codeInput?.value || '').trim();
    if (!code) return;
    if (codeSubmit) codeSubmit.disabled = true;
    if (codeStatus) codeStatus.textContent = 'Sprawdzam kod…';
    try {
      const payload = await api('/website/redeem', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      saveSession(payload);
      if (codeInput) codeInput.value = '';
    } catch (error) {
      if (codeStatus) codeStatus.textContent = error instanceof Error ? error.message : 'Kod jest nieprawidłowy.';
    } finally {
      if (codeSubmit) codeSubmit.disabled = false;
    }
  };

  codeSubmit?.addEventListener('click', () => void redeemCode());
  codeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void redeemCode();
  });

  if (!clientId) {
    setStatus('Brakuje Web Client ID Google.', true);
    signInHost.hidden = true;
    return;
  }

  const loadGoogleIdentity = () => new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=pl';
    script.async = true;
    script.defer = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Nie udało się załadować Google Identity Services.'));
    document.head.appendChild(script);
  });

  const initialize = async () => {
    const restored = await restore();
    const google = await loadGoogleIdentity();

    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response) => {
        try {
          setStatus('Weryfikuję konto w ServiceOS…');
          const payload = await api('/auth/google-web', {
            method: 'POST',
            body: JSON.stringify({ idToken: String(response?.credential || '') })
          });
          saveSession(payload);
        } catch (error) {
          sessionStorage.removeItem(tokenKey);
          renderSignedOut();
          setStatus(error instanceof Error ? error.message : 'Brak dostępu do ServiceOS.', true);
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

    if (!restored) {
      renderSignedOut();
      setStatus('Zaloguj się aktywnym kontem ServiceOS albo użyj kodu z aplikacji.');
    }
  };

  initialize().catch((error) => {
    renderSignedOut();
    setStatus(error instanceof Error ? error.message : 'Logowanie jest chwilowo niedostępne.', true);
  });
})();
