// Buy-the-dip reserve: free cash + XEON/overnight ETF.
// Four cumulative drawdown triggers use 10/20/30/40% of the total reserve.
(function(){
  const fmt=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
  function xeonValue(){
    if(!window.DATA || !Array.isArray(DATA.positions)) return 0;
    const p=DATA.positions.find(p=>String(p.symbol||'').toUpperCase()==='XEON.MI' || /XEON|OVERNIGHT RATE/i.test(String(p.name||'')));
    return p ? Number(p.valueEUR||0) : 0;
  }
  function apply(){
    if(!window.DATA) return false;
    const cash=Number(DATA.cash||DATA.cashEUR||DATA.liquidity||0);
    const xeon=xeonValue();
    const reserve=cash+xeon;
    if(!reserve) return false;

    const cashEl=document.getElementById('cash');
    if(cashEl){
      cashEl.textContent=fmt(reserve);
      const note=cashEl.parentElement && cashEl.parentElement.querySelector('.note');
      if(note) note.innerHTML=`Riserva totale: <b>${fmt(cash)}</b> cash immediato + <b>${fmt(xeon)}</b> XEON liquidabile.`;
    }

    const tranches=[['d10',.10],['d15',.20],['d20',.30],['d25',.40]];
    tranches.forEach(([id,w])=>{
      const el=document.getElementById(id);
      if(el) el.textContent=fmt(reserve*w);
    });
    const msg=document.getElementById('dipmsg');
    if(msg){
      const existing=msg.textContent||'';
      const dd=(DATA.worldDrawdown!=null)?Number(DATA.worldDrawdown):null;
      msg.innerHTML=`Riserva Buy the Dip <b>${fmt(reserve)}</b>: cash ${fmt(cash)} + XEON ${fmt(xeon)}. Tranche progressive 10% / 20% / 30% / 40% ai drawdown −10% / −15% / −20% / −25%. XEON richiede vendita prima dell'impiego.` + (existing && !/Riserva Buy the Dip/.test(existing) ? `<br><span class="source">${existing}</span>` : '');
    }
    return true;
  }
  let n=0;
  const t=setInterval(()=>{n++; if(apply()||n>30) clearInterval(t)},300);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(apply,250)});
  window.addEventListener('pageshow',()=>setTimeout(apply,250));
})();