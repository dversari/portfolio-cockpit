(() => {
  const eur = n => new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(Number(n)||0);
  const pct = n => new Intl.NumberFormat('it-IT', {style:'percent', minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(n)||0);
  let applying=false, sync=null, portfolio=null;
  function setText(id,value){const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;}
  function ensureReconCard(){
    const valueEl=document.getElementById('value');
    const card=valueEl?.closest('.card');
    if(!card)return null;
    let el=document.getElementById('liveRecon');
    if(!el){el=document.createElement('div');el.id='liveRecon';el.className='sub';el.style.marginTop='5px';card.appendChild(el)}
    return el;
  }
  function applyCentral(){
    if(!sync||!portfolio||applying)return;
    applying=true;
    try{
      const invested=Number(portfolio.liveValue??portfolio.verifiedValue??sync.portfolioFineco??0);
      const cash=Number(sync.cashAvailable??0);
      const xeonPos=(portfolio.positions||[]).find(p=>String(p.name||'').includes('Overnight Rate Swap'));
      const xeon=Number(xeonPos?.valueEUR??sync.xeonMonetary??0);
      const reserve=cash+xeon;
      const patrimony=invested+cash;
      const cost=Number(portfolio.totalCost??sync.totalCost??0);
      const pl=invested-cost;
      const plPct=cost?pl/cost:0;
      const positions=(portfolio.positions||[]).length;
      const covered=Number(portfolio.valuedCount??portfolio.verifiedCount??0);
      setText('patrimony',eur(patrimony));
      setText('heroInvested',eur(invested));
      setText('heroCash',eur(cash));
      setText('coverage',`${covered}/${positions}`);
      setText('cash',eur(reserve));
      setText('value',eur(invested));
      setText('pl',eur(pl));
      setText('plpct',pct(plPct));
      setText('xeon',eur(xeon));
      setText('posCount',`${positions} strumenti`);
      [['d10',.10],['d15',.20],['d20',.30],['d25',.40]].forEach(([id,w])=>setText(id,eur(reserve*w)));
      const cashEl=document.getElementById('cash');
      const note=cashEl?.parentElement?.querySelector('.note');
      if(note)note.innerHTML=`Riserva totale: <b>${eur(cash)}</b> cash immediato + <b>${eur(xeon)}</b> XEON liquidabile.`;
      const pe=document.getElementById('pl');if(pe)pe.className='v '+(pl>=0?'pos':'neg');
      const updated=portfolio.asOf||sync.asOf;if(updated)setText('updated',new Date(updated).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));

      // Fineco is a reconciliation snapshot, never the primary live valuation.
      const fineco=Number(sync.portfolioFineco??0);
      const recon=ensureReconCard();
      if(recon&&fineco){
        const delta=invested-fineco, dp=fineco?delta/fineco:0;
        const snap=sync.asOf?new Date(sync.asOf).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
        recon.textContent=`Fineco ${eur(fineco)}${snap?' · '+snap:''} · scost. ${delta>=0?'+':''}${eur(delta)} (${delta>=0?'+':''}${pct(dp)})`;
        recon.className='sub '+(Math.abs(dp)<=0.002?'pos':Math.abs(dp)<=0.005?'warn':'neg');
      }

      const sub=document.querySelector('.head .sub');
      if(sub)sub.textContent='Cockpit personale · Fineco + quotazioni automatiche (snapshot ~15 min)';
      const launchHint=document.querySelector('.pc-ai-launch .hint');if(launchHint)launchHint.textContent='Chat portafoglio · dati centralizzati';
      const importButton=document.getElementById('pcAiImport');if(importButton)importButton.style.display='none';
      const importInput=document.getElementById('pcAiFile');if(importInput)importInput.remove();
    }finally{applying=false;}
  }
  async function boot(){
    for(const key of ['pc_fineco_portfolio_override_v1','pc_fineco_movements_v1','pc_fineco_import_meta_v1']){try{localStorage.removeItem(key)}catch(_){}}
    try{
      const [rs,rp]=await Promise.all([
        fetch('fineco_sync.json?central='+Date.now(),{cache:'no-store'}),
        fetch('portfolio.json?central='+Date.now(),{cache:'no-store'})
      ]);
      if(!rs.ok||!rp.ok)return;
      sync=await rs.json();portfolio=await rp.json();applyCentral();
      const observer=new MutationObserver(()=>applyCentral());
      for(const id of ['patrimony','heroInvested','heroCash','coverage','cash','value','pl','plpct','xeon','updated','posCount','d10','d15','d20','d25']){const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,characterData:true,subtree:true});}
      setTimeout(applyCentral,300);setTimeout(applyCentral,1200);setTimeout(applyCentral,3000);
    }catch(e){console.warn('Central mode:',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
