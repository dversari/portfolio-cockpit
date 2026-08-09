// Buy-the-dip reserve: free Fineco cash + XEON/overnight ETF.
// Tranches: 10/20/30/40% of the total reserve at -10/-15/-20/-25% drawdown.
(function(){
  const fmt=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);

  function getData(){
    try{return typeof DATA!=='undefined' ? DATA : null}catch(e){return null}
  }
  function getSync(){
    try{return typeof SYNC!=='undefined' ? SYNC : null}catch(e){return null}
  }
  function xeonValue(d){
    if(!d || !Array.isArray(d.positions)) return 0;
    const p=d.positions.find(p=>String(p.symbol||'').toUpperCase()==='XEON.MI' || /XEON|OVERNIGHT RATE/i.test(String(p.name||'')));
    return p ? Number(p.valueEUR||0) : 0;
  }
  function apply(){
    const d=getData(), s=getSync();
    if(!d || !s) return false;

    const cash=Number(s.cashAvailable||0);
    const xeon=xeonValue(d);
    const reserve=cash+xeon;
    if(!reserve) return false;

    const cashEl=document.getElementById('cash');
    if(cashEl){
      cashEl.textContent=fmt(reserve);
      const note=cashEl.parentElement?.querySelector('.note');
      if(note) note.innerHTML=`Riserva totale: <b>${fmt(cash)}</b> cash immediato + <b>${fmt(xeon)}</b> XEON liquidabile.`;
    }

    [['d10',.10],['d15',.20],['d20',.30],['d25',.40]].forEach(([id,w])=>{
      const el=document.getElementById(id);
      if(el) el.textContent=fmt(reserve*w);
    });

    const msg=document.getElementById('dipmsg');
    if(msg){
      const dd=d.benchmark?.drawdown;
      const ddText=dd==null?'':` Drawdown MSCI World attuale ${(dd*100).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}%.`;
      msg.innerHTML=`Riserva Buy the Dip <b>${fmt(reserve)}</b>: cash ${fmt(cash)} + XEON ${fmt(xeon)}.${ddText}<br><span class="source">Tranche: 10% a −10%, 20% a −15%, 30% a −20%, 40% a −25%. XEON va venduto prima dell'impiego.</span>`;
    }
    return true;
  }

  let n=0;
  const timer=setInterval(()=>{n++; if(apply()||n>60) clearInterval(timer)},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(apply,200)});
  window.addEventListener('pageshow',()=>setTimeout(apply,200));
})();