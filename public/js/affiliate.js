const affiliate = {
  async init() {
    if (!app.token) return this.showAuth();
    try {
      await app.fetchUserDataOnly();
      if (!app.user) return this.showAuth();
      await this.loadAffiliateStats();
    } catch (_) {
      this.showAuth();
    }
  },

  showAuth() {
    document.getElementById('affiliate-content').hidden = true;
    document.getElementById('affiliate-auth').hidden = false;

    document.getElementById('affiliate-login-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const data = await app.fetchAPI('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(form))
        });
        this.completeAuth(data, 'Login realizado.');
      } catch (_) {}
    };

    document.getElementById('affiliate-register-form').onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      payload.referred_by = localStorage.getItem('ref') || null;
      try {
        const data = await app.fetchAPI('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        this.completeAuth(data, 'Conta de afiliado criada.');
      } catch (_) {}
    };
  },

  toggleAuth(mode) {
    const isRegister = mode === 'register';
    const loginForm = document.getElementById('affiliate-login-form');
    const registerForm = document.getElementById('affiliate-register-form');
    const loginTab = document.getElementById('affiliate-login-tab');
    const registerTab = document.getElementById('affiliate-register-tab');

    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    loginTab.classList.toggle('active', !isRegister);
    registerTab.classList.toggle('active', isRegister);
    loginTab.setAttribute('aria-selected', String(!isRegister));
    registerTab.setAttribute('aria-selected', String(isRegister));
    document.getElementById('affiliate-auth-title').textContent = isRegister ? 'Comece a indicar.' : 'Acesse sua rede.';
    document.getElementById('affiliate-auth-copy').textContent = isRegister
      ? 'Cadastre-se gratuitamente e receba seu link exclusivo.'
      : 'Entre para ver indicações e comissões.';

    const firstField = isRegister
      ? document.getElementById('aff-username')
      : document.getElementById('aff-email');
    firstField.focus();
  },

  completeAuth(data, message) {
    app.token = data.token;
    app.user = data.user;
    localStorage.setItem('token', data.token);
    sessionStorage.setItem('affiliate-auth-message', message);
    location.reload();
  },

  async loadAffiliateStats() {
    const data = await app.fetchAPI('/api/affiliate/stats');
    document.getElementById('ref-link').value = data.referralLink;
    document.getElementById('stat-level1').textContent = data.level1Count;
    document.getElementById('stat-level2').textContent = data.level2Count;
    document.getElementById('stat-total').textContent = data.totalReferred;
    document.getElementById('stat-commissions').textContent = app.formatBRL(data.totalCommissions);
    document.getElementById('stat-balance').textContent = app.formatBRL(data.affiliateBalance);
    document.getElementById('nav-balance').textContent = app.formatBRL(data.affiliateBalance);
    document.getElementById('rate-level1').textContent = `${data.rates.level1}% por depósito`;
    document.getElementById('rate-level2').textContent = `${data.rates.level2}% por depósito`;

    const body = document.getElementById('commission-history');
    body.innerHTML = data.commissions.length
      ? data.commissions.map((item) => `<tr><td>${app.formatDate(item.created_at)}</td><td><span class="badge">Nível ${item.level}</span></td><td>${String(item.source_user_id).slice(0, 8)}…</td><td class="positive mono">+${app.formatBRL(item.amount)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty-state">Compartilhe seu link para receber a primeira comissão.</td></tr>';

    const authMessage = sessionStorage.getItem('affiliate-auth-message');
    if (authMessage) {
      sessionStorage.removeItem('affiliate-auth-message');
      app.showToast(authMessage);
    }
  },

  async copyReferralLink() {
    await navigator.clipboard.writeText(document.getElementById('ref-link').value);
    app.showToast('Link de indicação copiado.');
  },

  async redeemCommissions() {
    try {
      const data = await app.fetchAPI('/api/affiliate/redeem', { method: 'POST' });
      app.showToast(`${app.formatBRL(data.redeemed)} transferidos para sua carteira.`);
      await this.loadAffiliateStats();
    } catch (_) {}
  }
};

document.addEventListener('DOMContentLoaded', () => setTimeout(() => affiliate.init(), 60));
