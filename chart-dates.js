(() => {
  const EURO = n => new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);

  const PCT = n => new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(n) || 0);

  const formatDate = raw => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  let movementsData = null;
  let syncData = null;
  let loading = null;

  async function loadCashData() {
    if (loading) return loading;
    loading = Promise.all([
      fetch('movements.json?' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('fineco_sync.json?' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([m, s]) => {
      movementsData = m;
      syncData = s;
      return true;
    });
    return loading;
  }

  function movementDate(m) {
    return String(m?.date || m?.valueDate || '').slice(0, 10);
  }

  function endingCash() {
    const a = Number(syncData?.cashAvailable);
    if (Number.isFinite(a)) return a;
    const b = Number(movementsData?.summary?.endingBalance);
    return Number.isFinite(b) ? b : null;
  }

  function historicalCash(date) {
    const direct = DATA?.history?.find(x => String(x.date).slice(0, 10) === date);
    if (Number.isFinite(Number(direct?.cash))) return Number(direct.cash);

    const end = endingCash();
    const moves = movementsData?.movements;
    if (!Number.isFinite(end) || !Array.isArray(moves)) return null;

    const periodFrom = movementsData?.summary?.periodFrom;
    if (periodFrom && date < periodFrom) return null;

    let cash = end;
    for (const m of moves) {
      const md = movementDate(m);
      const amount = Number(m?.amount);
      if (md && md > date && Number.isFinite(amount)) cash -= amount;
    }
    return cash;
  }

  function buildSeries() {
    if (typeof DATA === 'undefined' || !DATA || !Array.isArray(DATA.history)) return [];
    return DATA.history.map(z => {
      const date = String(z.date || z.asOf || '').slice(0, 10);
      const invested = Number(z.investedValue ?? z.value ?? z.verifiedValue);
      if (!date || !Number.isFinite(invested) || invested <= 0) return null;
      const cash = historicalCash(date);
      const totalStored = Number(z.totalValue);
      const total = Number.isFinite(totalStored) && totalStored > 0
        ? totalStored
        : Number.isFinite(cash) ? invested + cash : invested;
      return { date, invested, cash, total };
    }).filter(Boolean);
  }

  function externalFlowByDate() {
    const out = {};
    const moves = movementsData?.movements;
    if (!Array.isArray(moves)) return out;
    for (const m of moves) {
      if (m?.bucket !== 'external_flow') continue;
      const d = movementDate(m);
      const a = Number(m?.amount);
      if (d && Number.isFinite(a)) out[d] = (out[d] || 0) + a;
    }
    return out;
  }

  function flowAdjustedMaxDD(series) {
    if (!Array.isArray(series) || series.length < 2) return null;
    const flows = externalFlowByDate();
    let index = 100;
    let peak = 100;
    let mdd = 0;
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].total;
      const cur = series[i].total;
      if (!(prev > 0) || !(cur > 0)) continue;
      const flow = Number(flows[series[i].date] || 0);
      const r = (cur - flow) / prev;
      if (!Number.isFinite(r) || r <= 0) continue;
      index *= r;
      peak = Math.max(peak, index);
      mdd = Math.min(mdd, index / peak - 1);
    }
    return mdd;
  }

  function relabel() {
    const canvas = document.getElementById('hist');
    const card = canvas?.closest('.chartCard');
    const title = card?.querySelector('.k');
    if (title) title.textContent = 'Andamento patrimonio totale';

    const mdd = document.getElementById('mdd');
    const sub = mdd?.parentElement?.querySelector('.sub');
    if (sub) sub.textContent = 'patrimonio totale · flussi esterni neutralizzati';
  }

  function drawChart() {
    try {
      const series = buildSeries();
      const c = document.getElementById('hist');
      if (!c || series.length < 2) return false;

      relabel();
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);

      const values = series.flatMap(z => [z.total, z.invested]).filter(Number.isFinite);
      let mn = Math.min(...values);
      let mx = Math.max(...values);
      if (mx === mn) { mx *= 1.01; mn *= 0.99; }
      const pad = Math.max((mx - mn) * 0.10, 1);
      mn -= pad;
      mx += pad;

      const left = 58;
      const right = c.width - 30;
      const top = 28;
      const bottom = 224;
      const px = i => left + (right - left) * i / (series.length - 1);
      const py = v => bottom - (v - mn) / (mx - mn) * (bottom - top);

      x.save();
      x.strokeStyle = '#dedbd4';
      x.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = top + i * (bottom - top) / 3;
        x.beginPath(); x.moveTo(left, y); x.lineTo(right, y); x.stroke();
      }

      // Secondary line: invested securities only.
      x.strokeStyle = '#9a9184';
      x.lineWidth = 1.5;
      x.setLineDash([6, 5]);
      x.beginPath();
      series.forEach((z, i) => i ? x.lineTo(px(i), py(z.invested)) : x.moveTo(px(i), py(z.invested)));
      x.stroke();

      // Primary line: total patrimony = securities + free cash.
      x.setLineDash([]);
      x.strokeStyle = '#2f6652';
      x.lineWidth = 3;
      x.beginPath();
      series.forEach((z, i) => i ? x.lineTo(px(i), py(z.total)) : x.moveTo(px(i), py(z.total)));
      x.stroke();

      x.fillStyle = '#737b76';
      x.font = '12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
      x.textAlign = 'left';
      x.fillText(EURO(mx - pad), 4, top + 4);
      x.fillText(EURO(mn + pad), 4, bottom);

      const maxLabels = c.clientWidth < 520 ? 4 : 6;
      const count = Math.min(maxLabels, series.length);
      const indices = [];
      for (let i = 0; i < count; i++) indices.push(Math.round(i * (series.length - 1) / (count - 1)));
      x.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
      x.fillStyle = '#737b76';
      x.strokeStyle = '#d9d7d0';
      x.textBaseline = 'bottom';
      [...new Set(indices)].forEach((idx, n, arr) => {
        const p = px(idx);
        x.beginPath(); x.moveTo(p, 232); x.lineTo(p, 237); x.stroke();
        if (n === 0) x.textAlign = 'left';
        else if (n === arr.length - 1) x.textAlign = 'right';
        else x.textAlign = 'center';
        x.fillText(formatDate(series[idx].date), p, c.height - 8);
      });

      // Compact legend inside the plot.
      x.textBaseline = 'alphabetic';
      x.textAlign = 'right';
      x.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
      x.fillStyle = '#2f6652';
      x.fillText('Totale', right, 16);
      x.fillStyle = '#8a8379';
      x.fillText('Titoli', right - 48, 16);
      x.restore();

      const md = flowAdjustedMaxDD(series);
      const me = document.getElementById('mdd');
      if (me && md != null) {
        me.textContent = PCT(md);
        me.className = 'v neg';
      }
      return true;
    } catch (e) {
      console.warn('Total patrimony chart:', e);
      return false;
    }
  }

  async function refresh() {
    await loadCashData();
    drawChart();
  }

  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (typeof DATA !== 'undefined' && DATA?.history?.length) {
      clearInterval(timer);
      await refresh();
    } else if (tries > 40) {
      clearInterval(timer);
    }
  }, 250);

  window.addEventListener('pageshow', () => setTimeout(refresh, 350));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(refresh, 350);
  });
})();
