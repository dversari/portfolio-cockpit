(()=>{
  const eur=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const metric=(label,value,sub='')=>`<div class="metricline"><span>${label}${sub?`<br><span class="source">${sub}</span>`:''}</span><b>${value}</b></div>`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function patchExisting(host,s){
    const cards=[...host.querySelectorAll('.card')];
    for(const card of cards){
      const k=card.querySelector('.k');
      if(k?.textContent.trim()==='Cedole/dividendi'){
        const v=card.querySelector('.v'); if(v) v.textContent=eur(s.income?.dividendsNet||0);
        const src=card.querySelector('.source'); if(src) src.textContent='netto ritenute · da Movimenti Fineco';
      }
    }
    const lines=[...host.querySelectorAll('.metricline')];
    for(const line of lines){
      const t=line.querySelector('span')?.childNodes?.[0]?.textContent?.trim();
      if(t==='Incassato YTD'){
        const b=line.querySelector('b'); if(b) b.textContent=eur(s.income?.incomeNetTotal||0);
      }
    }
  }

  function render(host,data){
    const s=data.summary||{}, inc=s.income||{}, tax=s.tax||{}, tr=s.trading||{}, ext=s.externalFlows||{};
    document.getElementById('finecoMovementsDetail')?.remove();
    const div=document.createElement('div');
    div.id='finecoMovementsDetail';
    const recent=(data.movements||[]).filter(m=>['dividendo','ritenuta_dividendo','interessi_cash','ritenuta_interessi','rimborso_strumento','versamento_esterno','prelievo_esterno'].includes(m.type)).slice(0,10);
    div.innerHTML=`
      <div class="sectionTitle"><h2>Movimenti Fineco</h2><span>${s.totalMovements||0} movimenti · deduplicati</span></div>
      <div class="twocol">
        <div class="card">
          <div class="k">Reddito incassato</div>
          ${metric('Cedole lorde',eur(inc.cedoleGross||0))}
          ${metric('Dividendi lordi',eur(inc.dividendsGross||0),'ASML incluso')}
          ${metric('Ritenute su dividendi',eur(-(inc.dividendWithholding||0)))}
          ${metric('Dividendi netti',eur(inc.dividendsNet||0))}
          ${metric('Interessi cash netti',eur(inc.cashInterestNet||0))}
          ${metric('Reddito netto totale',eur(inc.incomeNetTotal||0))}
        </div>
        <div class="card">
          <div class="k">Fiscale e trading</div>
          ${metric('Crediti fiscali',eur(tax.fiscalCredits||0))}
          ${metric('Acquisti',eur(-(tr.purchases||0)))}
          ${metric('Vendite',eur(tr.sales||0))}
          ${metric('Rimborsi strumenti',eur(tr.redemptions||0))}
          ${metric('Versamenti esterni candidati XIRR',eur(ext.deposits||0),'da confermare nel perimetro XIRR')}
        </div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="k">Movimenti reddituali / rilevanti recenti</div>
        ${recent.length?recent.map(m=>metric(`${esc(m.date)} · ${esc(m.description)}`,eur(m.amount),esc(m.details))).join(''):'<div class="note">Nessun movimento rilevante.</div>'}
        <div class="source" style="margin-top:8px">Riconciliazione export: ${s.reconciled?'OK':'DA VERIFICARE'} · saldo finale ${eur(s.endingBalance||0)}.</div>
      </div>`;
    host.appendChild(div);
    patchExisting(host,s);
  }

  async function load(){
    const host=document.getElementById('analysis'); if(!host)return;
    try{
      const r=await fetch('movements.json?m='+Date.now(),{cache:'no-store'}); if(!r.ok)return;
      const data=await r.json();
      let tries=0;
      const apply=()=>{tries++; if(host.querySelector('.sectionTitle'))render(host,data); else if(tries<20)setTimeout(apply,150)};
      apply();
    }catch(e){console.warn('Movements panel',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
})();
