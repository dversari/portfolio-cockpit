(() => {
  const eur = n => new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);

  const pct = n => new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(n) || 0);

  let applying = false;
  let sync = null;

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  function applyCentral() {
    if (!sync || applying) return;
    applying = true;
    try {
      const invested = Number(sync.portfolioFineco ?? sync.baselineValue ?? 0);
      const cash = Number(sync.cashAvailable ?? 0);
      const patrimony = Number(sync.patrimonyFineco ?? invested + cash);
      const pl = Number(sync.profitLoss ?? (invested - Number(sync.totalCost || 0)));
      const plPct = Number(sync.profitLossPct ?? (sync.totalCost ? pl / Number(sync.totalCost) : 0));
      const positions = Number(sync.positions ?? 0);

      setText('patrimony', eur(patrimony));
      setText('heroInvested', eur(invested));
      setText('heroCash', eur(cash));
      setText('coverage', positions ? `${positions}/${positions}` : '—');
      setText('cash', eur(cash));
      setText('value', eur(invested));
      setText('pl', eur(pl));
      setText('plpct', pct(plPct));
      setText('posCount', positions ? `${positions} strumenti` : '—');

      const pe = document.getElementById('pl');
      if (pe) pe.className = 'v ' + (pl >= 0 ? 'pos' : 'neg');

      if (sync.asOf) {
        setText('updated', new Date(sync.asOf).toLocaleString('it-IT', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        }));
      }

      const launchHint = document.querySelector('.pc-ai-launch .hint');
      if (launchHint) launchHint.textContent = 'Chat portafoglio · dati centralizzati';
      const importButton = document.getElementById('pcAiImport');
      if (importButton) importButton.style.display = 'none';
      const importInput = document.getElementById('pcAiFile');
      if (importInput) importInput.remove();
    } finally {
      applying = false;
    }
  }

  async function boot() {
    for (const key of ['pc_fineco_portfolio_override_v1','pc_fineco_movements_v1','pc_fineco_import_meta_v1']) {
      try { localStorage.removeItem(key); } catch (_) {}
    }

    try {
      const r = await fetch('fineco_sync.json?central=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      sync = await r.json();
      applyCentral();

      const observer = new MutationObserver(() => applyCentral());
      const ids = ['patrimony','heroInvested','heroCash','coverage','cash','value','pl','plpct','updated','posCount'];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
      }

      setTimeout(applyCentral, 300);
      setTimeout(applyCentral, 1200);
      setTimeout(applyCentral, 3000);
    } catch (e) {
      console.warn('Central mode:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
