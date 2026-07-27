const affiliate = {
  async init() {
    if (!app.token) {
      window.location.href = 'index.html';
      return;
    }
    await this.loadAffiliateStats();
  },

  async loadAffiliateStats() {
    try {
      const data = await app.fetchAPI('/api/affiliate/stats');
      
      const link = `${window.location.origin}/index.html?ref=${data.ref_code}`;
      document.getElementById('ref-link').value = link;

      document.getElementById('stat-level1').textContent = data.level1Count || 0;
      document.getElementById('stat-level2').textContent = data.level2Count || 0;
      document.getElementById('stat-commissions').textContent = app.formatBRL(data.totalCommissions || 0);
      document.getElementById('stat-balance').textContent = app.formatBRL(data.affiliateBalance || 0);
    } catch (e) {
      console.error(e);
    }
  },

  copyReferralLink() {
    const linkEl = document.getElementById('ref-link');
    if (!linkEl || !linkEl.value) return;
    navigator.clipboard.writeText(linkEl.value);
    app.showToast('📋 Link de indicação copiado com sucesso!');
  },

  async redeemCommissions() {
    try {
      const data = await app.fetchAPI('/api/affiliate/redeem', { method: 'POST' });
      app.showToast(`💰 ${app.formatBRL(data.redeemed)} de comissões transferidos para a sua carteira!`);
      await this.loadAffiliateStats();
      if (app.user) {
        app.user.balance = data.newBalance;
        app.updateBalanceDisplays();
      }
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => affiliate.init(), 300);
});
