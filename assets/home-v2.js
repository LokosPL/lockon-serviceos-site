(() => {
  document.querySelectorAll('[data-open-login]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById('navLoginButton')?.click());
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => undefined), { once: true });
  }
})();