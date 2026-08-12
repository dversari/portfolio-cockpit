(() => {
  const EURO=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
  const PCT=n=>new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const formatDate=raw=>{if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?String(raw).slice(0,10):d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})};

  let syncData=null, patrimonyData=null;
  async function loadData(){
    try{
      [syncData,patrimonyData]=await Promise.all([
        fetch('fineco_sync.json?'+Date.now()).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch('patrimony_history.json?'+Date.now()).then(r=>r.ok?r.json():null).catch(()=>null)
      ]);
    }catch(e){syncData=null;patrimonyData=null}
  }

  /*
   * The chart now uses only canonical Fineco snapshots for historical total patrimony.
   * We do NOT reconstruct old cash from today's balance and movements: that produced the
   * false ~538k spike because the legacy market-value history is not an accounting ledger.
   * Each canonical point contains total patrimony, cash and therefore invested securities.
   */
  function buildSeries(){
    const out=[];
    const pts=Array.isArray(patrimonyData?.points)?patrimonyData.points:[];
    for(const p of pts){
      const date=String(p.date||'').slice(0,10);
      const total=Number(p.totalValue),cash=Number(p.cash);
      const invested=Number.isFinite(Number(p.investedValue))?Number(p.investedValue):(Number.isFinite(total)&&Number.isFinite(cash)?total-cash:null);
      if(date&&Number.isFinite(total)&&total>0&&Number.isFinite(invested)&&invested>0)out.push({date,total,invested,cash,source:p.source||'Fineco snapshot'});
    }

    // If the latest Fineco sync is newer than the stored canonical file, surface it immediately.
    const sd=String(syncData?.asOf||'').slice(0,10),st=Number(syncData?.patrimonyFineco),sc=Number(syncData?.cashAvailable);
    if(sd&&Number.isFinite(st)&&st>0&&Number.isFinite(sc)){
      const invested=Number.isFinite(Number(syncData?.portfolioFineco))?Number(syncData.portfolioFineco):st-sc;
      const i=out.findIndex(x=>x.date===sd);
      const row={date:sd,total:st,invested,cash:sc,source:'Fineco sync'};
      if(i>=0)out[i]=row;else out.push(row);
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date));
  }

  function maxDD(series){if(series.length<2)return null;let peak=-Infinity,m=0;for(const z of series){if(!(z.total>0))continue;peak=Math.max(peak,z.total);m=Math.min(m,z.total/peak-1)}return m}

  function relabel(){
    const c=document.getElementById('hist'),card=c?.closest('.chartCard'),title=card?.querySelector('.k');
    if(title)title.textContent='Andamento patrimonio totale';
    const m=document.getElementById('mdd'),sub=m?.parentElement?.querySelector('.sub');
    if(sub)sub.textContent='snapshot Fineco · nessuna ricostruzione del cash';
  }

  function drawChart(){try{
    const series=buildSeries(),c=document.getElementById('hist');if(!c||series.length<2)return false;
    relabel();const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
    const vals=series.flatMap(z=>[z.total,z.invested]).filter(Number.isFinite);let mn=Math.min(...vals),mx=Math.max(...vals);if(mx===mn){mx*=1.01;mn*=.99}const pad=Math.max((mx-mn)*.10,1);mn-=pad;mx+=pad;
    const left=58,right=c.width-30,top=28,bottom=224,px=i=>left+(right-left)*i/(series.length-1),py=v=>bottom-(v-mn)/(mx-mn)*(bottom-top);
    x.save();x.strokeStyle='#dedbd4';x.lineWidth=1;for(let i=0;i<4;i++){const y=top+i*(bottom-top)/3;x.beginPath();x.moveTo(left,y);x.lineTo(right,y);x.stroke()}

    // Securities invested value (Fineco), secondary dashed line.
    x.strokeStyle='#9a9184';x.lineWidth=1.6;x.setLineDash([6,5]);x.beginPath();series.forEach((z,i)=>i?x.lineTo(px(i),py(z.invested)):x.moveTo(px(i),py(z.invested)));x.stroke();

    // Total patrimony (Fineco), primary line.
    x.strokeStyle='#2f6652';x.lineWidth=3;x.setLineDash([]);x.beginPath();series.forEach((z,i)=>i?x.lineTo(px(i),py(z.total)):x.moveTo(px(i),py(z.total)));x.stroke();

    // Small points make clear these are real snapshots, not fabricated daily estimates.
    series.forEach((z,i)=>{x.beginPath();x.arc(px(i),py(z.total),3.2,0,Math.PI*2);x.fillStyle='#2f6652';x.fill()});

    x.fillStyle='#737b76';x.font='12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';x.textAlign='left';x.fillText(EURO(mx-pad),4,top+4);x.fillText(EURO(mn+pad),4,bottom);
    const count=Math.min(c.clientWidth<520?4:6,series.length),indices=[];for(let i=0;i<count;i++)indices.push(Math.round(i*(series.length-1)/(count-1)));x.font='11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';x.fillStyle='#737b76';x.strokeStyle='#d9d7d0';x.textBaseline='bottom';[...new Set(indices)].forEach((idx,n,arr)=>{const p=px(idx);x.beginPath();x.moveTo(p,232);x.lineTo(p,237);x.stroke();x.textAlign=n===0?'left':n===arr.length-1?'right':'center';x.fillText(formatDate(series[idx].date),p,c.height-8)});

    x.textBaseline='alphabetic';x.textAlign='right';x.font='11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';x.fillStyle='#2f6652';x.fillText('Totale Fineco',right,16);x.fillStyle='#8a8379';x.fillText('Titoli Fineco',right-82,16);x.restore();

    const md=maxDD(series),me=document.getElementById('mdd');if(me&&md!=null){me.textContent=PCT(md);me.className='v '+(md<0?'neg':'pos')}
    return true;
  }catch(e){console.warn('Patrimony chart:',e);return false}}

  async function refresh(){await loadData();drawChart()}
  let tries=0;const timer=setInterval(async()=>{tries++;if(document.getElementById('hist')){clearInterval(timer);await refresh()}else if(tries>40)clearInterval(timer)},250);
  window.addEventListener('pageshow',()=>setTimeout(refresh,350));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refresh,350)});
})();
