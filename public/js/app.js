const app = {
  token: localStorage.getItem('token'),
  user: null,

  init() {
    this.captureRefs();
    this.setupListeners();

    // Apenas gerencia navegação por telas de SPA se estiver na index.html
    const isIndexPage = document.getElementById('landing-screen') || document.getElementById('menu-screen');
    if (!isIndexPage) {
      if (this.token) {
        this.fetchUserDataOnly();
      }
      return;
    }

    if (this.token) {
      this.loadUserData();
    } else {
      this.showScreen('landing-screen');
    }
  },

  async fetchUserDataOnly() {
    try {
      this.user = await this.fetchAPI('/api/auth/me');
      this.updateBalanceDisplays();
    } catch (e) {}
  },

  captureRefs() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('ref')) localStorage.setItem('ref', urlParams.get('ref'));
    if (urlParams.has('subref')) localStorage.setItem('subref', urlParams.get('subref'));
  },

  toggleAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-reg-btn');

    if (tab === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (regForm) regForm.style.display = 'none';
      if (loginBtn) loginBtn.className = 'btn btn-primary';
      if (regBtn) regBtn.className = 'btn btn-wood';
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'block';
      if (loginBtn) loginBtn.className = 'btn btn-wood';
      if (regBtn) regBtn.className = 'btn btn-primary';
    }
  },

  showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    if (screens.length > 1) {
      screens.forEach(s => s.classList.remove('active'));
      const screen = document.getElementById(screenId);
      if (screen) screen.classList.add('active');
    }

    const navActions = document.getElementById('nav-actions');
    if (navActions) {
      navActions.style.display = this.token ? 'flex' : 'none';
    }

    if (screenId === 'landing-screen' && window.game) {
      setTimeout(() => window.game.initLandingDemo(), 100);
    }

    if (screenId === 'game-screen' && window.game) {
      window.game.init();
    }

    if (screenId === 'wallet-screen' && window.wallet) {
      window.wallet.loadWallet();
    }
  },

  async fetchAPI(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Erro de comunicação com o servidor. Verifique as credenciais no Vercel.');
      }

      if (!res.ok) throw new Error(data.error || 'Erro na requisição');
      return data;
    } catch (err) {
      this.showToast(err.message);
      throw err;
    }
  },

  async loadUserData() {
    try {
      this.user = await this.fetchAPI('/api/auth/me');
      this.updateBalanceDisplays();

      const adminBtn = document.getElementById('btn-admin-link');
      if (adminBtn) {
        adminBtn.style.display = this.user.role === 'admin' ? 'block' : 'none';
      }

      this.showScreen('menu-screen');
    } catch (e) {
      this.logout();
    }
  },

  updateBalanceDisplays() {
    if (!this.user) return;
    const str = this.formatBRL(this.user.balance);
    const navBal = document.getElementById('nav-balance');
    const wallBal = document.getElementById('wallet-balance-val');

    if (navBal) navBal.textContent = str;
    if (wallBal) wallBal.textContent = str;
  },

  formatBRL(centavos) {
    if (isNaN(centavos)) centavos = 0;
    return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
  },

  setupListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const data = await this.fetchAPI('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: loginForm['login-email'].value,
              password: loginForm['login-password'].value
            })
          });
          this.token = data.token;
          localStorage.setItem('token', data.token);
          this.showToast('🎉 Login realizado com sucesso! Bem-vindo.');
          await this.loadUserData();
        } catch (e) {}
      };
    }

    const regForm = document.getElementById('register-form');
    if (regForm) {
      regForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const data = await this.fetchAPI('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              username: regForm['reg-username'].value,
              email: regForm['reg-email'].value,
              password: regForm['reg-password'].value,
              referred_by: localStorage.getItem('ref') || null,
              sub_referred_by: localStorage.getItem('subref') || null
            })
          });
          this.token = data.token;
          localStorage.setItem('token', data.token);
          this.showToast('🎁 Conta criada! Bônus de 300% pronto para ativação.');
          await this.loadUserData();
        } catch (e) {}
      };
    }
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    this.showScreen('landing-screen');
    this.showToast('Sessão encerrada com sucesso.');
  },

  showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
