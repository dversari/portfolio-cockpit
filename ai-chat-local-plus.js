(() => {
  const STORAGE_KEY='pc_ai_chat_v1';
  const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
  const pct=n=>new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(n)||0);
  const norm=s=>(s||'').toString().toLowerCase();

  function bucket(p){
    const n=norm(p.name), c=norm(p.cat||p.category);
    if(c.includes('liquid') || n.includes('overnight rate swap') || n.includes('xeon')) return 'liquidita';
    if(c.includes('commod') || /gold|oro|commodity/.test(n)) return 'commodities';
    if(c.includes('obblig') || /\bbtp\b|bond|govt bond|corp bond/.test(n)) return 'obbligazioni';
    return 'azioni';
  }

  async function context(){
    const t=Date.now();
    const [rp,rs]=await Promise.all([
      fetch('portfolio.json?chatplus='+t,{cache:'no-store'}),
      fetch('fineco_sync.json?chatplus='+t,{cache:'no-store'})
    ]);
    if(!rp.ok||!rs.ok) throw new Error('dati portafoglio non disponibili');
    const d=await rp.json(), s=await rs.json();
    const positions=(d.positions||[]).filter(p=>Number.isFinite(Number(p.valueEUR)));
    const invested=Number(d.liveValue??d.verifiedValue??positions.reduce((a,p)=>a+Number(p.valueEUR||0),0));
    const cash=Number(s.cashAvailable||0);
    return {positions,invested,cash,total:invested+cash};
  }

  function categoryBreakdown(ctx){
    const sums={};
    for(const p of ctx.positions){const k=p.cat||p.category||'Altro';sums[k]=(sums[k]||0)+Number(p.valueEUR||0)}
    return Object.entries(sums).sort((a,b)=>b[1]-a[1]);
  }

  async function enhancedAnswer(q){
    const low=norm(q);
    const equity=/azion|equity|azioni ho|percentuale.*azioni|esposizione.*azioni/.test(low);
    const bonds=/obbligaz|reddito fisso|bond/.test(low);
    const commodities=/commodit|oro|gold/.test(low);
    const allocation=/allocaz|composizion|categorie|ripartizion/.test(low);
    if(!equity&&!bonds&&!commodities&&!allocation) return null;

    const ctx=await context();
    const sums={azioni:0,obbligazioni:0,commodities:0,liquidita:0};
    for(const p of ctx.positions)sums[bucket(p)]+=Number(p.valueEUR||0);

    if(equity){
      const v=sums.azioni;
      return `Esposizione azionaria stimata: ${euro(v)}, pari a ${pct(v/ctx.invested)} dei titoli e ${pct(v/ctx.total)} del patrimonio complessivo. Escludo BTP/obbligazioni e cat bond, commodities/oro, XEON e cash.`;
    }
    if(bonds){
      const v=sums.obbligazioni;
      return `Esposizione obbligazionaria/reddito fisso stimata: ${euro(v)}, pari a ${pct(v/ctx.invested)} dei titoli e ${pct(v/ctx.total)} del patrimonio complessivo.`;
    }
    if(commodities){
      const v=sums.commodities;
      return `Esposizione commodities/oro: ${euro(v)}, pari a ${pct(v/ctx.invested)} dei titoli e ${pct(v/ctx.total)} del patrimonio complessivo.`;
    }
    const parts=categoryBreakdown(ctx).map(([k,v])=>`${k}: ${pct(v/ctx.invested)} (${euro(v)})`).join('\n');
    return `Composizione dei titoli per categoria:\n${parts}\nCash libero: ${euro(ctx.cash)} (${pct(ctx.cash/ctx.total)} del patrimonio complessivo).`;
  }

  function append(role,text){
    const box=document.getElementById('pcAiMessages');
    if(!box)return;
    const m=document.createElement('div');m.className='pc-ai-msg '+role;m.textContent=text;box.appendChild(m);box.scrollTop=box.scrollHeight;
  }

  function persist(q,a){
    try{
      let h=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(!Array.isArray(h))h=[];
      h.push({role:'user',content:q},{role:'assistant',content:a});
      localStorage.setItem(STORAGE_KEY,JSON.stringify(h.slice(-60)));
    }catch(_){}
  }

  async function handle(e,input){
    const q=input.value.trim();
    if(!q)return false;
    const low=norm(q);
    if(!(/azion|equity|obbligaz|reddito fisso|\bbond\b|commodit|\boro\b|\bgold\b|allocaz|composizion|categorie|ripartizion/.test(low))) return false;
    e.preventDefault();e.stopImmediatePropagation();
    input.value='';append('user',q);
    try{const a=await enhancedAnswer(q);if(a){append('assistant',a);persist(q,a)}else append('assistant','Non riesco a classificare questa richiesta localmente.');}
    catch(err){append('assistant','Errore nel calcolo locale: '+err.message)}
    return true;
  }

  function boot(){
    const input=document.getElementById('pcAiInput'),send=document.getElementById('pcAiSend');
    if(!input||!send){setTimeout(boot,250);return}
    send.addEventListener('click',e=>handle(e,input),true);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)handle(e,input)},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
