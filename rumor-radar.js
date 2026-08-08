(()=>{
  async function loadRadar(){
    let host=document.getElementById('dash');
    if(!host)return;
    let wrap=document.getElementById('rumorRadarWrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='rumorRadarWrap';
      wrap.innerHTML=`<div class="sectionTitle"><h2>Rumor Radar</h2><span>trade speculativi ≤0,5%</span></div><div id="rumorRadar" class="card accentBurg"><div class="note">Caricamento…</div></div>`;
      const buyTitle=[...host.querySelectorAll('.sectionTitle h2')].find(x=>x.textContent.trim()==='Buy the Dip')?.parentElement;
      if(buyTitle) buyTitle.parentNode.insertBefore(wrap,buyTitle);
      else host.appendChild(wrap);
    }
    const box=document.getElementById('rumorRadar');
    try{
      const r=await fetch('trade_ideas.json?'+Date.now(),{cache:'no-store'});
      const d=await r.json();
      if(!d.ideas?.length){
        box.innerHTML=`<div class="k">Oggi</div><div class="v" style="font-size:20px;margin-top:8px">Nessuna occasione convincente</div><div class="note" style="margin-top:6px">Il radar non forza proposte quando il calo sembra giustificato dai fondamentali.</div>`;
        return;
      }
      box.innerHTML=d.ideas.slice(0,2).map(i=>`<div style="padding:4px 0 14px;border-bottom:1px solid var(--line);margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><div><b style="font-size:20px">${i.ticker||''}</b> <span class="source">${i.company||''}</span></div><b class="${(i.dropPct||0)<0?'neg':'pos'}">${i.dropPct!=null?new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(i.dropPct):''}</b></div><div class="note" style="margin-top:6px">${i.thesis||i.rumor||''}</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:11px"><span class="pill">Convinzione <b>${i.conviction||'—'}/10</b></span>${i.entry?`<span class="pill">Ingresso <b>${i.entry}</b></span>`:''}${i.stop?`<span class="pill">Stop <b>${i.stop}</b></span>`:''}${i.target?`<span class="pill">Target <b>${i.target}</b></span>`:''}</div>${i.url?`<div style="margin-top:9px"><a href="${i.url}" target="_blank" rel="noopener" style="color:var(--green);font-weight:700;text-decoration:none">Apri analisi →</a></div>`:''}</div>`).join('');
    }catch(e){
      box.innerHTML='<div class="note">Rumor Radar non disponibile.</div>';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadRadar);else loadRadar();
})();
