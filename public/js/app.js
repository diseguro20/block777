const app = {
  token: localStorage.getItem('token'),
  user: null,

  init() {
    this.captureRef();
    this.bindForms();
    this.loadPublicPromotion();
    const registerButton = document.getElementById('landing-register-btn');
    if (registerButton) registerButton.hidden = Boolean(this.token);
    if (location.protocol === 'file:') {
      fetch('http://localhost:3001/api/health')
        .then(response => {
          if (response.ok) location.replace('http://localhost:3001/');
          else throw new Error();
        })
        .catch(() => this.showToast('Visual carregado. Inicie o servidor local para usar login, apostas e painéis.'));
    }
    if (!document.getElementById('landing-screen')) {
      if (this.token) this.fetchUserDataOnly();
      return;
    }
    document.getElementById('nav-actions').style.display = this.token ? '' : 'none';
    if (this.token) this.loadUserData();
    else this.showScreen('landing-screen');
  },

  captureRef() {
    const params = new URLSearchParams(location.search);
    if (params.get('ref')) localStorage.setItem('ref', params.get('ref'));
    if (params.get('manager')) localStorage.setItem('manager_code', params.get('manager').trim().toLowerCase());
  },

  async loadPublicPromotion() {
    try {
      const response = await fetch('/api/wallet/promotion');
      if (!response.ok) return;
      const promo = await response.json();
      if (window.wallet) {
        wallet.promotion = { ...wallet.promotion, ...promo };
        wallet.updatePromoPreview();
      }
      if (!promo.promoEnabled) return;

      const percent = Number(promo.bonusPercent || 0);
      const minimum = Number(promo.bonusMinDeposit || 0);
      const bonus = Math.floor(minimum * percent / 100);
      const total = minimum + bonus;
      const minLabel = this.formatBRL(minimum);
      const bonusLabel = this.formatBRL(bonus);
      const totalLabel = this.formatBRL(total);
      const rollover = Number(promo.rolloverMultiplier || 1);

      const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
      };
      setText('hero-promo-eyebrow', `OFERTA ATIVA · ${percent}% DE BÔNUS`);
      const title = document.getElementById('hero-promo-title');
      if (title) title.innerHTML = `Deposite<br><em>${minLabel}.</em><br>Jogue com ${totalLabel}.`;
      setText('hero-promo-copy', `Seu depósito vale mais. Deposite a partir de ${minLabel}, receba ${percent}% de bônus automático e entre no Blockerino com mais saldo para jogar.`);
      setText('hero-promo-terms', `Bônus promocional sujeito a rollover de ${rollover}x sobre o valor do bônus. Saques ficam indisponíveis até a conclusão do requisito. Consulte as regras na carteira.`);
      const cta = document.getElementById('hero-promo-cta');
      if (cta) cta.innerHTML = percent === 100
        ? 'Quero dobrar meu depósito <span>→</span>'
        : `Quero meus ${percent}% <span>→</span>`;
      const trust = document.getElementById('hero-promo-trust');
      if (trust) trust.innerHTML = `<b>+${percent}%</b> a partir de ${minLabel}`;
      setText('hero-example-deposit', minLabel);
      setText('hero-example-bonus', bonusLabel);
      setText('hero-example-total', `= ${totalLabel} PARA JOGAR`);
      setText('dashboard-promo-title', `${percent}% de bônus em depósitos a partir de ${minLabel}`);
      setText('dashboard-promo-copy', `${minLabel} viram ${totalLabel} para jogar. O progresso do rollover aparece na sua carteira.`);
      setText('deposit-promo-legal', `Oferta para depósitos a partir de ${minLabel}. Bônus de ${percent}% sujeito a rollover de ${rollover}x sobre o bônus. Saques permanecem bloqueados enquanto houver requisito pendente. Valores abaixo de ${minLabel} não recebem bônus.`);
    } catch (_) {}
  },

  formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  },

  bindForms() {
    const login = document.getElementById('login-form');
    const register = document.getElementById('register-form');
    const phoneInput = document.getElementById('reg-phone-input');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = this.formatPhone(e.target.value);
      });
    }

    if (login) login.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(login);
      try {
        const data = await this.fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
        this.setSession(data);
      } catch (_) {}
    };
    if (register) register.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(register));
      payload.referred_by = localStorage.getItem('ref') || null;
      payload.manager_code = localStorage.getItem('manager_code') || null;
      if (payload.phone) {
        payload.phone = String(payload.phone).trim();
      }
      try {
        const data = await this.fetchAPI('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        this.setSession(data);
        this.showToast('Conta criada com sucesso! Bem-vindo ao Blockerino!');
      } catch (_) {}
    };
  },

  setSession(data) {
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('token', data.token);
    this.closeModal('auth-modal');
    this.loadUserData();
  },

  async fetchAPI(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    try {
      const response = await fetch(url, { ...options, headers });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Resposta inválida do servidor.'); }
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir esta ação.');
      return data;
    } catch (error) {
      this.showToast(error.message || 'Falha de conexão.');
      throw error;
    }
  },

  async fetchUserDataOnly() {
    try { this.user = await this.fetchAPI('/api/auth/me'); this.updateBalanceDisplays(); } catch (_) {}
  },

  async loadUserData(navigate = true) {
    try {
      this.user = await this.fetchAPI('/api/auth/me');
      this.updateBalanceDisplays();
      const adminLink = document.getElementById('btn-admin-link');
      if (adminLink) adminLink.style.display = this.user.role === 'admin' ? '' : 'none';
      const managerLink = document.getElementById('btn-manager-link');
      if (managerLink) managerLink.style.display = this.user.role === 'manager' ? '' : 'none';
      const registerButton = document.getElementById('landing-register-btn');
      if (registerButton) registerButton.hidden = true;
      document.getElementById('nav-actions').style.display = '';
      if (navigate) this.showScreen('menu-screen');
      await this.loadDashboard();
    } catch (_) { this.logout(false); }
  },

  async loadDashboard() {
    if (!this.user || !document.getElementById('dashboard-name')) return;
    document.getElementById('dashboard-name').textContent = this.user.username || 'jogador';
    try {
      const data = await this.fetchAPI('/api/dashboard');
      document.getElementById('dashboard-return').textContent = this.formatBRL(data.totalPayouts || 0);
      document.getElementById('dashboard-games').textContent = data.totalGames || 0;
      document.getElementById('dashboard-best').textContent = `${Number(data.bestMultiplier || 1).toFixed(2)}x`;
      this.renderRecent(data.recent || []);
    } catch (_) {
      this.renderRecent([]);
    }
  },

  renderRecent(items) {
    const root = document.getElementById('recent-activity');
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<div class="empty-state">Sua primeira partida está a um clique de distância.</div>';
      return;
    }
    root.innerHTML = items.slice(0, 6).map(tx => {
      const positive = Number(tx.amount) > 0;
      const label = ({ bet: 'Aposta', win: 'Resgate', deposit: 'Depósito', deposit_bonus: 'Bônus promocional', bonus_unlock: 'Bônus liberado', withdraw: 'Saque', affiliate_redeem: 'Comissão' })[tx.type] || 'Movimentação';
      return `<div class="activity-item"><span class="activity-icon">${positive ? '↗' : '↙'}</span><div><b>${label}</b><span>${this.formatDate(tx.created_at)}</span></div><strong class="activity-amount" style="color:${positive ? 'var(--success)' : 'var(--text)'}">${positive ? '+' : ''}${this.formatBRL(tx.amount)}</strong></div>`;
    }).join('');
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    document.body.classList.toggle('game-active', id === 'game-screen');
    if (id === 'landing-screen' && window.game) setTimeout(() => game.initLandingDemo(), 50);
    if (id === 'game-screen' && window.game) setTimeout(() => game.init(), 20);
    if (id === 'wallet-screen' && window.wallet) wallet.loadWallet();
    scrollTo({ top: 0, behavior: 'smooth' });
  },

  goHome() { this.showScreen(this.token ? 'menu-screen' : 'landing-screen'); },
  toggleMobileMenu() { document.getElementById('nav-actions')?.classList.toggle('open'); },
  openAuth(tab = 'login') { this.toggleAuthTab(tab); document.getElementById('auth-modal')?.classList.add('active'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('active'); },

  toggleAuthTab(tab) {
    const isLogin = tab === 'login';
    const login = document.getElementById('login-form');
    const register = document.getElementById('register-form');
    if (login) login.hidden = !isLogin;
    if (register) register.hidden = isLogin;
    document.getElementById('tab-login-btn')?.classList.toggle('active', isLogin);
    document.getElementById('tab-reg-btn')?.classList.toggle('active', !isLogin);
  },

  updateBalanceDisplays() {
    if (!this.user) return;
    ['nav-balance', 'wallet-balance-val', 'dashboard-balance'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = this.formatBRL(this.user.balance || 0);
    });
  },

  logout(showMessage = true) {
    this.token = null; this.user = null; localStorage.removeItem('token');
    const nav = document.getElementById('nav-actions');
    if (nav) nav.style.display = 'none';
    const registerButton = document.getElementById('landing-register-btn');
    if (registerButton) registerButton.hidden = false;
    if (document.getElementById('landing-screen')) this.showScreen('landing-screen');
    if (showMessage) this.showToast('Sessão encerrada.');
  },

  formatBRL(cents = 0) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
  },
  formatDate(value) {
    if (value === null || value === undefined || value === '') return 'Data não informada';

    let timestamp = value;
    if (typeof value?.toDate === 'function') timestamp = value.toDate();
    else {
      const seconds = Number(value?.seconds ?? value?._seconds);
      const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
      if (Number.isFinite(seconds)) timestamp = (seconds * 1000) + (Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : 0);
      else if (typeof value === 'number') timestamp = value < 1e12 ? value * 1000 : value;
      else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const numeric = Number(value);
        timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
      }
    }

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return 'Data não informada';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date).replace(',', '');
  },
  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message;
    container.appendChild(toast); setTimeout(() => toast.remove(), 4200);
  }
};
document.addEventListener('DOMContentLoaded', () => app.init());
