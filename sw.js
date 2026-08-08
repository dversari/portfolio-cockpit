const CACHE='portfolio-cockpit-v6';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./pull-refresh.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));

async function injectPullRefresh(response){
  try{
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    let text=await response.text();
    if(!text.includes('pull-refresh.js')) text=text.replace('</body>','<script src="pull-refresh.js?v=6"></script></body>');
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
        return injectPullRefresh(net);
      }catch(err){
        const cached=await caches.match('./index.html')||await caches.match(e.request);
        return cached?injectPullRefresh(cached):Response.error();
      }
    })());
    return;
  }
  if(u.pathname.endsWith('/portfolio.json')||u.pathname.endsWith('/fineco_sync.json')||u.pathname.endsWith('/index.html')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
