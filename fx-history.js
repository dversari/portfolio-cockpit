(()=>{
  function euro(n){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0)}
  function redraw(){
    if(!window.DATA||!Array.isArray(window.DATA.history))return false;
    const c=document.getElementById('hist'); if(!c)return false;
    const h=window.DATA.history;
    const a=h.map(z=>({d:z.date,v:z.value||z.verifiedValue,fx:z.constantFxValue})).filter(z=>z.v);
    if(a.length<2)return false;
    const all=a.flatMap(z=>[z.v,z.fx]).filter(v=>Number.isFinite(v));
    if(!all.length)return false;
    let mn=Math.min(...all),mx=Math.max(...all); if(mx===mn){mx*=1.01;mn*=.99}
    const x=c.getContext('2d'); x.clearRect(0,0,c.width,c.height);
    x.strokeStyle='#dedbd4'; x.lineWidth=1;
    for(let i=0;i<4;i++){let y=25+i*60;x.beginPath();x.moveTo(55,y);x.lineTo(c.width-20,y);x.stroke()}
    const px=i=>58+(c.width-88)*i/(a.length-1), py=v=>225-(v-mn)/(mx-mn)*185;
    function line(key,color,dash=[]){x.save();x.strokeStyle=color;x.lineWidth=3;x.setLineDash(dash);x.beginPath();let started=false;a.forEach((z,i)=>{let v=z[key];if(!Number.isFinite(v))return;let xx=px(i),yy=py(v);if(!started){x.moveTo(xx,yy);started=true}else x.lineTo(xx,yy)});x.stroke();x.restore()}
    line('v','#2f6652');
    line('fx','#7b3f4a',[8,5]);
    x.fillStyle='#737b76';x.font='12px sans-serif';x.fillText(euro(mx),4,28);x.fillText(euro(mn),4,225);
    x.font='700 11px sans-serif';x.fillStyle='#2f6652';x.fillText('● Portafoglio €',58,18);x.fillStyle='#7b3f4a';x.fillText('– – Cambi costanti',180,18);
    const card=c.closest('.card');
    if(card&&!card.querySelector('.fx-note')){
      const note=document.createElement('div');note.className='note fx-note';note.style.marginTop='4px';
      const base=window.DATA.fxBase||{};const parts=Object.entries(base).filter(([k])=>k!=='EUR').map(([k,v])=>`${k} ${Number(v).toFixed(4)}`);
      note.textContent='Linea bordeaux tratteggiata: valore ricalcolato ai cambi-base'+(parts.length?` (${parts.join(' · ')})`:'.');card.appendChild(note);
    }
    return true;
  }
  const old=window.drawHist;
  window.drawHist=function(h){if(old)old(h);setTimeout(redraw,0)};
  let tries=0;const t=setInterval(()=>{tries++;if(redraw()||tries>30)clearInterval(t)},300);
})();
