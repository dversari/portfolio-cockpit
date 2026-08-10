(() => {
  const KEYS = [
    'pc_fineco_portfolio_override_v1',
    'pc_fineco_movements_v1',
    'pc_fineco_import_meta_v1'
  ];

  for (const key of KEYS) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  window.PCFinecoImport = {
    importFile: async () => {
      throw new Error('Import locale disattivato: carica i file nella chat con ChatGPT per aggiornare il repository centrale.');
    },
    context: () => null,
    movementStats: () => ({ count: 0, cedola: 0, dividendo: 0, fiscale: 0, commissione: 0, recent: [] }),
    getPortfolio: () => null,
    getMovements: () => [],
    clearPortfolio: () => {}
  };
})();
