const CACHE='serviceos-shell-v9';
const SHELL=['/','/index.html','/panel.html','/assets/logo.svg','/assets/home-v2.css','/assets/home-v2.js','/assets/panel.css','/assets/panel.js','/assets/google-config.js','/assets/google-auth.js','/track.html','/assets/track.css','/assets/track.js'];
self.addEventListener('install',(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.endsWith('.html')||url.pathname==='/'||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('.svg')){
    event.respondWith(fetch(request).then((response)=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then((cache)=>cache.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request)));
  }
});