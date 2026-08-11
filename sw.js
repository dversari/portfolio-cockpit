const CACHE='portfolio-cockpit-v19';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./pull-refresh.js','./rumor-radar.js','./fx-history.js','./analytics-panel.js','./fineco-import.js','./ai-chat.js','./central-mode.js','./chart-dates.js','./movements-panel.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));

async function injectExtras(response){
  try{
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    let text=await response.text();
    if(!text.includes('pull-refresh.js')) text=text.replace('</body>','<script src="pull-refresh.js?v=19"></script></body>');
    if(!text.includes('rumor-radar.js')) text=text.replace('</body>','<script src="rumor-radar.js?v=19"></script></body>');
    if(!text.includes('fx-history.js')) text=text.replace('</body>','<script src="fx-history.js?v=19"></script></body>');
    if(!text.includes('analytics-panel.js')) text=text.replace('</body>','<script src="analytics-panel.js?v=19"></script></body>');
    if(!text.includes('fineco-import.js')) text=text.replace('</body>','<script src="fineco-import.js?v=19"></script></body>');
    if(!text.includes('ai-chat.js')) text=text.replace('</body>','<script src="ai-chat.js?v=19"></script></body>');
    if(!text.includes('central-mode.js')) text=text.replace('</body>','<script src="central-mode.js?v=19"></script></body>');
    if(!text.includes('chart-dates.js')) text=text.replace('</body>','<script src="chart-dates.js?v=19"></script></body>');
    if(!text.includes('movements-panel.js')) text=text.replace('</body>','<script src="movements-panel.js?v=19"></script></body>');
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
  if(u.pathname.endsWith('/portfolio.json')||u.pathname.endsWith('/fineco_sync.json')||u.pathname.endsWith('/trade_ideas.json')||u.pathname.endsWith('/analytics.json')||u.pathname.endsWith('/movements.json')||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/rumor-radar.js')||u.pathname.endsWith('/fx-history.js')||u.pathname.endsWith('/pull-refresh.js')||u.pathname.endsWith('/analytics-panel.js')||u.pathname.endsWith('/fineco-import.js')||u.pathname.endsWith('/ai-chat.js')||u.pathname.endsWith('/central-mode.js')||u.pathname.endsWith('/chart-dates.js')||u.pathname.endsWith('/movements-panel.js')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
