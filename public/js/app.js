const app = {
  tenantSlug: (() => {
    const requested = new URLSearchParams(location.search).get('tenant');
    const sharedHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.vercel.app');
    if (requested) localStorage.setItem('tenant_slug', requested.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    return (requested || (sharedHost ? 'blockerino' : '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
  })(),
  token: null,
  user: null,

  init() {
    const sessionScope = this.tenantSlug || `host:${location.hostname}`;
    this.token = localStorage.getItem(`token:${sessionScope}`) || (this.tenantSlug === 'blockerino' || !this.tenantSlug ? localStorage.getItem('token') : null);
    this.syncViewport();
    window.addEventListener('resize', () => this.syncViewport(), { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.syncViewport(), 120), { passive: true });
    window.visualViewport?.addEventListener('resize', () => this.syncViewport(), { passive: true });
    window.visualViewport?.addEventListener('scroll', () => this.syncViewport(), { passive: true });
    this.captureRef();
    this.preserveTenantLinks();
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

  preserveTenantLinks() {
    if (!this.tenantSlug || this.tenantSlug === 'blockerino') return;
    document.querySelectorAll('a[href^="./"],a[href^="/"]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.origin);
      if (url.origin !== location.origin) return;
      url.searchParams.set('tenant', this.tenantSlug);
      link.href = `${url.pathname}${url.search}${url.hash}`;
    });
  },

  syncViewport() {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
    const offsetTop = Math.round(viewport?.offsetTop || 0);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-offset-top', `${offsetTop}px`);
  },

  captureRef() {
    const params = new URLSearchParams(location.search);
    if (params.get('ref')) localStorage.setItem('ref', params.get('ref'));
    if (params.get('manager')) localStorage.setItem('manager_code', params.get('manager').trim().toLowerCase());
    const impersonateToken = params.get('impersonate_token') || params.get('auth_token');
    if (impersonateToken) {
      localStorage.setItem(`token:${this.tenantSlug || `host:${location.hostname}`}`, impersonateToken);
      if (this.tenantSlug === 'blockerino') localStorage.setItem('token', impersonateToken);
      this.token = impersonateToken;
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  },

  async loadPublicPromotion() {
    try {
      const response = await fetch('/api/wallet/promotion', { headers: { 'X-Tenant-Slug': this.tenantSlug } });
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
      const btn = login.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
      try {
        const payload = Object.fromEntries(form);
        const data = await this.fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
        this.setSession(data);
        this.showToast('Login realizado com sucesso!');
      } catch (e) {
        this.showToast(e.message || 'Falha ao entrar.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
      }
    };
    if (register) register.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(register));
      const btn = register.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }
      payload.referred_by = localStorage.getItem('ref') || null;
      payload.manager_code = localStorage.getItem('manager_code') || null;
      if (payload.phone) {
        payload.phone = String(payload.phone).trim();
      }
      try {
        const data = await this.fetchAPI('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        this.setSession(data);
        this.showToast('Conta criada com sucesso! Bem-vindo ao Blockerino!');
      } catch (e) {
        this.showToast(e.message || 'Falha ao criar conta.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Criar minha conta'; }
      }
    };
  },

  setSession(data) {
    if (data.user?.tenant_id) {
      this.tenantSlug = data.user.tenant_id;
      localStorage.setItem('tenant_slug', this.tenantSlug);
    }
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem(`token:${this.tenantSlug}`, data.token);
    if (this.tenantSlug === 'blockerino') localStorage.setItem('token', data.token);
    this.closeModal('auth-modal');
    this.loadUserData();
  },

  async fetchAPI(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(this.tenantSlug ? { 'X-Tenant-Slug': this.tenantSlug } : {}), ...(options.headers || {}) };
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
      if (adminLink) adminLink.style.display = ['admin', 'super_admin', 'tenant_admin'].includes(this.user.role) ? '' : 'none';
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
    this.syncPlayerChrome(id);
    if (id === 'landing-screen' && window.game) setTimeout(() => game.initLandingDemo(), 50);
    if (id === 'game-screen' && window.game) setTimeout(() => game.init(), 20);
    if (id === 'wallet-screen' && window.wallet) wallet.loadWallet();
    const behavior = id === 'game-screen' ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, left: 0, behavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  },

  goHome() { this.showScreen(this.token ? 'menu-screen' : 'landing-screen'); },
  syncPlayerChrome(screenId) {
    const nav = document.getElementById('player-bottom-nav');
    if (!nav) return;
    nav.hidden = !this.token || screenId === 'landing-screen' || screenId === 'game-screen';
    nav.querySelectorAll('[data-player-tab]').forEach(item => item.classList.remove('active'));
    const active = screenId === 'wallet-screen' ? 'wallet' : screenId === 'menu-screen' ? 'play' : '';
    if (active) nav.querySelector(`[data-player-tab="${active}"]`)?.classList.add('active');
  },
  openWalletTab(tab = 'deposit') {
    this.showScreen('wallet-screen');
    window.setTimeout(() => {
      window.wallet?.toggleTab(tab);
      const nav = document.getElementById('player-bottom-nav');
      nav?.querySelectorAll('[data-player-tab]').forEach(item => item.classList.remove('active'));
      nav?.querySelector(`[data-player-tab="${tab === 'withdraw' ? 'withdraw' : 'wallet'}"]`)?.classList.add('active');
    }, 30);
  },
  showPlayerProfile() {
    this.showScreen('menu-screen');
    this.loadDashboard();
    document.getElementById('profile-modal')?.classList.add('active');
    const nav = document.getElementById('player-bottom-nav');
    nav?.querySelectorAll('[data-player-tab]').forEach(item => item.classList.remove('active'));
    nav?.querySelector('[data-player-tab="profile"]')?.classList.add('active');
  },
  closePlayerProfile() {
    this.closeModal('profile-modal');
    this.syncPlayerChrome('menu-screen');
  },
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
    ['nav-balance', 'wallet-balance-val', 'dashboard-balance', 'profile-balance-value'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = this.formatBRL(this.user.balance || 0);
    });
    const avatar = document.querySelector('.avatar');
    const initial = String(this.user.username || 'J').trim().charAt(0).toUpperCase();
    if (avatar) avatar.textContent = initial;
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) profileAvatar.textContent = initial;
  },

  logout(showMessage = true) {
    this.token = null; this.user = null; localStorage.removeItem(`token:${this.tenantSlug}`);
    if (this.tenantSlug === 'blockerino') localStorage.removeItem('token');
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
