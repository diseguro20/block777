const affiliate = {
  async init() {
    if (!app.token) {
      this.renderAuthCard();
      return;
    }
    await this.loadAffiliateStats();
  },

  renderAuthCard() {
    const container = document.querySelector('.screen.active');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-card" style="max-width:400px; margin:40px auto; padding:24px; text-align:center;">
        <h2 style="font-size:20px; color:var(--color-primary); margin-bottom:8px;">🤝 PAINEL DE AFILIADOS</h2>
        <p style="font-size:11px; color:var(--color-text-muted); margin-bottom:16px;">Entre na sua conta para visualizar seu link exclusivo e suas comissões acumuladas:</p>
        
        <form id="affiliate-login-form" style="display:flex; flex-direction:column; gap:12px;">
          <input type="email" id="aff-email" placeholder="Seu e-mail" required style="margin-bottom:0;">
          <input type="password" id="aff-password" placeholder="Sua senha" required style="margin-bottom:0;">
          <button type="submit" class="btn btn-primary" style="width:100%; min-height:44px;">ACESSAR COMISSÕES 💰</button>
        </form>
      </div>
    `;

    document.getElementById('affiliate-login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('aff-email').value;
      const password = document.getElementById('aff-password').value;

      try {
        const data = await app.fetchAPI('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        app.token = data.token;
        localStorage.setItem('token', data.token);
        app.showToast('🤝 Login de Afiliado realizado com sucesso!');
        window.location.reload();
      } catch (err) {
        app.showToast('E-mail ou senha incorretos.');
      }
    };
  },

  async loadAffiliateStats() {
    try {
      const data = await app.fetchAPI('/api/affiliate/stats');
      
      const link = `${window.location.origin}/index.html?ref=${data.ref_code}`;
      const refEl = document.getElementById('ref-link');
      if (refEl) refEl.value = link;

      const l1 = document.getElementById('stat-level1');
      if (l1) l1.textContent = data.level1Count || 0;

      const l2 = document.getElementById('stat-level2');
      if (l2) l2.textContent = data.level2Count || 0;

      const comms = document.getElementById('stat-commissions');
      if (comms) comms.textContent = app.formatBRL(data.totalCommissions || 0);

      const bal = document.getElementById('stat-balance');
      if (bal) bal.textContent = app.formatBRL(data.affiliateBalance || 0);
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
