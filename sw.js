const CACHE='portfolio-cockpit-v5';
const ASSETS=['./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  const isLive=e.request.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/portfolio.json')||u.pathname.endsWith('/fineco_sync.json');
  if(isLive){
    e.respondWith(fetch(new Request(e.request,{cache:'no-store'})).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return resp;
  })));
});