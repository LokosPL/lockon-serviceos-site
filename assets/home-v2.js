(() => {
  const onboardingKey = 'lockon.employee.onboarding.v1';
  const body = document.body;
  const acceptButton = document.getElementById('acceptOnboarding');
  const stateLabel = document.getElementById('onboardingState');
  const checks = [
    document.getElementById('agreeEmployee'),
    document.getElementById('agreeRules'),
    document.getElementById('agreeMobile')
  ].filter(Boolean);
  const protectedElements = [...document.querySelectorAll('[data-requires-onboarding]')];
  const nextPanel = new URLSearchParams(window.location.search).get('next') === 'panel';

  const isAccepted = () => {
    try { return localStorage.getItem(onboardingKey) === 'accepted'; }
    catch { return false; }
  };

  const setAccepted = (accepted) => {
    body.classList.toggle('onboarding-locked', !accepted);
    body.classList.toggle('onboarding-accepted', accepted);
    protectedElements.forEach((element) => {
      element.classList.toggle('onboarding-action-locked', !accepted);
      element.setAttribute('aria-disabled', accepted ? 'false' : 'true');
      if (!accepted) {
        element.setAttribute('data-onboarding-lock', '1');
        if (element instanceof HTMLAnchorElement && element.classList.contains('download-link')) {
          if (element.href && !element.href.endsWith('#start')) element.dataset.downloadUrl = element.href;
          element.href = '#start';
        }
      } else {
        element.removeAttribute('data-onboarding-lock');
        if (element instanceof HTMLAnchorElement && element.classList.contains('download-link') && element.dataset.downloadUrl) {
          element.href = element.dataset.downloadUrl;
        }
      }
    });
    if (stateLabel) stateLabel.textContent = accepted
      ? 'ServiceOS odblokowany w tej przeglądarce. Nadal obowiązuje weryfikacja konta przez OWNER.'
      : 'Pobieranie i panel są jeszcze zablokowane.';
    if (acceptButton) {
      acceptButton.textContent = accepted ? '✓ ServiceOS odblokowany' : 'Rozumiem — odblokuj ServiceOS';
      acceptButton.disabled = accepted || !checks.every((input) => input.checked);
    }
    const lockState = document.getElementById('downloadLockState');
    if (lockState) {
      lockState.classList.toggle('unlocked', accepted);
      lockState.innerHTML = accepted
        ? '<span>✓</span><strong>Instrukcja zaakceptowana — możesz pobrać aplikację lub połączyć telefon.</strong>'
        : '<span>🔒</span><strong>Najpierw zaakceptuj zasady pracownika.</strong>';
    }
  };

  const guideToOnboarding = () => {
    const target = document.getElementById('onboardingAccept') || document.getElementById('start');
    target?.scrollIntoView({ behavior:'smooth', block:'center' });
    target?.classList.remove('onboarding-nudge');
    window.setTimeout(() => target?.classList.add('onboarding-nudge'), 10);
    window.setTimeout(() => target?.classList.remove('onboarding-nudge'), 1600);
  };

  const unlockIfReady = () => {
    if (isAccepted()) return setAccepted(true);
    if (acceptButton) acceptButton.disabled = !checks.every((input) => input.checked);
  };

  checks.forEach((input) => input.addEventListener('change', unlockIfReady));

  acceptButton?.addEventListener('click', () => {
    if (!checks.every((input) => input.checked)) return;
    try { localStorage.setItem(onboardingKey, 'accepted'); } catch {}
    setAccepted(true);
    if (nextPanel) {
      window.setTimeout(() => document.getElementById('navLoginButton')?.click(), 250);
    } else {
      document.getElementById('download')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-requires-onboarding]') : null;
    if (!target || isAccepted()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    guideToOnboarding();
  }, true);

  document.querySelectorAll('[data-open-login]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!isAccepted()) {
        guideToOnboarding();
        return;
      }
      document.getElementById('navLoginButton')?.click();
    });
  });

  document.querySelectorAll('[data-copy-site]').forEach((button) => {
    button.addEventListener('click', async () => {
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText('https://app.serviceos.pl');
        button.textContent = 'Skopiowano';
      } catch {
        button.textContent = 'app.serviceos.pl';
      }
      window.setTimeout(() => { button.textContent = original; }, 1600);
    });
  });

  if (isAccepted()) {
    checks.forEach((input) => { input.checked = true; });
  }
  setAccepted(isAccepted());

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => undefined), { once: true });
  }
})();
