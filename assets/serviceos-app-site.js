(() => {
  'use strict';

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  document.body.classList.add('reveal-enabled');

  const topbar = qs('[data-site-nav]');
  const menuToggle = qs('[data-menu-toggle]');
  const mobileMenu = qs('#mobileMenu');

  const setMenuOpen = (open) => {
    topbar?.classList.toggle('menu-open', open);
    menuToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileMenu?.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  const syncTopbar = () => topbar?.classList.toggle('scrolled', window.scrollY > 10);
  syncTopbar();
  window.addEventListener('scroll', syncTopbar, { passive: true });

  menuToggle?.addEventListener('click', () => {
    setMenuOpen(!topbar?.classList.contains('menu-open'));
  });

  qsa('#mobileMenu a, #mobileMenu button').forEach((control) => {
    control.addEventListener('click', () => setMenuOpen(false));
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setMenuOpen(false);
  }, { passive: true });

  if (!reducedMotion) {
    let pointerFrame = 0;
    window.addEventListener('pointermove', (event) => {
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        const nx = (event.clientX / Math.max(1, window.innerWidth) - .5) * 2;
        const ny = (event.clientY / Math.max(1, window.innerHeight) - .5) * 2;
        const root = document.documentElement;
        root.style.setProperty('--hero-x', (nx * 18).toFixed(2) + 'px');
        root.style.setProperty('--hero-y', (ny * 12).toFixed(2) + 'px');
        root.style.setProperty('--tilt-x', (-ny * 1.15).toFixed(2) + 'deg');
        root.style.setProperty('--tilt-y', (nx * 2.1).toFixed(2) + 'deg');
        root.style.setProperty('--phone-x', (-nx * 8).toFixed(2) + 'px');
        root.style.setProperty('--phone-y', (-ny * 6).toFixed(2) + 'px');
      });
    }, { passive: true });

    qsa('.meetings-section, .phone-section, .start-section').forEach((section) => {
      section.addEventListener('pointermove', (event) => {
        const rect = section.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
        section.style.setProperty('--spot-x', x.toFixed(1) + '%');
        section.style.setProperty('--spot-y', y.toFixed(1) + '%');
      }, { passive: true });
    });
  }

  const revealItems = qsa('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((element) => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: .12, rootMargin: '0px 0px -32px 0px' });
    revealItems.forEach((element) => revealObserver.observe(element));
  }

  const previewKeys = ['start', 'service', 'meetings', 'admin'];
  let previewIndex = 0;
  let previewPausedUntil = 0;

  const activatePreview = (key, userAction = false) => {
    if (!previewKeys.includes(key)) return;
    previewIndex = previewKeys.indexOf(key);
    qsa('[data-preview]').forEach((button) => {
      button.classList.toggle('active', button.dataset.preview === key);
      button.setAttribute('aria-pressed', button.dataset.preview === key ? 'true' : 'false');
    });
    qsa('[data-preview-screen]').forEach((screen) => {
      screen.classList.toggle('active', screen.dataset.previewScreen === key);
    });
    if (userAction) previewPausedUntil = Date.now() + 12000;
  };

  qsa('[data-preview]').forEach((button) => {
    button.addEventListener('click', () => activatePreview(button.dataset.preview || '', true));
  });
  activatePreview('start');

  if (!reducedMotion) {
    window.setInterval(() => {
      if (document.hidden || Date.now() < previewPausedUntil) return;
      activatePreview(previewKeys[(previewIndex + 1) % previewKeys.length]);
    }, 4300);
  }

  const moduleKeys = ['service', 'clients', 'meetings', 'finance', 'admin', 'tools'];
  let moduleIndex = 0;
  let modulePausedUntil = 0;
  const moduleWorkspace = qs('.modules-os-window');
  let moduleWorkspaceVisible = false;

  const activateModule = (key, userAction = false) => {
    if (!moduleKeys.includes(key)) return;
    moduleIndex = moduleKeys.indexOf(key);
    qsa('[data-module]').forEach((button) => {
      const active = button.dataset.module === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-module-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.modulePanel === key);
    });
    if (userAction) modulePausedUntil = Date.now() + 14000;
  };

  qsa('[data-module]').forEach((button) => {
    button.addEventListener('click', () => activateModule(button.dataset.module || '', true));
  });
  activateModule('service');

  if ('IntersectionObserver' in window && moduleWorkspace) {
    const moduleObserver = new IntersectionObserver((entries) => {
      moduleWorkspaceVisible = entries.some((entry) => entry.isIntersecting);
    }, { threshold: .25 });
    moduleObserver.observe(moduleWorkspace);
  }

  if (!reducedMotion) {
    window.setInterval(() => {
      if (document.hidden || !moduleWorkspaceVisible || Date.now() < modulePausedUntil) return;
      activateModule(moduleKeys[(moduleIndex + 1) % moduleKeys.length]);
    }, 5200);
  }

  const activateMeetingSide = (key) => {
    qsa('[data-meeting-side]').forEach((button) => {
      const active = button.dataset.meetingSide === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    qsa('[data-meeting-side-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.meetingSidePanel === key);
    });
  };

  qsa('[data-meeting-side]').forEach((button) => {
    button.addEventListener('click', () => activateMeetingSide(button.dataset.meetingSide || 'chat'));
  });
  qsa('[data-meeting-side-open]').forEach((button) => {
    button.addEventListener('click', () => {
      activateMeetingSide(button.dataset.meetingSideOpen || 'chat');
      if (window.innerWidth <= 900) qs('.meeting-side')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
  });
  activateMeetingSide('chat');

  qsa('.meeting-controls button:not([data-meeting-side-open])').forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.toggle('active');
      button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
    });
  });

  const meetingRoom = qs('[data-meeting-room]');
  const theaterButton = qs('[data-meeting-theater]');
  theaterButton?.addEventListener('click', () => {
    const active = meetingRoom?.classList.toggle('theater-mode') || false;
    theaterButton.innerHTML = active ? '<span>▣</span> Widok standardowy' : '<span>▣</span> Tryb kinowy';
    theaterButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const meetingElapsed = qsa('[data-meeting-elapsed]');
  let meetingSeconds = 123;
  const renderMeetingElapsed = () => {
    if (!meetingElapsed.length) return;
    const minutes = Math.floor(meetingSeconds / 60);
    const seconds = meetingSeconds % 60;
    const value = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    meetingElapsed.forEach((element) => { element.textContent = value; });
  };
  renderMeetingElapsed();
  if (!reducedMotion) {
    window.setInterval(() => {
      if (document.hidden) return;
      meetingSeconds += 1;
      renderMeetingElapsed();
    }, 1000);
  }

  const roleProfiles = {
    owner: {
      title: 'Właściciel aplikacji',
      scope: 'Wszystkie punkty',
      copy: 'Pełny widok punktów, zespołu, administracji i rozliczeń.',
      permissions: ['Wszystkie punkty', 'Zespół', 'Rozliczenia', 'Administracja'],
      nav: ['Start', 'Serwis', 'Spotkania', 'Rozliczenia', 'Administracja', 'Klienci']
    },
    boss: {
      title: 'Szef / Koordynator',
      scope: 'Przypisane punkty',
      copy: 'Prowadzi zespół, serwis i organizację pracy w przypisanym zakresie.',
      permissions: ['Punkty', 'Zespół', 'Serwis', 'Spotkania'],
      nav: ['Start', 'Serwis', 'Spotkania', 'Administracja', 'Klienci']
    },
    tech: {
      title: 'Serwisant',
      scope: 'Praca techniczna',
      copy: 'Dostaje kolejkę napraw, części, terminy i funkcje potrzebne przy urządzeniu.',
      permissions: ['Zlecenia', 'Części', 'Terminy', 'Spotkania'],
      nav: ['Start', 'Serwis', 'Spotkania', 'Rozliczenia']
    },
    front: {
      title: 'Obsługa',
      scope: 'Front desk',
      copy: 'Przyjmuje klienta, prowadzi kontakt, przekazania, dokumenty i odbiór.',
      permissions: ['Klient', 'Przyjęcie', 'Przekazania', 'Odbiór'],
      nav: ['Start', 'Serwis', 'Spotkania', 'Klienci']
    }
  };

  const activateRolePreview = (key) => {
    const profile = roleProfiles[key];
    if (!profile) return;
    qsa('[data-role-preview]').forEach((button) => {
      const active = button.dataset.rolePreview === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const title = qs('[data-role-title]');
    const copy = qs('[data-role-copy]');
    const scope = qs('[data-role-scope]');
    if (title) title.textContent = profile.title;
    if (copy) copy.textContent = profile.copy;
    if (scope) scope.textContent = profile.scope;
    const permissions = qs('[data-role-permissions]');
    if (permissions) permissions.innerHTML = profile.permissions.map((item) => '<i>' + item + '</i>').join('');
    qsa('[data-role-nav] > i').forEach((item) => {
      const label = (item.textContent || '').trim();
      item.classList.toggle('role-nav-hidden', !profile.nav.includes(label));
    });
  };

  qsa('[data-role-preview]').forEach((button) => {
    button.addEventListener('click', () => activateRolePreview(button.dataset.rolePreview || 'owner'));
  });
  activateRolePreview('owner');

  const liveClocks = qsa('[data-live-clock]');
  const renderLiveClock = () => {
    if (!liveClocks.length) return;
    const now = new Date();
    const value = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    liveClocks.forEach((clock) => { clock.textContent = value; });
  };
  renderLiveClock();
  window.setInterval(renderLiveClock, 15000);

    const phoneKeys = ['1', '2', '3', '4'];
  let phoneIndex = 0;
  let phonePausedUntil = 0;

  const activatePhoneStep = (key, userAction = false) => {
    if (!phoneKeys.includes(key)) return;
    phoneIndex = phoneKeys.indexOf(key);
    qsa('[data-phone-step]').forEach((button) => {
      const active = button.dataset.phoneStep === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-phone-screen]').forEach((screen) => {
      screen.classList.toggle('active', screen.dataset.phoneScreen === key);
    });
    if (userAction) phonePausedUntil = Date.now() + 12000;
  };

  qsa('[data-phone-step]').forEach((button) => {
    button.addEventListener('click', () => activatePhoneStep(button.dataset.phoneStep || '1', true));
  });
  activatePhoneStep('1');

  if (!reducedMotion) {
    window.setInterval(() => {
      if (document.hidden || Date.now() < phonePausedUntil) return;
      activatePhoneStep(phoneKeys[(phoneIndex + 1) % phoneKeys.length]);
    }, 3400);
  }

  const onboardingKey = 'lockon.employee.onboarding.v1';
  const acceptButton = qs('#acceptOnboarding');
  const onboardingState = qs('#onboardingState');
  const checks = ['agreeEmployee', 'agreeRules', 'agreeMobile'].map((id) => qs('#' + id)).filter(Boolean);

  const isOnboardingAccepted = () => {
    try { return localStorage.getItem(onboardingKey) === 'accepted'; }
    catch { return false; }
  };

  const setOnboardingState = (accepted) => {
    document.body.classList.toggle('onboarding-accepted', accepted);
    qsa('[data-requires-onboarding]').forEach((element) => {
      element.classList.toggle('onboarding-action-locked', !accepted);
      element.setAttribute('aria-disabled', accepted ? 'false' : 'true');
      if (element instanceof HTMLAnchorElement && element.classList.contains('download-link')) {
        if (!element.dataset.downloadUrl && element.href && !element.href.endsWith('#start')) {
          element.dataset.downloadUrl = element.href;
        }
        element.href = accepted && element.dataset.downloadUrl ? element.dataset.downloadUrl : '#start';
      }
    });

    if (acceptButton) {
      acceptButton.disabled = accepted || !checks.every((input) => input.checked);
      acceptButton.textContent = accepted ? '✓ ServiceOS odblokowany' : 'Odblokuj ServiceOS →';
    }
    if (onboardingState) {
      onboardingState.textContent = accepted
        ? 'Gotowe. Możesz pobrać aplikację albo połączyć telefon.'
        : 'Potwierdź trzy punkty powyżej.';
    }
  };

  const guideToStart = () => {
    const target = qs('#start');
    target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    target?.classList.remove('onboarding-nudge');
    window.requestAnimationFrame(() => target?.classList.add('onboarding-nudge'));
    window.setTimeout(() => target?.classList.remove('onboarding-nudge'), 1300);
  };

  checks.forEach((input) => input.addEventListener('change', () => setOnboardingState(isOnboardingAccepted())));
  acceptButton?.addEventListener('click', () => {
    if (!checks.every((input) => input.checked)) return;
    try { localStorage.setItem(onboardingKey, 'accepted'); } catch {}
    setOnboardingState(true);
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-requires-onboarding]') : null;
    if (!target || isOnboardingAccepted()) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    guideToStart();
  }, true);

  if (isOnboardingAccepted()) checks.forEach((input) => { input.checked = true; });
  setOnboardingState(isOnboardingAccepted());

  qsa('[data-open-login]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!isOnboardingAccepted()) {
        guideToStart();
        return;
      }
      qs('#navLoginButton')?.click();
    });
  });

  qsa('[data-copy-site]').forEach((button) => {
    button.addEventListener('click', async () => {
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText('https://app.serviceos.pl');
        button.textContent = 'Skopiowano';
      } catch {
        button.textContent = 'app.serviceos.pl';
      }
      window.setTimeout(() => { button.textContent = original; }, 1400);
    });
  });

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'instalator Windows';
    return (bytes / 1024 / 1024).toFixed(0) + ' MB';
  };
  const normalizeDigest = (value) => String(value || '').replace(/^sha256:/i, '').trim().toLowerCase();

  const releaseController = new AbortController();
  const releaseTimeout = window.setTimeout(() => releaseController.abort(), 5000);
  fetch('https://api.github.com/repos/LokosPL/LockOn-Hub/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: releaseController.signal
  })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('release unavailable')))
    .then((release) => {
      const asset = release?.assets?.find((item) => item.name === 'LockOn-ServiceOS-Setup.exe');
      const version = String(release?.name || release?.tag_name || '').replace(/^LockOn ServiceOS v?/i, '').replace(/^v/i, '');
      qsa('[data-release-version]').forEach((element) => { element.textContent = version || 'najnowsza'; });
      if (asset?.browser_download_url) {
        qsa('.download-link').forEach((element) => {
          element.dataset.downloadUrl = asset.browser_download_url;
          if (isOnboardingAccepted()) element.href = asset.browser_download_url;
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
        const element = entry.target;
        const target = Number(element.dataset.count || '0');
        if (!Number.isFinite(target) || reducedMotion) {
          element.textContent = String(target);
        } else {
          const start = performance.now();
          const duration = 700;
          const frame = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
            if (progress < 1) window.requestAnimationFrame(frame);
          };
          window.requestAnimationFrame(frame);
        }
        counterObserver.unobserve(element);
      }
    }, { threshold: .55 });
    animatedCounters.forEach((element) => counterObserver.observe(element));
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => undefined);
    }, { once: true });
  }
})();
