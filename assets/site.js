(() => {
  const body = document.body;
  const nav = document.querySelector('.nav');
  const glow = document.querySelector('.cursor-glow');
  const loader = document.getElementById('siteLoader');
  const progress = document.getElementById('loaderProgress');
  const percent = document.getElementById('loaderPercent');
  const label = document.getElementById('loaderLabel');
  const started = performance.now();

  let p = 8;
  const tick = setInterval(() => {
    p = Math.min(88, p + Math.max(1, Math.round((90 - p) * .1)));
    if (progress) progress.style.width = p + '%';
    if (percent) percent.textContent = p + '%';
    if (label) {
      if (p > 68) label.textContent = 'Łączenie z najnowszym wydaniem…';
      else if (p > 38) label.textContent = 'Przygotowanie interfejsu…';
    }
  }, 90);

  const finishLoader = () => {
    clearInterval(tick);
    const wait = Math.max(0, 850 - (performance.now() - started));
    setTimeout(() => {
      if (progress) progress.style.width = '100%';
      if (percent) percent.textContent = '100%';
      if (label) label.textContent = 'Gotowe.';
      setTimeout(() => body.classList.add('loaded'), 220);
    }, wait);
  };

  if (document.readyState === 'complete') finishLoader();
  else window.addEventListener('load', finishLoader, { once: true });

  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 16);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      if (glow) {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
      }
    });
    const card = document.querySelector('.mini-app');
    const host = document.querySelector('.hero-device');
    host?.addEventListener('pointermove', (e) => {
      if (!card) return;
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'rotateY(' + (-6 + x * 4.5) + 'deg) rotateX(' + (2 - y * 3.5) + 'deg) translateY(-2px)';
    });
    host?.addEventListener('pointerleave', () => {
      if (card) card.style.transform = 'rotateY(-6deg) rotateX(2deg)';
    });
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .1, rootMargin: '0px 0px -35px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  const showDemo = (target) => {
    const preview = document.querySelector('.app-preview');
    const beforeTop = preview?.getBoundingClientRect().top;
    document.querySelectorAll('.demo-nav').forEach(btn => btn.classList.toggle('active', btn.dataset.demoTarget === target));
    document.querySelectorAll('.demo-screen').forEach(screen => screen.classList.toggle('active', screen.dataset.demoScreen === target));
    window.requestAnimationFrame(() => {
      if (!preview || beforeTop == null) return;
      const afterTop = preview.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
    });
  };
  document.querySelectorAll('.demo-nav').forEach(btn => btn.addEventListener('click', (event) => {
    event.preventDefault();
    showDemo(btn.dataset.demoTarget);
  }));
  document.querySelectorAll('[data-demo-jump]').forEach(btn => btn.addEventListener('click', (event) => {
    event.preventDefault();
    showDemo(btn.dataset.demoJump);
  }));

  const formatBytes = (bytes) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '—';
    const mb = value / 1024 / 1024;
    return mb >= 10 ? mb.toFixed(0) + ' MB' : mb.toFixed(1) + ' MB';
  };

  const normalizeDigest = (value) => String(value || '').replace(/^sha256:/i, '').trim().toLowerCase();

  const applyRelease = (release) => {
    const version = release?.tag_name || '';
    const clean = version ? version.replace(/^v/i, '') : '';
    if (clean) document.querySelectorAll('[data-release-version]').forEach(el => el.textContent = 'v' + clean);

    const asset = release?.assets?.find(item => item.name === 'LockOn-ServiceOS-Setup.exe');
    if (asset?.browser_download_url) {
      document.querySelectorAll('.download-link').forEach(el => {
        el.dataset.downloadUrl = asset.browser_download_url;
        let accepted = true;
        if (el.hasAttribute('data-requires-onboarding')) {
          try { accepted = localStorage.getItem('lockon.employee.onboarding.v1') === 'accepted'; }
          catch { accepted = false; }
        }
        el.href = accepted ? asset.browser_download_url : '#start';
      });
    }

    const digest = normalizeDigest(asset?.digest);
    document.querySelectorAll('[data-release-digest]').forEach(el => {
      el.textContent = digest || 'dostępny w GitHub Release';
      if (digest) el.setAttribute('title', digest);
    });
    document.querySelectorAll('[data-release-size]').forEach(el => {
      el.textContent = asset ? 'LockOn-ServiceOS-Setup.exe · ' + formatBytes(asset.size) : 'LockOn-ServiceOS-Setup.exe';
    });

    if (release?.html_url) document.querySelectorAll('.release-link').forEach(el => el.href = release.html_url);
  };

  const releaseController = new AbortController();
  const releaseTimeout = setTimeout(() => releaseController.abort(), 5000);

  fetch('https://api.github.com/repos/LokosPL/LockOn-Hub/releases/latest', {
    headers: { 'Accept': 'application/vnd.github+json' },
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: releaseController.signal
  }).then(r => r.ok ? r.json() : Promise.reject(new Error('release metadata unavailable')))
    .then(applyRelease)
    .catch(() => {
      document.querySelectorAll('[data-release-version]').forEach(el => {
        if (!el.textContent.trim() || el.textContent.trim() === '—') el.textContent = 'najnowsza';
      });
      document.querySelectorAll('[data-release-digest]').forEach(el => el.textContent = 'sprawdź w GitHub Release');
      document.querySelectorAll('[data-release-size]').forEach(el => el.textContent = 'LockOn-ServiceOS-Setup.exe');
    })
    .finally(() => clearTimeout(releaseTimeout));

  document.querySelectorAll('[data-copy-digest]').forEach(button => {
    button.addEventListener('click', async () => {
      const target = document.querySelector('[data-release-digest]');
      const digest = normalizeDigest(target?.textContent);
      if (!/^[a-f0-9]{64}$/.test(digest)) return;
      try {
        await navigator.clipboard.writeText(digest);
        const original = button.textContent;
        button.textContent = 'Skopiowano';
        setTimeout(() => { button.textContent = original; }, 1400);
      } catch {
        button.textContent = 'Zaznacz hash';
      }
    });
  });
})();