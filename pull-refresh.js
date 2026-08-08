(()=>{
  const THRESHOLD=72;
  let startY=0, pulling=false, distance=0, refreshing=false;
  const bar=document.createElement('div');
  bar.id='pullRefreshBar';
  bar.textContent='↓ Tira per aggiornare';
  Object.assign(bar.style,{position:'fixed',left:'50%',top:'calc(env(safe-area-inset-top) + 8px)',transform:'translate(-50%,-70px)',zIndex:'9999',padding:'8px 13px',borderRadius:'999px',background:'#243c33',color:'#fff',font:'700 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',boxShadow:'0 6px 18px rgba(0,0,0,.14)',transition:'transform .18s ease,opacity .18s ease',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(bar);

  const stamp=document.getElementById('status');
  if(stamp){stamp.textContent='Dati: —';}

  function fmtAge(ms){
    const m=Math.max(0,Math.round(ms/60000));
    if(m<2)return 'adesso';
    if(m<60)return `${m} min fa`;
    const h=Math.floor(m/60), r=m%60;
    return r?`${h}h ${r}m fa`:`${h}h fa`;
  }
  async function updateStamp(){
    try{
      const r=await fetch('portfolio.json?stamp='+Date.now(),{cache:'no-store'});
      const d=await r.json();
      const t=new Date(d.asOf);
      if(isNaN(t))throw new Error('bad date');
      const age=Date.now()-t.getTime();
      const hh=t.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      if(stamp){
        stamp.textContent=`Dati ${hh} · ${fmtAge(age)}`;
        const staleAge=age>60*60*1000;
        stamp.style.background=staleAge?'#eadde0':'#dfe8e2';
        stamp.style.color=staleAge?'#7b3f4a':'#2f6652';
      }
      const cov=document.getElementById('coverage');
      if(cov){
        const valued=d.valuedCount ?? d.verifiedCount ?? 0;
        const total=(d.positions||[]).length;
        const stale=d.staleCount||0;
        cov.textContent=`${valued}/${total}${stale?` · ${stale} stale`:''}`;
      }
    }catch(e){
      if(stamp){stamp.textContent='Dati non verificati';stamp.style.background='#eadde0';stamp.style.color='#7b3f4a';}
    }
  }

  function show(y){
    const dy=Math.min(110,Math.max(0,y));
    bar.style.opacity=String(Math.min(1,dy/24));
    bar.style.transform=`translate(-50%,${Math.min(20,dy-52)}px)`;
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
        fetch('fineco_sync.json?refresh='+Date.now(),{cache:'no-store'}),
        fetch('trade_ideas.json?refresh='+Date.now(),{cache:'no-store'})
      ]);
    }catch(e){}
    location.reload();
  }

  addEventListener('touchstart',e=>{
    if(refreshing||window.scrollY>1||!e.touches?.length)return;
    startY=e.touches[0].clientY;distance=0;pulling=true;
  },{passive:true});

  addEventListener('touchmove',e=>{
    if(!pulling||!e.touches?.length)return;
    distance=e.touches[0].clientY-startY;
    if(distance<=0){pulling=false;hide();return;}
    if(window.scrollY<=1){
      e.preventDefault();
      show(distance);
    }
  },{passive:false});

  addEventListener('touchend',()=>{
    if(!pulling)return;
    pulling=false;
    if(distance>=THRESHOLD)refresh();else hide();
  },{passive:true});

  addEventListener('touchcancel',()=>{pulling=false;hide();},{passive:true});

  updateStamp();
  setInterval(updateStamp,60000);

  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg=>reg?.update()).catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!sessionStorage.getItem('pc_sw_reloaded')){
        sessionStorage.setItem('pc_sw_reloaded','1');location.reload();
      }
    });
  }
})();
