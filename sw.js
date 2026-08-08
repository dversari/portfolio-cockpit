const CACHE='portfolio-cockpit-v8';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./pull-refresh.js','./rumor-radar.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));

async function injectExtras(response){
  try{
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    let text=await response.text();
    if(!text.includes('pull-refresh.js')) text=text.replace('</body>','<script src="pull-refresh.js?v=8"></script></body>');
    if(!text.includes('rumor-radar.js')) text=text.replace('</body>','<script src="rumor-radar.js?v=8"></script></body>');
    const headers=new Headers(response.headers);headers.set('cache-control','no-store');
    return new Response(text,{status:response.status,statusText:response.statusText,headers});
  }catch(e){return response;}
}

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const net=await fetch(e.request,{cache:'no-store'});
        const copy=net.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});
        return injectExtras(net);
      }catch(err){
        const cached=await caches.match('./index.html')||await caches.match(e.request);
        return cached?injectExtras(cached):Response.error();
      }
    })());
    return;
  }
  if(u.pathname.endsWith('/portfolio.json')||u.pathname.endsWith('/fineco_sync.json')||u.pathname.endsWith('/trade_ideas.json')||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/rumor-radar.js')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
