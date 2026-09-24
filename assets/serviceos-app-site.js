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

  const moduleKeys = ['start', 'browser', 'service', 'clients', 'meetings', 'finance', 'admin', 'tools', 'help', 'settings'];
  const moduleAutoKeys = ['start', 'service', 'clients', 'meetings', 'finance', 'admin', 'tools'];
  let moduleIndex = 0;
  let modulePausedUntil = 0;
  let moduleUserControlled = false;
  const moduleWorkspace = qs('.modules-os-window');
  let moduleWorkspaceVisible = false;

  const activateModule = (key, userAction = false) => {
    if (!moduleKeys.includes(key)) return;
    moduleIndex = Math.max(0, moduleAutoKeys.indexOf(key));
    qsa('[data-module]').forEach((button) => {
      const active = button.dataset.module === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-module-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.modulePanel === key);
    });
    if (userAction) {
      moduleUserControlled = true;
      modulePausedUntil = Number.POSITIVE_INFINITY;
    }
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
      if (document.hidden || !moduleWorkspaceVisible || moduleUserControlled || Date.now() < modulePausedUntil) return;
      activateModule(moduleAutoKeys[(moduleIndex + 1) % moduleAutoKeys.length]);
    }, 5200);
  }

  const serviceDemoTabs = ['plan', 'intake', 'orders', 'transfers', 'quotes', 'invoices', 'notes'];
  let serviceDemoActive = 'plan';

  const activateServiceDemoView = (key, userAction = false) => {
    if (!serviceDemoTabs.includes(key)) return;
    serviceDemoActive = key;
    qsa('[data-service-demo-tab]').forEach((button) => {
      const active = button.dataset.serviceDemoTab === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-service-demo-view]').forEach((view) => {
      view.classList.toggle('active', view.dataset.serviceDemoView === key);
    });
    if (userAction) modulePausedUntil = Date.now() + 18000;
  };

  qsa('[data-service-demo-tab]').forEach((button) => {
    button.addEventListener('click', () => activateServiceDemoView(button.dataset.serviceDemoTab || 'plan', true));
  });
  activateServiceDemoView('plan');

  qsa('.workplan-demo-days button').forEach((button) => {
    button.addEventListener('click', () => {
      qsa('.workplan-demo-days button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      modulePausedUntil = Date.now() + 10000;
    });
  });

  const activateIntakeStep = (key) => {
    qsa('[data-intake-step]').forEach((button) => {
      const active = button.dataset.intakeStep === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-intake-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.intakePanel === key);
    });
  };

  qsa('[data-intake-step]').forEach((button) => {
    button.addEventListener('click', () => {
      activateIntakeStep(button.dataset.intakeStep || '1');
      modulePausedUntil = Date.now() + 12000;
    });
  });
  qsa('[data-intake-next]').forEach((button) => {
    button.addEventListener('click', () => {
      activateIntakeStep(button.dataset.intakeNext || '1');
      modulePausedUntil = Date.now() + 12000;
    });
  });
  activateIntakeStep('1');

  const demoToast = qs('[data-demo-toast]');
  let demoToastTimer = 0;
  const showDemoToast = (title, copy) => {
    if (!demoToast) return;
    const titleEl = qs('[data-demo-toast-title]', demoToast);
    const copyEl = qs('[data-demo-toast-copy]', demoToast);
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    demoToast.hidden = false;
    window.clearTimeout(demoToastTimer);
    demoToastTimer = window.setTimeout(() => { demoToast.hidden = true; }, 2800);
  };

  const demoOrders = {
    '1042': { title: '#1042 · iPhone 14 Pro', customer: 'Anna Kowalska · Nowogard', status: 'DIAGNOZA', next: 'Najbliższy krok: rozpocznij diagnozę' },
    '1044': { title: '#1044 · MacBook Air M2', customer: 'Kamil Wójcik · Nowogard', status: 'NAPRAWA', next: 'Najbliższy krok: montaż nowej części' },
    '1047': { title: '#1047 · Samsung S23', customer: 'Julia Lis · Nowogard', status: 'CZEKA NA CZĘŚCI', next: 'Najbliższy krok: dostawa modułu USB-C' },
    '1050': { title: '#1050 · iPad Air', customer: 'Paweł Nowak · Nowogard', status: 'NOWE', next: 'Najbliższy krok: rozpocznij przyjęcie techniczne' },
    '1041': { title: '#1041 · Samsung S24', customer: 'Piotr Nowak · Szczecin', status: 'W DRODZE', next: 'Najbliższy krok: potwierdzenie odbioru w punkcie' },
    '1038': { title: '#1038 · iPhone 13', customer: 'Marta Lis · Nowogard', status: 'GOTOWE', next: 'Najbliższy krok: wydanie klientowi' },
    '1036': { title: '#1036 · MacBook Pro', customer: 'Adam Zalewski · Nowogard', status: 'CZEKA NA CZĘŚCI', next: 'Najbliższy krok: dostawa baterii jutro' }
  };

  const serviceOrderDrawer = qs('[data-service-order-drawer]');
  const openServiceOrderDrawer = (orderNo) => {
    if (!serviceOrderDrawer) return;
    const data = demoOrders[orderNo] || demoOrders['1042'];
    const heading = qs('header h3', serviceOrderDrawer);
    const customer = qs('header p', serviceOrderDrawer);
    const status = qs('.service-order-drawer-status b', serviceOrderDrawer);
    const next = qs('.service-order-drawer-status span', serviceOrderDrawer);
    if (heading) heading.textContent = data.title;
    if (customer) customer.textContent = data.customer;
    if (status) status.textContent = data.status;
    if (next) next.textContent = data.next;
    serviceOrderDrawer.hidden = false;
    modulePausedUntil = Date.now() + 20000;
  };
  const closeServiceOrderDrawer = () => {
    if (serviceOrderDrawer) serviceOrderDrawer.hidden = true;
  };

  qsa('[data-demo-order]').forEach((button) => {
    button.addEventListener('click', () => openServiceOrderDrawer(button.dataset.demoOrder || '1042'));
  });
  qsa('[data-service-order-close]').forEach((button) => button.addEventListener('click', closeServiceOrderDrawer));

  qsa('[data-service-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.serviceAction || '';
      const messages = {
        'create-order': ['Zlecenie #1051 utworzone', 'Klient otrzymał potwierdzenie, a urządzenie trafiło do kolejki serwisu.'],
        'quote-reply': ['Odpowiedź otwarta', 'ServiceOS przygotował odpowiedź w historii klienta.'],
        'quote-price': ['Wycena 349 zł wysłana', 'Klient może zaakceptować wycenę ze swojego panelu.'],
        'download-invoices': ['Paczka faktur gotowa', 'ServiceOS przygotował dokumenty z bieżącego miesiąca.'],
        'download-one': ['Faktura gotowa', 'Dokument został przygotowany do pobrania.'],
        'pin-note': ['Notatka przypięta', 'Pojawi się na górze prywatnego notatnika serwisanta.'],
        'save-note': ['Notatka zapisana', 'Prywatna notatka została zapisana w ServiceOS.'],
        'add-note': ['Notatka dodana', 'Informacja została dopisana do historii zlecenia.'],
        'advance-order': ['Diagnoza zakończona', 'Zlecenie przeszło do kolejnego etapu i klient dostał aktualizację.'],
        'browser-open': ['Instrukcja otwarta', 'ServiceOS otworzył dokumentację w swojej przeglądarce.'],
        'support-join': ['Dołączono do rozmowy', 'Kanał konsultanta jest teraz przypisany do Ciebie.'],
        'support-reply': ['Odpowiedź wysłana', 'Wiadomość trafiła do pracownika w kanale konsultanta.'],
        'support-close': ['Kanał zakończony', 'Rozmowa została zamknięta i zapisana w historii wsparcia.'],
        'help-send': ['Wiadomość wysłana', 'Bot ServiceOS analizuje pytanie.'],
        'support-request': ['Konsultant poproszony', 'Prośba trafiła do kolejki wsparcia LockOn.']
      };
      const message = messages[action] || ['Gotowe', 'Zmiana została zapisana w ServiceOS.'];
      showDemoToast(message[0], message[1]);
      if (action === 'create-order') {
        activateServiceDemoView('orders', true);
        activateIntakeStep('1');
      }
      if (action === 'advance-order') closeServiceOrderDrawer();
      if (action === 'pin-note') button.classList.toggle('active');
      modulePausedUntil = Date.now() + 16000;
    });
  });

  qsa('.notes-demo-layout>section>button').forEach((button) => {
    button.addEventListener('click', () => {
      qsa('.notes-demo-layout>section>button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      modulePausedUntil = Date.now() + 10000;
    });
  });

  qsa('[data-support-demo-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      qsa('[data-support-demo-ticket]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const key = button.dataset.supportDemoTicket || 'jan';
      const name = qs('[data-support-demo-name]');
      const state = qs('[data-support-demo-state]');
      const thread = qs('.support-demo-thread');
      if (key === 'anna') {
        if (name) name.textContent = 'Anna Lis';
        if (state) state.textContent = 'KONSULTANT DOŁĄCZYŁ';
        if (thread) thread.innerHTML = '<article><b>Anna</b><p>Po aktualizacji nie widzę jednego z przekazań.</p><small>21:29</small></article><article class="bot"><b>Konsultant</b><p>Sprawdzam historię punktu i status urządzenia. Daj mi chwilę.</p><small>21:30</small></article>';
      } else {
        if (name) name.textContent = 'Jan Nowak';
        if (state) state.textContent = 'CZEKA NA KONSULTANTA';
        if (thread) thread.innerHTML = '<article><b>Jan</b><p>Nie wiem, gdzie potwierdzić odbiór przekazanego urządzenia.</p><small>21:26</small></article><article class="bot"><b>Bot ServiceOS</b><p>To znajdziesz w Serwis → Przekazania. Jeżeli chcesz, konsultant może dołączyć.</p><small>21:27</small></article>';
      }
      modulePausedUntil = Date.now() + 12000;
    });
  });

  qsa('[data-theme-demo]').forEach((button) => {
    button.addEventListener('click', () => {
      qsa('[data-theme-demo]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const label = button.dataset.themeDemo === 'midnight' ? 'Midnight' : 'Carbon';
      showDemoToast('Motyw ' + label + ' wybrany', 'W ServiceOS zmiana wyglądu działa natychmiast.');
      modulePausedUntil = Date.now() + 12000;
    });
  });

  const liveDock = qs('[data-live-dock]');
  const liveDockToggle = qs('[data-live-dock-toggle]');
  const liveDockDismiss = qs('[data-live-dock-dismiss]');
  const liveDockReturn = qs('[data-live-dock-return]');
  const meetingsSection = qs('#meetings');
  let meetingSectionVisible = false;
  let meetingSectionSeen = false;
  let liveDockDismissed = false;

  const syncLiveDock = () => {
    if (!liveDock) return;
    const shouldShow = !liveDockDismissed && meetingSectionSeen && !meetingSectionVisible;
    liveDock.hidden = !shouldShow;
  };

  liveDockToggle?.addEventListener('click', () => {
    const expanded = liveDock?.classList.toggle('expanded') || false;
    liveDockToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
  liveDockDismiss?.addEventListener('click', () => {
    liveDockDismissed = true;
    if (liveDock) liveDock.hidden = true;
  });
  liveDockReturn?.addEventListener('click', () => {
    meetingsSection?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (liveDock) liveDock.classList.remove('expanded');
    liveDockToggle?.setAttribute('aria-expanded', 'false');
  });

  if ('IntersectionObserver' in window && meetingsSection) {
    const liveDockObserver = new IntersectionObserver((entries) => {
      meetingSectionVisible = entries.some((entry) => entry.isIntersecting);
      if (meetingSectionVisible) meetingSectionSeen = true;
      syncLiveDock();
    }, { threshold: .16 });
    liveDockObserver.observe(meetingsSection);
  }
  window.addEventListener('scroll', syncLiveDock, { passive: true });
  syncLiveDock();

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
      branch: 'Wszystkie punkty',
      copy: 'Pełny widok punktów, zespołu, administracji, klientów, wsparcia i rozliczeń.',
      status: 'Pełny zakres firmy',
      permissions: ['Wszystkie punkty', 'Zespół', 'Rozliczenia', 'Administracja'],
      nav: ['dashboard', 'browser', 'service', 'meetings', 'earnings', 'administration', 'customers', 'support', 'settings']
    },
    boss: {
      title: 'Szef / Koordynator',
      scope: 'Wszystkie punkty',
      branch: 'Wszystkie punkty',
      copy: 'Prowadzi pracę serwisu, spotkania i rozliczenia w zakresie zarządzanych punktów.',
      status: 'Zakres zarządczy',
      permissions: ['Wszystkie punkty', 'Serwis', 'Rozliczenia', 'Spotkania'],
      nav: ['dashboard', 'browser', 'service', 'meetings', 'earnings', 'settings']
    },
    tech: {
      title: 'Serwisant',
      scope: 'Nowogard',
      branch: 'Nowogard',
      copy: 'Dostaje kolejkę napraw, części, terminy oraz własne rozliczenia.',
      status: 'Praca techniczna',
      permissions: ['Zlecenia', 'Części', 'Terminy', 'Własne rozliczenia'],
      nav: ['dashboard', 'browser', 'service', 'meetings', 'earnings', 'settings']
    },
    front: {
      title: 'Obsługa',
      scope: 'Nowogard',
      branch: 'Nowogard',
      copy: 'Przyjmuje klienta, prowadzi kontakt, przekazania, dokumenty i odbiór.',
      status: 'Front desk',
      permissions: ['Klient', 'Przyjęcie', 'Przekazania', 'Odbiór'],
      nav: ['dashboard', 'browser', 'service', 'meetings', 'customers', 'settings']
    }
  };

  const roleViewLabels = {
    dashboard: 'Start',
    browser: 'Przeglądarka',
    service: 'Serwis',
    meetings: 'Spotkania i szkolenia',
    earnings: 'Rozliczenia',
    administration: 'Administracja',
    customers: 'Klienci',
    support: 'Wsparcie',
    settings: 'Ustawienia',
    help: 'Pomoc'
  };

  let activeRolePreview = 'owner';
  let activeRoleScreen = 'dashboard';

  const closeRoleAccountPopover = () => {
    const popover = qs('[data-role-account-popover]');
    if (popover) popover.hidden = true;
  };

  const activateRoleScreen = (key) => {
    const profile = roleProfiles[activeRolePreview];
    if (!profile) return;
    const allowed = key === 'help' || profile.nav.includes(key);
    if (!allowed) return;

    activeRoleScreen = key;
    qsa('[data-role-screen]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.roleScreen === key);
    });
    qsa('[data-role-nav-key]').forEach((button) => {
      const active = button.dataset.roleNavKey === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const helpButton = qs('[data-role-help]');
    if (helpButton) {
      const helpActive = key === 'help';
      helpButton.classList.toggle('active', helpActive);
      helpButton.setAttribute('aria-pressed', helpActive ? 'true' : 'false');
    }

    const currentView = qs('[data-role-current-view]');
    if (currentView) currentView.textContent = roleViewLabels[key] || 'ServiceOS';
    closeRoleAccountPopover();
  };

  const activateRolePreview = (key) => {
    const profile = roleProfiles[key];
    if (!profile) return;
    activeRolePreview = key;

    qsa('[data-role-preview]').forEach((button) => {
      const active = button.dataset.rolePreview === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const select = qs('[data-role-select]');
    if (select && select.value !== key) select.value = key;

    const title = qs('[data-role-title]');
    const copy = qs('[data-role-copy]');
    const scope = qs('[data-role-scope]');
    const branch = qs('[data-role-branch]');
    const status = qs('[data-role-status-copy]');
    if (title) title.textContent = profile.title;
    if (copy) copy.textContent = profile.copy;
    if (scope) scope.textContent = profile.scope;
    if (branch) branch.textContent = profile.branch;
    if (status) status.textContent = profile.status;

    const permissions = qs('[data-role-permissions]');
    if (permissions) permissions.innerHTML = profile.permissions.map((item) => '<i>' + item + '</i>').join('');

    qsa('[data-role-nav-key]').forEach((item) => {
      const navKey = item.dataset.roleNavKey || '';
      const visible = profile.nav.includes(navKey);
      item.classList.toggle('role-nav-hidden', !visible);
      item.hidden = !visible;
    });

    activateRoleScreen('dashboard');
  };

  qsa('[data-role-preview]').forEach((button) => {
    button.addEventListener('click', () => activateRolePreview(button.dataset.rolePreview || 'owner'));
  });

  const roleSelect = qs('[data-role-select]');
  roleSelect?.addEventListener('change', () => activateRolePreview(roleSelect.value || 'owner'));

  qsa('[data-role-nav-key]').forEach((button) => {
    button.addEventListener('click', () => activateRoleScreen(button.dataset.roleNavKey || 'dashboard'));
  });

  qs('[data-role-help]')?.addEventListener('click', () => activateRoleScreen('help'));

  qs('[data-role-account-action]')?.addEventListener('click', () => {
    const popover = qs('[data-role-account-popover]');
    if (!popover) return;
    popover.hidden = !popover.hidden;
  });
  qs('[data-role-account-close]')?.addEventListener('click', closeRoleAccountPopover);

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
