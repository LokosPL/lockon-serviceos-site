(() => {
  'use strict';

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = qs('.site-nav');
  const menuButton = qs('.mobile-menu-button');
  const syncNav = () => nav?.classList.toggle('scrolled', window.scrollY > 10);
  syncNav();
  window.addEventListener('scroll', syncNav, { passive:true });

  menuButton?.addEventListener('click', () => {
    const open = nav?.classList.toggle('menu-open');
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  qsa('.site-links a, .mobile-anchor-nav a').forEach((link) => {
    link.addEventListener('click', () => {
      nav?.classList.remove('menu-open');
      menuButton?.setAttribute('aria-expanded','false');
    });
  });

  if (!reducedMotion) {
    window.addEventListener('pointermove', (event) => {
      const x = Math.round((event.clientX / Math.max(1, window.innerWidth)) * 100);
      const y = Math.round((event.clientY / Math.max(1, window.innerHeight)) * 100);
      document.body.style.setProperty('--mx', x + '%');
      document.body.style.setProperty('--my', y + '%');
    }, { passive:true });
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }, { threshold:.12, rootMargin:'0px 0px -35px 0px' })
    : null;

  qsa('.reveal').forEach((element) => {
    if (observer) observer.observe(element);
    else element.classList.add('visible');
  });

  const activatePreview = (key) => {
    qsa('[data-preview-tab]').forEach((button) => button.classList.toggle('active', button.dataset.previewTab === key));
    qsa('[data-preview-screen]').forEach((screen) => screen.classList.toggle('active', screen.dataset.previewScreen === key));
    qsa('[data-app-nav]').forEach((button) => button.classList.toggle('active', button.dataset.appNav === key));
  };
  qsa('[data-preview-tab],[data-app-nav]').forEach((button) => {
    button.addEventListener('click', () => activatePreview(button.dataset.previewTab || button.dataset.appNav));
  });

  const previewKeys = ['start','service','meetings','admin'];
  let previewIndex = 0;
  let previewPausedUntil = 0;
  const cyclePreview = () => {
    if (reducedMotion || document.hidden || Date.now() < previewPausedUntil) return;
    previewIndex = (previewIndex + 1) % previewKeys.length;
    activatePreview(previewKeys[previewIndex]);
  };
  window.setInterval(cyclePreview, 4200);
  qsa('[data-preview-tab],[data-app-nav]').forEach((button) => button.addEventListener('click', () => {
    previewPausedUntil = Date.now() + 14000;
    previewIndex = Math.max(0, previewKeys.indexOf(button.dataset.previewTab || button.dataset.appNav));
  }));

  const activateModule = (key) => {
    qsa('[data-module-button]').forEach((button) => button.classList.toggle('active', button.dataset.moduleButton === key));
    qsa('[data-module-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.modulePanel === key));
  };
  qsa('[data-module-button]').forEach((button) => button.addEventListener('click', () => activateModule(button.dataset.moduleButton)));

  const meetingScene = qs('[data-meeting22-scene="live"]');
  meetingScene?.addEventListener('click', () => {
    meetingScene.classList.toggle('active');
  });

  const onboardingKey = 'lockon.employee.onboarding.v1';
  const acceptButton = qs('#acceptOnboarding');
  const state = qs('#onboardingState');
  const checks = ['agreeEmployee','agreeRules','agreeMobile'].map((id) => qs('#' + id)).filter(Boolean);
  const isAccepted = () => {
    try { return localStorage.getItem(onboardingKey) === 'accepted'; }
    catch { return false; }
  };
  const setAccepted = (accepted) => {
    document.body.classList.toggle('onboarding-accepted', accepted);
    qsa('[data-requires-onboarding]').forEach((element) => {
      element.classList.toggle('onboarding-action-locked', !accepted);
      element.setAttribute('aria-disabled', accepted ? 'false' : 'true');
      if (element instanceof HTMLAnchorElement && element.classList.contains('download-link')) {
        if (!element.dataset.downloadUrl && element.href && !element.href.endsWith('#start')) element.dataset.downloadUrl = element.href;
        element.href = accepted && element.dataset.downloadUrl ? element.dataset.downloadUrl : '#start';
      }
    });
    if (acceptButton) {
      acceptButton.disabled = accepted || !checks.every((input) => input.checked);
      acceptButton.textContent = accepted ? '✓ ServiceOS odblokowany' : 'Rozumiem — odblokuj ServiceOS';
    }
    if (state) state.textContent = accepted
      ? 'Gotowe. Możesz pobrać aplikację albo połączyć telefon.'
      : 'Pobieranie i łączenie telefonu odblokują się po potwierdzeniu.';
  };
  const guideToStart = () => {
    const target = qs('#start');
    target?.scrollIntoView({ behavior:reducedMotion ? 'auto' : 'smooth', block:'center' });
    target?.classList.remove('onboarding-nudge');
    requestAnimationFrame(() => target?.classList.add('onboarding-nudge'));
    window.setTimeout(() => target?.classList.remove('onboarding-nudge'), 1300);
  };
  checks.forEach((input) => input.addEventListener('change', () => setAccepted(isAccepted())));
  acceptButton?.addEventListener('click', () => {
    if (!checks.every((input) => input.checked)) return;
    try { localStorage.setItem(onboardingKey,'accepted'); } catch {}
    setAccepted(true);
  });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-requires-onboarding]') : null;
    if (!target || isAccepted()) return;
    event.preventDefault();
    event.stopPropagation();
    guideToStart();
  }, true);
  if (isAccepted()) checks.forEach((input) => { input.checked = true; });
  setAccepted(isAccepted());

  qsa('[data-open-login]').forEach((button) => button.addEventListener('click', () => {
    if (!isAccepted()) return guideToStart();
    qs('#navLoginButton')?.click();
  }));

  qsa('[data-copy-site]').forEach((button) => button.addEventListener('click', async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText('https://app.serviceos.pl');
      button.textContent = 'Skopiowano';
    } catch {
      button.textContent = 'app.serviceos.pl';
    }
    window.setTimeout(() => { button.textContent = original; }, 1400);
  }));

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'instalator Windows';
    return (bytes / 1024 / 1024).toFixed(0) + ' MB';
  };
  const normalizeDigest = (value) => String(value || '').replace(/^sha256:/i,'').trim().toLowerCase();
  const releaseController = new AbortController();
  const releaseTimeout = window.setTimeout(() => releaseController.abort(), 5000);
  fetch('https://api.github.com/repos/LokosPL/LockOn-Hub/releases/latest', {
    headers:{Accept:'application/vnd.github+json'},
    credentials:'omit',
    cache:'no-store',
    referrerPolicy:'no-referrer',
    signal:releaseController.signal
  }).then((response) => response.ok ? response.json() : Promise.reject(new Error('release unavailable')))
    .then((release) => {
      const asset = release?.assets?.find((item) => item.name === 'LockOn-ServiceOS-Setup.exe');
      const version = String(release?.name || release?.tag_name || '').replace(/^LockOn ServiceOS v?/i,'').replace(/^v/i,'');
      qsa('[data-release-version]').forEach((element) => { element.textContent = version || 'najnowsza'; });
      if (asset?.browser_download_url) {
        qsa('.download-link').forEach((element) => {
          element.dataset.downloadUrl = asset.browser_download_url;
          if (isAccepted()) element.href = asset.browser_download_url;
        });
      }
      qsa('[data-release-size]').forEach((element) => { element.textContent = formatBytes(asset?.size); });
      const digest = normalizeDigest(asset?.digest);
      qsa('[data-release-digest]').forEach((element) => { element.textContent = digest || 'SHA-256 w GitHub Release'; });
    })
    .catch(() => {
      qsa('[data-release-version]').forEach((element) => { element.textContent = 'najnowsza'; });
      qsa('[data-release-size]').forEach((element) => { element.textContent = 'instalator Windows'; });
      qsa('[data-release-digest]').forEach((element) => { element.textContent = 'SHA-256 w GitHub Release'; });
    })
    .finally(() => window.clearTimeout(releaseTimeout));

  const animatedCounters = qsa('[data-count]');
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const target = Number(el.dataset.count || '0');
        if (!Number.isFinite(target) || reducedMotion) {
          el.textContent = String(target);
        } else {
          const start = performance.now();
          const duration = 700;
          const frame = (now) => {
            const progress = Math.min(1,(now-start)/duration);
            el.textContent = String(Math.round(target * (1 - Math.pow(1-progress,3))));
            if (progress < 1) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }
        counterObserver.unobserve(el);
      }
    },{threshold:.6});
    animatedCounters.forEach((el) => counterObserver.observe(el));
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => undefined), { once:true });
  }
})();