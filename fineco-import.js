(() => {
  const PORT_KEY='pc_fineco_portfolio_override_v1';
  const MOV_KEY='pc_fineco_movements_v1';
  const META_KEY='pc_fineco_import_meta_v1';
  let xlsxPromise=null;

  const norm=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ');
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const num=v=>{
    if(typeof v==='number'&&Number.isFinite(v))return v;
    let s=String(v??'').trim();if(!s)return null;
    s=s.replace(/\s/g,'').replace(/€/g,'').replace(/%/g,'');
    if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const eur=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n)||0);
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')};
  const getStored=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k)||'')||fallback}catch(_){return fallback}};

  async function loadXLSX(){
    if(window.XLSX)return window.XLSX;
    if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload=()=>resolve(window.XLSX);s.onerror=()=>reject(new Error('Impossibile caricare il lettore Excel'));
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  function findHeader(rows,kind){
    let best=null;
    for(let r=0;r<Math.min(rows.length,40);r++){
      const cells=(rows[r]||[]).map(norm);let score=0;
      if(kind==='portfolio'){
        if(cells.some(x=>/titolo|strumento|descrizione/.test(x)))score+=2;
        if(cells.some(x=>/quantita|qta/.test(x)))score+=2;
        if(cells.some(x=>/prezzo|p zo/.test(x)))score++;
        if(cells.some(x=>/valore.*mercato|controvalore|valore/.test(x)))score++;
        if(cells.some(x=>/prezzo.*medio|pmc|carico/.test(x)))score++;
      }else{
        if(cells.some(x=>/^data$|data operazione|data contabile|data valuta/.test(x)))score+=2;
        if(cells.some(x=>/descrizione|causale|operazione/.test(x)))score+=2;
        if(cells.some(x=>/importo|accredito|addebito|entrate|uscite|dare|avere/.test(x)))score+=2;
      }
      if(!best||score>best.score)best={row:r,score,cells};
    }
    const min=kind==='portfolio'?4:4;
    return best&&best.score>=min?best:null;
  }

  function mapHeaders(row){
    const out={};(row||[]).forEach((h,i)=>{const n=norm(h);if(n&&!out[n])out[n]=i});return out;
  }
  function col(headers,patterns){for(const [h,i] of Object.entries(headers))if(patterns.some(p=>p.test(h)))return i;return -1}

  async function parseWorkbook(file){
    const XLSX=await loadXLSX();
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const sheets=wb.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})}));
    let p=null,m=null;
    for(const s of sheets){const ph=findHeader(s.rows,'portfolio'),mh=findHeader(s.rows,'movements');if(ph&&(!p||ph.score>p.h.score))p={s,h:ph};if(mh&&(!m||mh.score>m.h.score))m={s,h:mh}}
    if(p&&(!m||p.h.score>=m.h.score+1))return {kind:'portfolio',sheet:p.s,header:p.h};
    if(m)return {kind:'movements',sheet:m.s,header:m.h};
    throw new Error('Formato Fineco non riconosciuto. Non trovo intestazioni di portafoglio o movimenti.');
  }

  async function basePortfolio(){try{const r=await fetch('portfolio.json?import='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch(_){return null}}
  async function baseSync(){try{const r=await fetch('fineco_sync.json?import='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch(_){return null}}

  async function parsePortfolio(parsed,file){
    const rows=parsed.sheet.rows,hrow=parsed.header.row,headers=mapHeaders(rows[hrow]);
    const iName=col(headers,[/^titolo$/,/^strumento$/,/^descrizione$/,/(nome|denominazione).*titolo/]);
    const iIsin=col(headers,[/^isin$/,/(codice).*isin/]);
    const iQty=col(headers,[/quantita/,/^qta$/]);
    const iPrice=col(headers,[/^prezzo$/,/(prezzo).*mercato/,/^quotazione$/]);
    const iValue=col(headers,[/valore.*mercato/,/controvalore/,/^valore$/]);
    const iAvg=col(headers,[/prezzo.*medio/,/pmc/,/prezzo.*carico/]);
    const iCost=col(headers,[/valore.*carico/,/controvalore.*carico/,/^carico$/]);
    const iCurr=col(headers,[/^valuta$/,/(divisa)/]);
    const iVar=col(headers,[/^var ?%$/,/(variazione).*%/]);
    if(iName<0||iQty<0)throw new Error('Il file sembra un portafoglio Fineco, ma mancano Titolo/Strumento o Quantità.');

    const base=await basePortfolio();
    const byName=new Map((base?.positions||[]).map(p=>[norm(p.name),p]));
    const positions=[];
    for(let r=hrow+1;r<rows.length;r++){
      const row=rows[r]||[],name=clean(row[iName]);if(!name)continue;
      const qty=num(row[iQty]);if(qty==null)continue;
      const old=byName.get(norm(name))||{};
      const price=iPrice>=0?num(row[iPrice]):null,value=iValue>=0?num(row[iValue]):null,avg=iAvg>=0?num(row[iAvg]):null,cost=iCost>=0?num(row[iCost]):null;
      const currency=clean(iCurr>=0?row[iCurr]:'')||old.currency||'EUR';
      positions.push({
        name,isin:clean(iIsin>=0?row[iIsin]:''),symbol:old.symbol||'',qty,
        price:price??old.price??null,valueEUR:value??(price!=null&&currency==='EUR'?qty*price:null),
        cost:cost??(avg!=null?qty*avg:old.cost??null),cat:old.cat||'Altro',currency,
        dayChangePct:iVar>=0&&num(row[iVar])!=null?num(row[iVar])/100:old.dayChangePct??null,
        source:'Fineco import locale'
      });
    }
    if(!positions.length)throw new Error('Nessuna posizione valida trovata nel file.');
    const sync=await baseSync();
    const invested=positions.reduce((s,p)=>s+(Number(p.valueEUR)||0),0);
    const totalCost=positions.reduce((s,p)=>s+(Number(p.cost)||0),0);
    const cash=Number(sync?.cashAvailable||0);
    const snap={importedAt:new Date().toISOString(),fileName:file.name,positions,invested,totalCost,cash,total:invested+cash};
    return snap;
  }

  function classifyMovement(desc){const d=norm(desc);if(/cedola|coupon|interessi titolo|interesse obblig/.test(d))return 'cedola';if(/dividend|dividendo/.test(d))return 'dividendo';if(/ritenuta|imposta|tax/.test(d))return 'fiscale';if(/commission/.test(d))return 'commissione';if(/acquisto|compera/.test(d))return 'acquisto';if(/vendita|vendita titoli/.test(d))return 'vendita';return 'altro'}

  function parseMovements(parsed,file){
    const rows=parsed.sheet.rows,hrow=parsed.header.row,headers=mapHeaders(rows[hrow]);
    const iDate=col(headers,[/^data$/, /data operazione/,/data contabile/,/data movimento/]);
    const iValDate=col(headers,[/data valuta/]);
    const iDesc=col(headers,[/descrizione/,/causale/,/^operazione$/]);
    const iAmount=col(headers,[/^importo$/, /importo.*eur/,/accredito/,/addebito/,/movimento/]);
    const iIn=col(headers,[/entrate/,/accrediti/,/^avere$/]);
    const iOut=col(headers,[/uscite/,/addebiti/,/^dare$/]);
    const iCurr=col(headers,[/^valuta$/, /divisa/]);
    const iRef=col(headers,[/id operazione/,/numero operazione/,/riferimento/,/^id$/,/^rif/]);
    if(iDate<0||iDesc<0||(iAmount<0&&iIn<0&&iOut<0))throw new Error('Il file sembra dei movimenti, ma mancano Data, Descrizione/Causale o Importo.');
    const out=[];
    for(let r=hrow+1;r<rows.length;r++){
      const row=rows[r]||[],date=clean(row[iDate]),desc=clean(row[iDesc]);if(!date||!desc)continue;
      let amount=iAmount>=0?num(row[iAmount]):null;if(amount==null){const inc=iIn>=0?num(row[iIn]):null,dec=iOut>=0?num(row[iOut]):null;amount=(inc??0)-(dec??0)}
      if(amount==null)continue;
      const currency=clean(iCurr>=0?row[iCurr]:'')||'EUR',ref=clean(iRef>=0?row[iRef]:'');
      const normalizedRow=(rows[hrow]||[]).map((h,c)=>norm(h)+'='+clean(row[c])).join('|');
      const fp=hash(ref?`ref|${ref}|${amount}|${currency}`:`row|${normalizedRow}`);
      out.push({id:fp,date,valueDate:clean(iValDate>=0?row[iValDate]:''),description:desc,amount,currency,reference:ref,type:classifyMovement(desc),sourceFile:file.name,importedAt:new Date().toISOString()});
    }
    if(!out.length)throw new Error('Nessun movimento valido trovato nel file.');
    return out;
  }

  function saveMovements(items,file){
    const existing=getStored(MOV_KEY,[]),seen=new Set(existing.map(x=>x.id));
    const fresh=items.filter(x=>!seen.has(x.id));
    localStorage.setItem(MOV_KEY,JSON.stringify(existing.concat(fresh).slice(-10000)));
    const dups=items.length-fresh.length;
    localStorage.setItem(META_KEY,JSON.stringify({lastImport:new Date().toISOString(),fileName:file.name,type:'movements',rows:items.length,newRows:fresh.length,duplicates:dups}));
    return {fresh,duplicates:dups,total:existing.length+fresh.length};
  }

  function applyPortfolio(snap){
    localStorage.setItem(PORT_KEY,JSON.stringify(snap));
    localStorage.setItem(META_KEY,JSON.stringify({lastImport:new Date().toISOString(),fileName:snap.fileName,type:'portfolio',positions:snap.positions.length}));
    const $=id=>document.getElementById(id);
    if($('patrimony'))$('patrimony').textContent=eur(snap.total);
    if($('heroInvested'))$('heroInvested').textContent=eur(snap.invested);
    if($('heroCash'))$('heroCash').textContent=eur(snap.cash);
    if($('value'))$('value').textContent=eur(snap.invested);
    if($('cash'))$('cash').textContent=eur(snap.cash);
    if($('updated'))$('updated').textContent='Import '+new Date(snap.importedAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const pl=snap.invested-snap.totalCost;if($('pl')){$('pl').textContent=eur(pl);$('pl').className='v '+(pl>=0?'pos':'neg')}
    if($('plpct'))$('plpct').textContent=snap.totalCost?(pl/snap.totalCost*100).toLocaleString('it-IT',{maximumFractionDigits:2})+'%':'';
    if($('posCount'))$('posCount').textContent=snap.positions.length+' strumenti · Fineco import';
    if($('rows'))$('rows').innerHTML=snap.positions.map(p=>{const ppl=p.valueEUR==null||p.cost==null?null:p.valueEUR-p.cost;return `<tr><td><b>${p.name}</b><br><span class="source">${p.cat||''}</span></td><td><span class="source">Fineco import</span></td><td class="num">${p.qty}</td><td class="num">${p.price==null?'—':Number(p.price).toLocaleString('it-IT',{maximumFractionDigits:4})+' '+p.currency}</td><td class="num">${p.valueEUR==null?'—':eur(p.valueEUR)}</td><td class="num ${ppl!=null&&ppl>=0?'pos':'neg'}">${ppl==null?'—':eur(ppl)}</td><td class="num">${p.dayChangePct==null?'—':(p.dayChangePct*100).toLocaleString('it-IT',{maximumFractionDigits:2})+'%'}</td></tr>`}).join('');
    if(typeof window.drawAlloc==='function')try{window.drawAlloc(snap.positions)}catch(_){}
  }

  function movementStats(){
    const a=getStored(MOV_KEY,[]);const sums={cedola:0,dividendo:0,fiscale:0,commissione:0};for(const m of a)if(sums[m.type]!=null)sums[m.type]+=Number(m.amount)||0;
    return {count:a.length,...sums,recent:a.slice().sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,20)};
  }
  function context(){const snap=getStored(PORT_KEY,null);return {portfolio:snap,movements:movementStats(),lastImport:getStored(META_KEY,null)}}

  async function importFile(file){
    const parsed=await parseWorkbook(file);
    if(parsed.kind==='portfolio'){
      const snap=await parsePortfolio(parsed,file);
      const ok=confirm(`Portafoglio Fineco riconosciuto.\n\n${snap.positions.length} strumenti\nValore titoli: ${eur(snap.invested)}\nCash attuale app: ${eur(snap.cash)}\n\nAggiornare questa app su questo dispositivo?`);
      if(!ok)return {cancelled:true};applyPortfolio(snap);return {kind:'portfolio',snap};
    }
    const items=parseMovements(parsed,file),existing=getStored(MOV_KEY,[]),seen=new Set(existing.map(x=>x.id)),newCount=items.filter(x=>!seen.has(x.id)).length,dup=items.length-newCount;
    const ok=confirm(`Movimenti Fineco riconosciuti.\n\n${items.length} righe nel file\n${newCount} nuove\n${dup} già presenti e NON verranno duplicate\n\nImportare?`);
    if(!ok)return {cancelled:true};return {kind:'movements',result:saveMovements(items,file)};
  }

  function restore(){const snap=getStored(PORT_KEY,null);if(snap&&snap.positions?.length)setTimeout(()=>applyPortfolio(snap),900)}
  window.PCFinecoImport={importFile,context,movementStats,getPortfolio:()=>getStored(PORT_KEY,null),getMovements:()=>getStored(MOV_KEY,[]),clearPortfolio:()=>localStorage.removeItem(PORT_KEY)};
  restore();
})();
