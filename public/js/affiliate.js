// Módulo de Gerenciamento de Afiliados

const affiliate = {
  async init() {
    try {
      await this.loadStats();
    } catch (e) {
      console.warn('Erro ao carregar afiliados:', e);
    }
  },

  async loadStats() {
    try {
      const stats = await fetchAPI('/api/affiliate/stats');
      const refCode = stats.ref_code || stats.refCode || 'BLOCK777';
      const origin = window.location.origin;
      const refLink = `${origin}/index.html?ref=${refCode}`;

      const linkInput = document.getElementById('ref-link-display');
      if (linkInput) linkInput.value = refLink;

      document.getElementById('aff-l1-count').innerText = stats.level1Count || stats.totalReferred || 0;
      document.getElementById('aff-l2-count').innerText = stats.level2Count || 0;
      
      const commCentavos = stats.affiliateBalance || stats.totalCommissions || 0;
      const commBRL = (commCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      document.getElementById('aff-balance-val').innerText = commBRL;
    } catch (e) {}
  },

  copyLink() {
    const input = document.getElementById('ref-link-display');
    if (input && input.value) {
      navigator.clipboard.writeText(input.value);
      app.showToast('Link de indicação copiado com sucesso! 📋', 'success');
    }
  },

  async redeemCommissions() {
    try {
      const res = await fetchAPI('/api/affiliate/redeem', 'POST');
      app.showToast('Comissões resgatadas para a sua carteira principal! 💰', 'success');
      this.loadStats();
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  affiliate.init();
});
