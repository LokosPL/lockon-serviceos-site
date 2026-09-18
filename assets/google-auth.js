(() => {
  const config = window.LOCKON_WEB_AUTH || {};
  const clientId = String(config.googleClientId || '').trim();
  const signInHost = document.getElementById('googleSignInButton');
  const setupState = document.getElementById('googleAuthSetup');
  const accountState = document.getElementById('googleAccountState');
  const accountAvatar = document.getElementById('googleAccountAvatar');
  const accountName = document.getElementById('googleAccountName');
  const accountEmail = document.getElementById('googleAccountEmail');
  const signOut = document.getElementById('googleSignOut');

  if (!signInHost || !setupState || !accountState) return;

  const storageKey = 'lockon.web.google.profile';

  const decodePayload = (credential) => {
    const parts = String(credential || '').split('.');
    if (parts.length !== 3) throw new Error('Nieprawidłowy token Google.');
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  };

  const validProfile = (payload) => {
    const issuerOk = payload?.iss === 'https://accounts.google.com' || payload?.iss === 'accounts.google.com';
    const audienceOk = payload?.aud === clientId;
    const notExpired = Number(payload?.exp || 0) * 1000 > Date.now();
    return issuerOk && audienceOk && notExpired && payload?.sub && payload?.email;
  };

  const renderSignedOut = () => {
    accountState.hidden = true;
    setupState.hidden = false;
    signInHost.hidden = false;
  };

  const renderSignedIn = (profile) => {
    setupState.hidden = true;
    signInHost.hidden = true;
    accountState.hidden = false;
    accountName.textContent = profile.name || 'Konto Google';
    accountEmail.textContent = profile.email || '';
    if (profile.picture) {
      accountAvatar.src = profile.picture;
      accountAvatar.hidden = false;
    } else {
      accountAvatar.removeAttribute('src');
      accountAvatar.hidden = true;
    }
  };

  const restore = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved?.email && saved?.sub) {
        renderSignedIn(saved);
        return true;
      }
    } catch {}
    return false;
  };

  signOut?.addEventListener('click', () => {
    sessionStorage.removeItem(storageKey);
    window.google?.accounts?.id?.disableAutoSelect?.();
    renderSignedOut();
  });

  if (!clientId) {
    setupState.textContent = 'Logowanie Google jest przygotowane. Brakuje tylko Web Client ID z Google Cloud.';
    signInHost.hidden = true;
    restore();
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
    const restored = restore();
    const google = await loadGoogleIdentity();
    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        try {
          const payload = decodePayload(response?.credential);
          if (!validProfile(payload)) throw new Error('Google zwrócił nieprawidłową sesję.');
          const profile = {
            sub: String(payload.sub),
            email: String(payload.email),
            name: String(payload.name || ''),
            picture: String(payload.picture || '')
          };
          sessionStorage.setItem(storageKey, JSON.stringify(profile));
          renderSignedIn(profile);
        } catch (error) {
          setupState.hidden = false;
          setupState.textContent = error instanceof Error ? error.message : 'Nie udało się zalogować przez Google.';
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

    if (!restored) renderSignedOut();
  };

  initialize().catch((error) => {
    setupState.hidden = false;
    setupState.textContent = error instanceof Error ? error.message : 'Logowanie Google jest chwilowo niedostępne.';
    signInHost.hidden = true;
  });
})();
