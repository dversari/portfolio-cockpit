(()=>{
 const euro=n=>n==null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
 const pct=n=>n==null?'—':new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:2}).format(Number(n)||0);
 const fnum=n=>n==null?'—':new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(Number(n)||0);
 const metric=(label,value,sub='')=>`<div class="metricline"><span>${label}${sub?`<br><span class="source">${sub}</span>`:''}</span><b>${value}</b></div>`;
 const miniBar=(label,v)=>{const w=Math.max(0,Math.min(100,(Number(v)||0)*100));return `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:10px;font-size:12px"><span>${label}</span><b>${pct(v)}</b></div><div style="height:8px;background:#ece8e1;border-radius:99px;overflow:hidden;margin-top:5px"><div style="height:100%;width:${w}%;background:var(--green2)"></div></div></div>`};
 async function loadAnalysis(){
   const host=document.getElementById('analysis'); if(!host) return;
   try{
     const [ra,rp,rs]=await Promise.all([
       fetch('analytics.json?'+Date.now(),{cache:'no-store'}),
       fetch('portfolio.json?'+Date.now(),{cache:'no-store'}),
       fetch('fineco_sync.json?'+Date.now(),{cache:'no-store'})
     ]);
     if(!ra.ok||!rp.ok||!rs.ok) throw new Error('data');
     const [a,p,s]=await Promise.all([ra.json(),rp.json(),rs.json()]);
     const at=a.attribution||{}, b=a.benchmark||{}, cb=a.compositeBenchmark||{}, pr=a.periodReturns||{}, risk=a.risk||{}, con=a.concentration||{}, cur=a.currencyExposure||{}, dq=a.dataQuality||{}, inc=a.income||{}, ev=a.events||{};
     const val=p.liveValue||p.verifiedValue||0, cash=s.cashAvailable||0;
     const xeon=p.positions?.find(x=>String(x.name||'').includes('Overnight Rate Swap'))?.valueEUR||0;
     const currencies=Object.entries(cur.effective||{}).map(([k,v])=>miniBar(k,v)).join('');
     const stale=(dq.stale||[]).map(x=>metric(x.name,euro(x.valueEUR),x.ageHours==null?'ultimo prezzo valido':`${fnum(x.ageHours)} h fa`)).join('');
     const period=[['Oggi',pr.today],['1 sett.',pr['1w']],['1 mese',pr['1m']],['YTD',pr.ytd],['1 anno',pr['1y']],['Da inizio',pr.sinceStart]].map(([l,v])=>`<div class="card"><div class="k">${l}</div><div class="v ${v!=null?(v>=0?'pos':'neg'):''}">${pct(v)}</div></div>`).join('');
     host.innerHTML=`
       <div class="sectionTitle"><h2>Analisi</h2><span>concentrazione · rischio · valuta</span></div>
       <div class="card">${metric('Top 5 concentrazione',pct(con.top5))}${metric('Liquidità libera Fineco',euro(cash))}${metric('XEON monetario',euro(xeon))}${metric('Riserva cash + XEON',euro(cash+xeon))}${metric('Posizione maggiore',con.largest?`${con.largest.name} · ${pct(con.largest.weight)}`:'—')}</div>
       <div class="card" style="margin-top:10px"><div class="k">Lettura della liquidità</div><div class="note" style="margin-top:7px">La liquidità libera Fineco è immediatamente disponibile. XEON è molto liquido, ma resta un ETF e va venduto prima dell'uso.</div></div>

       <div class="sectionTitle"><h2>Performance attribution</h2><span>mercato · cambio · reddito · flussi</span></div>
       <div class="grid"><div class="card accentGreen"><div class="k">Effetto mercato</div><div class="v ${at.marketEUR!=null?(at.marketEUR>=0?'pos':'neg'):''}">${euro(at.marketEUR)}</div><div class="source">a cambi costanti</div></div><div class="card accentBurg"><div class="k">Effetto cambio</div><div class="v ${at.fxEUR!=null?(at.fxEUR>=0?'pos':'neg'):''}">${euro(at.fxEUR)}</div></div><div class="card"><div class="k">Cedole/dividendi</div><div class="v">${euro(at.incomeEUR)}</div><div class="source">${inc.status||''}</div></div><div class="card"><div class="k">Versamenti/prelievi</div><div class="v">${euro(at.externalFlowsEUR)}</div><div class="source">Movimenti Fineco</div></div></div>
       <div class="note" style="margin:8px 2px">${at.status||''}</div>

       <div class="sectionTitle"><h2>Benchmark</h2><span>ATH + confronto composito</span></div>
       <div class="twocol"><div class="card">${metric('MSCI World drawdown da ATH',pct(b.drawdownATH),b.athDate?`ATH ${b.athDate}`:'')}${metric('Giorni dal massimo',b.daysSinceATH==null?'—':b.daysSinceATH)}${metric('MSCI World 1 mese',pct(b.returns?.['1m']))}${metric('MSCI World YTD',pct(b.returns?.ytd))}</div><div class="card">${metric('Composito 1 mese',pct(cb.returns?.['1m']))}${metric('Composito YTD',pct(cb.returns?.ytd))}${metric('Composito 1 anno',pct(cb.returns?.['1y']))}<div class="source" style="margin-top:8px">Proxy dinamico pesato come il portafoglio attuale.</div></div></div>

       <div class="sectionTitle"><h2>Rendimento per periodo</h2><span>TWR quando i flussi saranno completi</span></div><div class="grid">${period}</div><div class="card" style="margin-top:10px">${metric('TWR',pct(pr.twr),pr.twrStatus||'')}</div>

       <div class="sectionTitle"><h2>Rischio essenziale</h2><span>si attiva con più storico</span></div>
       <div class="twocol"><div class="card">${metric('Volatilità 30 gg',pct(risk.vol30))}${metric('Volatilità 90 gg',pct(risk.vol90))}${metric('Beta vs MSCI World',risk.betaWorld==null?'—':fnum(risk.betaWorld))}${metric('VaR 95% 1 giorno',pct(risk.var95_1d))}<div class="source">${risk.status||''}</div></div><div class="card">${metric('Top 5',pct(con.top5))}${metric('Top 10',pct(con.top10))}${metric('Valore titoli',euro(val))}</div></div>

       <div class="sectionTitle"><h2>Esposizione valutaria effettiva</h2><span>look-through ETF</span></div>
       <div class="card">${currencies||'<div class="note">Dati non disponibili.</div>'}<div class="source" style="margin-top:10px">Copertura look-through: ${pct(cur.lookThroughCoverage)}. ${cur.lookThroughStatus||''}</div></div>

       <div class="sectionTitle"><h2>Income & prossimi eventi</h2><span>da Movimenti Fineco</span></div>
       <div class="twocol"><div class="card">${metric('Incassato YTD',euro(inc.ytd))}${metric('Stima prossimi 12 mesi',euro(inc.next12m))}<div class="source">${inc.status||''}</div></div><div class="card"><div class="k">Prossimi eventi</div>${(ev.items||[]).length?(ev.items||[]).map(x=>metric(x.title||x.type,x.date||'—')).join(''):`<div class="note" style="margin-top:8px">${ev.status||'Nessun evento disponibile.'}</div>`}</div></div>

       <div class="sectionTitle"><h2>Qualità dati</h2><span>freschezza quotazioni</span></div>
       <div class="card">${metric('Prezzi freschi',`${dq.freshPositions??'—'}/${dq.totalPositions??'—'}`)}${metric('Patrimonio con prezzo fresco',pct(dq.freshValuePct))}${metric('Patrimonio stale',pct(dq.staleValuePct))}${stale?`<div style="margin-top:8px;border-top:1px solid var(--line)">${stale}</div>`:''}</div>
       <div style="height:18px"></div>`;
     host.style.overflow='visible'; host.style.maxHeight='none';
   }catch(e){
     console.error('analysis render',e);
     host.innerHTML='<div class="sectionTitle"><h2>Analisi</h2></div><div class="card"><div class="note">Errore nel caricamento dell’analisi. Riprova con un aggiornamento.</div></div>';
   }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadAnalysis);else loadAnalysis();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadAnalysis()});
})();