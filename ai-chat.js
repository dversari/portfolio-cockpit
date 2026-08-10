(() => {
  const STORAGE_KEY = 'pc_ai_chat_v1';
  const ENDPOINT_KEY = 'pc_ai_endpoint';

  const css = `
  .pc-ai-launch{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));z-index:24;width:min(760px,calc(100% - 22px));display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #cfd5d1;border-radius:16px;background:rgba(251,250,247,.97);backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(45,55,49,.14);color:#1f2b26;cursor:pointer;min-height:58px}
  .pc-ai-launch .spark,.pc-ai-head .spark{width:30px;height:30px;border-radius:10px;background:#243c33;color:#fff;display:grid;place-items:center;font-size:16px;flex:0 0 auto}
  .pc-ai-launch .txt{min-width:0;flex:1}.pc-ai-launch .ttl{font-size:13px;font-weight:800}.pc-ai-launch .hint{font-size:11px;color:#737b76;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}.pc-ai-launch .chev{color:#737b76;font-weight:800;font-size:18px;padding:0 2px}

  .pc-ai-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom));z-index:25;width:min(760px,calc(100% - 22px));height:min(560px,70vh);display:none;flex-direction:column;border:1px solid #cfd5d1;border-radius:20px;background:#fbfaf7;box-shadow:0 18px 50px rgba(35,48,42,.24);overflow:hidden}
  .pc-ai-panel.open{display:flex}.pc-ai-head{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid #dedbd4;background:#f6f4ef}.pc-ai-head .title{font-weight:800;font-size:14px;flex:1;min-width:0}.pc-ai-head .mode{font-size:10px;color:#2f6652;background:#dfe8e2;border:1px solid #cddbd2;border-radius:999px;padding:4px 7px;white-space:nowrap}.pc-ai-iconbtn{border:0;background:transparent;padding:6px;border-radius:9px;cursor:pointer;font-size:17px;line-height:1}
  .pc-ai-messages{flex:1;min-height:0;overflow:auto;padding:12px 13px;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}.pc-ai-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap}.pc-ai-msg.user{align-self:flex-end;background:#243c33;color:#fff;border-bottom-right-radius:5px}.pc-ai-msg.assistant{align-self:flex-start;background:#f0ede7;color:#1f2b26;border-bottom-left-radius:5px}.pc-ai-msg.system{align-self:center;background:#fff7de;color:#6a592f;border:1px solid #ead9a4;font-size:11px;max-width:96%}
  .pc-ai-compose{display:flex;gap:8px;padding:9px 10px calc(9px + env(safe-area-inset-bottom));border-top:1px solid #dedbd4;background:#f6f4ef}.pc-ai-input{flex:1;resize:none;min-height:42px;max-height:96px;border:1px solid #d9d7d0;border-radius:12px;padding:10px 11px;font:inherit;font-size:13px;background:#fff;color:#1f2b26}.pc-ai-send{border:0;background:#2f6652;color:#fff;border-radius:12px;padding:0 14px;font-weight:800;cursor:pointer}.pc-ai-send:disabled{opacity:.5;cursor:default}
  .pc-ai-settings{display:none;padding:10px 13px;border-bottom:1px solid #dedbd4;background:#fff}.pc-ai-settings.open{display:block}.pc-ai-settings label{display:block;font-size:11px;color:#737b76;margin-bottom:5px}.pc-ai-settings .row{display:flex;gap:7px}.pc-ai-settings input{flex:1;min-width:0;padding:9px 10px;border:1px solid #d9d7d0;border-radius:10px;font-size:12px}.pc-ai-settings button{padding:8px 10px;font-size:11px}.pc-ai-small{font-size:10px;color:#737b76;margin-top:6px;line-height:1.35}

  @media(max-width:560px){
    .pc-ai-launch{bottom:calc(68px + env(safe-area-inset-bottom));width:calc(100% - 20px);padding:8px 11px;min-height:56px}
    .pc-ai-launch .hint{max-width:58vw}.pc-ai-panel{left:8px;right:8px;transform:none;width:auto;bottom:calc(68px + env(safe-area-inset-bottom));height:min(68dvh,620px);max-height:calc(100dvh - 118px);border-radius:20px}
    .pc-ai-head{padding:10px 11px}.pc-ai-head .mode{display:none}.pc-ai-msg{max-width:94%}.pc-ai-messages{padding:11px}.pc-ai-compose{padding-left:9px;padding-right:9px}
  }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const launch = document.createElement('div');
  launch.className = 'pc-ai-launch';
  launch.setAttribute('role','button');
  launch.setAttribute('aria-label','Apri Chiedi al Portafoglio');
  launch.innerHTML = '<div class="spark">✦</div><div class="txt"><div class="ttl">Chiedi al Portafoglio</div><div class="hint">Sempre disponibile · conversazione salvata</div></div><div class="chev">⌃</div>';

  const panel = document.createElement('div');
  panel.className = 'pc-ai-panel';
  panel.innerHTML = `
    <div class="pc-ai-head">
      <div class="spark">✦</div>
      <div class="title">AI Portafoglio</div>
      <div class="mode" id="pcAiMode">demo locale</div>
      <button class="pc-ai-iconbtn" id="pcAiSettings" title="Impostazioni" aria-label="Impostazioni">⚙︎</button>
      <button class="pc-ai-iconbtn" id="pcAiClose" title="Chiudi" aria-label="Chiudi">×</button>
    </div>
    <div class="pc-ai-settings" id="pcAiSettingsBox">
      <label>Endpoint backend OpenAI</label>
      <div class="row"><input id="pcAiEndpoint" placeholder="https://tuo-backend.example/api/chat"><button id="pcAiSaveEndpoint">Salva</button></div>
      <div class="pc-ai-small">La chiave OpenAI resta nel backend. Senza endpoint la barra usa soltanto calcoli locali sui dati del portafoglio.</div>
    </div>
    <div class="pc-ai-messages" id="pcAiMessages"></div>
    <div class="pc-ai-compose">
      <textarea class="pc-ai-input" id="pcAiInput" rows="1" placeholder="Chiedi qualcosa sul portafoglio…"></textarea>
      <button class="pc-ai-send" id="pcAiSend">Invia</button>
    </div>`;

  document.body.appendChild(launch);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#pcAiMessages');
  const input = panel.querySelector('#pcAiInput');
  const send = panel.querySelector('#pcAiSend');
  const modeEl = panel.querySelector('#pcAiMode');
  const settingsBox = panel.querySelector('#pcAiSettingsBox');
  const endpointInput = panel.querySelector('#pcAiEndpoint');

  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) {}
  if (!Array.isArray(history)) history = [];

  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
  const esc = s => String(s ?? '');
  const eur = n => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
  const percent = n => new Intl.NumberFormat('it-IT',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(n)||0);

  function render() {
    messagesEl.innerHTML = '';
    if (!history.length) {
      const m = document.createElement('div');
      m.className = 'pc-ai-msg system';
      m.textContent = 'Posso già rispondere a domande su patrimonio, cash, P/L, strumenti e concentrazione. Per domande libere useremo il backend OpenAI.';
      messagesEl.appendChild(m);
    }
    for (const item of history) {
      const m = document.createElement('div');
      m.className = 'pc-ai-msg ' + (item.role === 'user' ? 'user' : 'assistant');
      m.textContent = esc(item.content);
      messagesEl.appendChild(m);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function portfolioContext() {
    const d = window.DATA || null;
    const s = window.SYNC || null;
    const positions = d?.positions || [];
    const invested = d?.liveValue || d?.verifiedValue || 0;
    const cash = s?.cashAvailable || 0;
    return {
      asOf: d?.asOf || null,
      invested,
      cash,
      total: invested + cash,
      positions: positions.map(p => ({name:p.name,category:p.cat||'',qty:p.qty,valueEUR:p.valueEUR,cost:p.cost,dayChangePct:p.dayChangePct}))
    };
  }

  function localAnswer(q) {
    const ctx = portfolioContext();
    if (!ctx.positions.length) return 'I dati del portafoglio non sono ancora disponibili. Attendi il caricamento e riprova.';
    const low = q.toLowerCase();
    const valued = ctx.positions.filter(p => Number.isFinite(+p.valueEUR)).sort((a,b)=>b.valueEUR-a.valueEUR);
    const biggest = valued[0];
    const top5 = valued.slice(0,5).reduce((s,p)=>s+(+p.valueEUR||0),0);
    const pl = valued.reduce((s,p)=>s+(+p.valueEUR||0)-(+p.cost||0),0);
    if (/cash|liquidit|disponibil/.test(low)) return `Liquidità libera: ${eur(ctx.cash)}. Patrimonio complessivo stimato: ${eur(ctx.total)}.`;
    if (/pi[uù] grande|maggiore|prima posizione|concentraz/.test(low)) return biggest ? `La posizione maggiore è ${biggest.name}: ${eur(biggest.valueEUR)}, circa ${percent(biggest.valueEUR/ctx.invested)} del valore investito. Le prime 5 pesano circa ${percent(top5/ctx.invested)}.` : 'Non trovo posizioni valorizzate.';
    if (/quante|numero.*posizion|strumenti/.test(low)) return `Il portafoglio contiene ${ctx.positions.length} strumenti.`;
    if (/profit|perdita|p\/l|guadagn/.test(low)) return `Il P/L aggregato calcolabile dalle posizioni valorizzate è circa ${eur(pl)}.`;
    if (/patrimonio|totale|quanto vale/.test(low)) return `Valore investito: ${eur(ctx.invested)}. Cash libero: ${eur(ctx.cash)}. Totale: ${eur(ctx.total)}.`;
    return 'In modalità locale posso rispondere a patrimonio, cash, numero di strumenti, P/L e concentrazione. Per domande libere collegheremo il backend OpenAI.';
  }

  async function askBackend(endpoint, question) {
    const payload = {message:question,history:history.slice(-16),portfolio:portfolioContext()};
    const r = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!r.ok) throw new Error(`Backend HTTP ${r.status}`);
    const out = await r.json();
    if (!out || typeof out.answer !== 'string') throw new Error('Risposta backend non valida');
    return out.answer;
  }

  function refreshMode() {
    const ep = localStorage.getItem(ENDPOINT_KEY) || '';
    endpointInput.value = ep;
    modeEl.textContent = ep ? 'OpenAI' : 'demo locale';
  }

  async function submit() {
    const q = input.value.trim();
    if (!q || send.disabled) return;
    input.value = '';
    history.push({role:'user',content:q});
    save(); render();
    send.disabled = true;
    const ep = localStorage.getItem(ENDPOINT_KEY) || '';
    try {
      const answer = ep ? await askBackend(ep,q) : localAnswer(q);
      history.push({role:'assistant',content:answer});
    } catch (e) {
      history.push({role:'assistant',content:`Errore collegamento AI: ${e.message}`});
    } finally {
      send.disabled = false;
      save(); render();
      input.focus();
    }
  }

  function openPanel(){panel.classList.add('open');launch.style.display='none';setTimeout(()=>input.focus(),80)}
  function closePanel(){panel.classList.remove('open');launch.style.display='flex';settingsBox.classList.remove('open')}

  launch.addEventListener('click',openPanel);
  launch.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPanel()}});
  panel.querySelector('#pcAiClose').addEventListener('click',closePanel);
  panel.querySelector('#pcAiSettings').addEventListener('click',()=>settingsBox.classList.toggle('open'));
  panel.querySelector('#pcAiSaveEndpoint').addEventListener('click',()=>{
    const ep=endpointInput.value.trim();
    if(ep)localStorage.setItem(ENDPOINT_KEY,ep);else localStorage.removeItem(ENDPOINT_KEY);
    refreshMode();settingsBox.classList.remove('open');
  });
  send.addEventListener('click',submit);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}});

  refreshMode();
  render();
})();
