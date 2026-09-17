(() => {
  const nav = document.querySelector('.nav');
  const glow = document.querySelector('.cursor-glow');
  const tilt = document.querySelector('.tilt-card');

  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 18);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      if (glow) {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
      }
    });

    if (tilt) {
      tilt.addEventListener('pointermove', (e) => {
        const r = tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        tilt.style.transform = `rotateY(${-6 + x * 5}deg) rotateX(${2 - y * 4}deg) translateY(-2px)`;
      });
      tilt.addEventListener('pointerleave', () => {
        tilt.style.transform = 'rotateY(-6deg) rotateX(2deg)';
      });
    }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();