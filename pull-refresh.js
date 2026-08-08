(()=>{
  const THRESHOLD=72;
  let startY=0, pulling=false, distance=0, refreshing=false;
  const bar=document.createElement('div');
  bar.id='pullRefreshBar';
  bar.textContent='↓ Tira per aggiornare';
  Object.assign(bar.style,{position:'fixed',left:'50%',top:'calc(env(safe-area-inset-top) + 8px)',transform:'translate(-50%,-70px)',zIndex:'9999',padding:'8px 13px',borderRadius:'999px',background:'#243c33',color:'#fff',font:'700 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',boxShadow:'0 6px 18px rgba(0,0,0,.14)',transition:'transform .18s ease,opacity .18s ease',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(bar);

  function show(y){
    const dy=Math.min(95,Math.max(0,y));
    bar.style.opacity=String(Math.min(1,dy/28));
    bar.style.transform=`translate(-50%,${Math.min(18,dy-55)}px)`;
    bar.textContent=dy>=THRESHOLD?'↻ Rilascia per aggiornare':'↓ Tira per aggiornare';
  }
  function hide(){bar.style.opacity='0';bar.style.transform='translate(-50%,-70px)';}
  async function refresh(){
    if(refreshing)return; refreshing=true;
    bar.style.opacity='1';bar.style.transform='translate(-50%,8px)';bar.textContent='↻ Aggiorno…';
    try{
      if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}
      await Promise.allSettled([
        fetch('portfolio.json?refresh='+Date.now(),{cache:'no-store'}),
        fetch('fineco_sync.json?refresh='+Date.now(),{cache:'no-store'})
      ]);
    }catch(e){}
    location.reload();
  }

  addEventListener('touchstart',e=>{
    if(refreshing||window.scrollY>0||!e.touches?.length)return;
    startY=e.touches[0].clientY;distance=0;pulling=true;
  },{passive:true});
  addEventListener('touchmove',e=>{
    if(!pulling||!e.touches?.length)return;
    distance=e.touches[0].clientY-startY;
    if(distance<0){pulling=false;hide();return;}
    show(distance);
  },{passive:true});
  addEventListener('touchend',()=>{
    if(!pulling)return;pulling=false;
    if(distance>=THRESHOLD)refresh();else hide();
  },{passive:true});

  // Check for a newer service worker every time the Home-screen app opens.
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg=>reg?.update()).catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!sessionStorage.getItem('pc_sw_reloaded')){
        sessionStorage.setItem('pc_sw_reloaded','1');location.reload();
      }
    });
  }
})();
