(() => {
  const formatDate = raw => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  function drawDateLabels() {
    try {
      if (typeof DATA === 'undefined' || !DATA || !Array.isArray(DATA.history)) return false;
      const c = document.getElementById('hist');
      if (!c) return false;
      const a = DATA.history
        .map(z => ({ d: z.date || z.asOf, v: z.value || z.verifiedValue }))
        .filter(z => z.v && z.d);
      if (a.length < 2) return false;

      const x = c.getContext('2d');
      const left = 58;
      const right = c.width - 30;
      const y = c.height - 8;
      const maxLabels = c.clientWidth < 520 ? 4 : 6;
      const count = Math.min(maxLabels, a.length);
      const indices = [];
      for (let i = 0; i < count; i++) {
        indices.push(Math.round(i * (a.length - 1) / (count - 1)));
      }

      x.save();
      x.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
      x.fillStyle = '#737b76';
      x.strokeStyle = '#d9d7d0';
      x.lineWidth = 1;
      x.textBaseline = 'bottom';

      [...new Set(indices)].forEach((idx, n, arr) => {
        const px = left + (right - left) * idx / (a.length - 1);
        x.beginPath();
        x.moveTo(px, 232);
        x.lineTo(px, 237);
        x.stroke();

        const label = formatDate(a[idx].d);
        if (n === 0) x.textAlign = 'left';
        else if (n === arr.length - 1) x.textAlign = 'right';
        else x.textAlign = 'center';
        x.fillText(label, px, y);
      });
      x.restore();
      return true;
    } catch (e) {
      console.warn('Chart date labels:', e);
      return false;
    }
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (drawDateLabels() || tries > 40) clearInterval(timer);
  }, 250);

  window.addEventListener('pageshow', () => setTimeout(drawDateLabels, 350));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(drawDateLabels, 350);
  });
})();
