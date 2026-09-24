const CACHE='serviceos-shell-v38';
const SHELL=[
  '/','/index.html','/panel.html','/klient.html','/track.html','/privacy.html','/terms.html','/signing.html',
  '/assets/logo.svg',
  '/assets/serviceos-site.css','/assets/serviceos-app-site.css','/assets/serviceos-app-site.js',
  '/assets/ui-2026.css','/assets/ui-2026.js','/assets/web-polish.css','/assets/mobile-final.css',
  '/assets/panel.css','/assets/panel.js','/assets/google-config.js','/assets/google-auth.js',
  '/assets/track.css','/assets/track.js','/assets/customer-portal.css','/assets/customer-portal.js',
  '/assets/release-1.0.11.css','/assets/styles.css','/assets/site.js'
];

self.addEventListener('install',(event)=>{
  event.waitUntil(
    caches.open(CACHE)
      .then((cache)=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  if(
    url.pathname==='/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg')
  ){
    event.respondWith(
      fetch(request)
        .then((response)=>{
          if(response.ok){
            const copy=response.clone();
            caches.open(CACHE).then((cache)=>cache.put(request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(request))
    );
  }
});
