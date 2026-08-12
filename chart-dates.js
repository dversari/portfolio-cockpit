(() => {
  const EURO=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
  const PCT=n=>new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const formatDate=raw=>{if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?String(raw).slice(0,10):d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})};

  let syncData=null;
  async function loadSync(){try{syncData=await fetch('fineco_sync.json?'+Date.now()).then(r=>r.ok?r.json():null)}catch(e){syncData=null}}

  /*
   * IMPORTANT: portfolio.json history is a sequence of market-value snapshots, but old
   * snapshots do not contain the cash balance and are not a full accounting ledger.
   * Reconstructing old cash backwards from today's balance + movements is unsafe because
   * the historical securities snapshots were produced under changing portfolio composition.
   * It double-counts trading cash around purchases/sales (the 07-09/08 spike to ~538k was
   * exactly this error). Therefore we NEVER fabricate historical cash.
   *
   * A point is total patrimony only when totalValue was stored explicitly. For legacy points
   * we retain the recorded snapshot as the best known historical value. The current point is
   * authoritative and uses current securities + current Fineco cash.
   */
  function buildSeries(){
    if(typeof DATA==='undefined'||!DATA||!Array.isArray(DATA.history))return[];
    const currentDate=String(DATA.asOf||'').slice(0,10);
    const currentInvested=Number(DATA.liveValue??DATA.verifiedValue);
    const currentCash=Number(syncData?.cashAvailable);
    return DATA.history.map(z=>{
      const date=String(z.date||z.asOf||'').slice(0,10);
      const invested=Number(z.investedValue??z.value??z.verifiedValue);
      if(!date||!Number.isFinite(invested)||invested<=0)return null;
      const storedTotal=Number(z.totalValue);
      let total=Number.isFinite(storedTotal)&&storedTotal>0?storedTotal:invested;
      let cash=null;
      if(date===currentDate&&Number.isFinite(currentInvested)&&Number.isFinite(currentCash)){
        total=currentInvested+currentCash; cash=currentCash;
      }
      return{date,invested,total,cash,legacy:!(Number.isFinite(storedTotal)&&storedTotal>0)&&date!==currentDate};
    }).filter(Boolean);
  }

  function maxDD(series){if(series.length<2)return null;let peak=-Infinity,m=0;for(const z of series){if(!(z.total>0))continue;peak=Math.max(peak,z.total);m=Math.min(m,z.total/peak-1)}return m}

  function relabel(){const c=document.getElementById('hist'),card=c?.closest('.chartCard'),title=card?.querySelector('.k');if(title)title.textContent='Andamento patrimonio totale';const m=document.getElementById('mdd'),sub=m?.parentElement?.querySelector('.sub');if(sub)sub.textContent='storico disponibile · dati legacy non ricostruiti'}

  function drawChart(){try{
    const series=buildSeries(),c=document.getElementById('hist');if(!c||series.length<2)return false;relabel();const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
    const vals=series.map(z=>z.total).filter(Number.isFinite);let mn=Math.min(...vals),mx=Math.max(...vals);if(mx===mn){mx*=1.01;mn*=.99}const pad=Math.max((mx-mn)*.12,1);mn-=pad;mx+=pad;
    const left=58,right=c.width-30,top=28,bottom=224,px=i=>left+(right-left)*i/(series.length-1),py=v=>bottom-(v-mn)/(mx-mn)*(bottom-top);
    x.save();x.strokeStyle='#dedbd4';x.lineWidth=1;for(let i=0;i<4;i++){const y=top+i*(bottom-top)/3;x.beginPath();x.moveTo(left,y);x.lineTo(right,y);x.stroke()}
    x.strokeStyle='#2f6652';x.lineWidth=3;x.setLineDash([]);x.beginPath();series.forEach((z,i)=>i?x.lineTo(px(i),py(z.total)):x.moveTo(px(i),py(z.total)));x.stroke();
    x.fillStyle='#737b76';x.font='12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';x.textAlign='left';x.fillText(EURO(mx-pad),4,top+4);x.fillText(EURO(mn+pad),4,bottom);
    const count=Math.min(c.clientWidth<520?4:6,series.length),indices=[];for(let i=0;i<count;i++)indices.push(Math.round(i*(series.length-1)/(count-1)));x.font='11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';x.fillStyle='#737b76';x.strokeStyle='#d9d7d0';x.textBaseline='bottom';[...new Set(indices)].forEach((idx,n,arr)=>{const p=px(idx);x.beginPath();x.moveTo(p,232);x.lineTo(p,237);x.stroke();x.textAlign=n===0?'left':n===arr.length-1?'right':'center';x.fillText(formatDate(series[idx].date),p,c.height-8)});x.restore();
    const md=maxDD(series),me=document.getElementById('mdd');if(me&&md!=null){me.textContent=PCT(md);me.className='v '+(md<0?'neg':'pos')}
    return true;
  }catch(e){console.warn('Patrimony chart:',e);return false}}

  async function refresh(){await loadSync();drawChart()}
  let tries=0;const timer=setInterval(async()=>{tries++;if(typeof DATA!=='undefined'&&DATA?.history?.length){clearInterval(timer);await refresh()}else if(tries>40)clearInterval(timer)},250);
  window.addEventListener('pageshow',()=>setTimeout(refresh,350));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refresh,350)});
})();
