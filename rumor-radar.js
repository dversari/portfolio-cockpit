(()=>{
  const pct=v=>v==null?'—':new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
  function technicalBadge(t){
    const sig=t?.signal||'neutro';
    const bg=sig==='favorevole'?'var(--green3)':sig==='contrario'?'var(--burg3)':'#eee9df';
    const col=sig==='favorevole'?'var(--green)':sig==='contrario'?'var(--burg)':'var(--gold)';
    return `<span class="pill" style="background:${bg};color:${col}">Tecnica <b>${sig}</b></span>`;
  }
  function drawChart(canvas,pts){
    if(!canvas||!pts?.length)return;
    const dpr=Math.max(1,window.devicePixelRatio||1),w=canvas.clientWidth||320,h=180;
    canvas.width=w*dpr;canvas.height=h*dpr;const x=canvas.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);
    const vals=pts.map(p=>p.close),mn=Math.min(...vals),mx=Math.max(...vals),pad=(mx-mn||mx*.02)*.12,lo=mn-pad,hi=mx+pad;
    x.strokeStyle='#dedbd4';x.lineWidth=1;for(let i=1;i<4;i++){let y=i*h/4;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke();}
    x.strokeStyle='#2f6652';x.lineWidth=2.5;x.beginPath();pts.forEach((p,i)=>{const px=i*(w-2)/(pts.length-1)+1,py=h-8-(p.close-lo)/(hi-lo)*(h-18);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
    x.fillStyle='#737b76';x.font='11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';x.fillText(pts[0].date,2,h-1);const last=pts[pts.length-1].date;x.fillText(last,w-x.measureText(last).width-2,h-1);
  }
  async function loadRadar(){
    let host=document.getElementById('dash');if(!host)return;
    let wrap=document.getElementById('rumorRadarWrap');
    if(!wrap){wrap=document.createElement('div');wrap.id='rumorRadarWrap';wrap.innerHTML=`<div class="sectionTitle"><h2>Rumor Radar</h2><span>trade speculativi ≤0,5%</span></div><div id="rumorRadar" class="card accentBurg"><div class="note">Caricamento…</div></div>`;const buyTitle=[...host.querySelectorAll('.sectionTitle h2')].find(x=>x.textContent.trim()==='Buy the Dip')?.parentElement;if(buyTitle)buyTitle.parentNode.insertBefore(wrap,buyTitle);else host.appendChild(wrap)}
    const box=document.getElementById('rumorRadar');
    try{
      const r=await fetch('trade_ideas.json?'+Date.now(),{cache:'no-store'}),d=await r.json();
      if(!d.ideas?.length){box.innerHTML=`<div class="k">Oggi</div><div class="v" style="font-size:20px;margin-top:8px">Nessuna occasione convincente</div><div class="note" style="margin-top:6px">Il radar non forza proposte quando il calo sembra giustificato dai fondamentali.</div>`;return}
      const i=d.ideas[0],t=i.technical||{};
      box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><div><b style="font-size:22px">${i.ticker||''}</b> <span class="source">${i.company||''}</span></div><b class="${(i.dropPct||0)<0?'neg':'pos'}">${pct(i.dropPct)}</b></div><div class="note" style="margin-top:6px">${i.thesis||i.rumor||''}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><span class="pill">Convinzione <b>${i.conviction||'—'}/10</b></span>${technicalBadge(t)}${i.entry?`<span class="pill">Ingresso <b>${i.entry}</b></span>`:''}${i.stop?`<span class="pill">Stop <b>${i.stop}</b></span>`:''}${i.target?`<span class="pill">Target <b>${i.target}</b></span>`:''}</div><div style="margin-top:14px"><div class="k">Grafico 3 mesi</div><canvas id="rumorChart" style="width:100%;height:180px;display:block;margin-top:5px"></canvas></div><div class="grid" style="margin-top:10px"><div class="card" style="padding:10px"><div class="k">RSI 14</div><div class="v" style="font-size:18px">${t.rsi14??'—'}</div></div><div class="card" style="padding:10px"><div class="k">MACD</div><div class="v" style="font-size:18px">${t.macdHist==null?'—':(t.macdHist>0?'↑ ':'↓ ')+t.macdHist}</div></div><div class="card" style="padding:10px"><div class="k">Prezzo vs MA20</div><div class="v" style="font-size:18px">${t.ma20==null?'—':(t.price>=t.ma20?'sopra':'sotto')}</div></div><div class="card" style="padding:10px"><div class="k">Volume rel. 20g</div><div class="v" style="font-size:18px">${t.relativeVolume20d==null?'—':t.relativeVolume20d+'×'}</div></div></div><div class="note" style="margin-top:10px">La tecnica è solo conferma/timing: la tesi resta il possibile eccesso di reazione a rumor, non MACD o RSI.</div>${i.url?`<div style="margin-top:9px"><a href="${i.url}" target="_blank" rel="noopener" style="color:var(--green);font-weight:700;text-decoration:none">Apri analisi →</a></div>`:''}`;
      requestAnimationFrame(()=>drawChart(document.getElementById('rumorChart'),i.chart3m||[]));
    }catch(e){box.innerHTML='<div class="note">Rumor Radar non disponibile.</div>'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadRadar);else loadRadar();
})();
