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
    document.querySelectorAll('.demo-nav').forEach(btn => btn.classList.toggle('active', btn.dataset.demoTarget === target));
    document.querySelectorAll('.demo-screen').forEach(screen => screen.classList.toggle('active', screen.dataset.demoScreen === target));
  };
  document.querySelectorAll('.demo-nav').forEach(btn => btn.addEventListener('click', () => showDemo(btn.dataset.demoTarget)));
  document.querySelectorAll('[data-demo-jump]').forEach(btn => btn.addEventListener('click', () => showDemo(btn.dataset.demoJump)));

  const applyRelease = (release) => {
    const version = release?.tag_name || '';
    const clean = version ? version.replace(/^v/i, '') : '';
    if (clean) document.querySelectorAll('[data-release-version]').forEach(el => el.textContent = 'v' + clean);

    const asset = release?.assets?.find(item => item.name === 'LockOn-ServiceOS-Setup.exe');
    if (asset?.browser_download_url) {
      document.querySelectorAll('.download-link').forEach(el => el.href = asset.browser_download_url);
    }
    if (release?.html_url) document.querySelectorAll('.release-link').forEach(el => el.href = release.html_url);
  };

  fetch('https://api.github.com/repos/LokosPL/LockOn-Hub/releases/latest', {
    headers: { 'Accept': 'application/vnd.github+json' }
  }).then(r => r.ok ? r.json() : Promise.reject()).then(applyRelease).catch(() => {
    document.querySelectorAll('[data-release-version]').forEach(el => {
      if (!el.textContent.trim() || el.textContent.trim() === '—') el.textContent = 'najnowsza';
    });
  });
})();