// Controller Principal da Plataforma BLOCK777

async function fetchAPI(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(endpoint, options);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { error: text || 'Resposta inválida do servidor' };
    }

    if (!res.ok) {
      throw new Error(json.error || json.message || 'Erro na requisição');
    }
    return json;
  } catch (err) {
    console.warn(`API Error [${endpoint}]:`, err.message);
    app.showToast(err.message || 'Erro de conexão com o servidor', 'danger');
    throw err;
  }
}

const app = {
  token: localStorage.getItem('token'),
  user: null,

  init() {
    // Captura parâmetros de indicação ref / subref da URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const subref = urlParams.get('subref');
    if (ref) localStorage.setItem('ref_code', ref);
    if (subref) localStorage.setItem('subref_code', subref);

    // Verifica autenticação inicial
    if (this.token) {
      this.loadUserData();
    } else {
      this.showScreen('landing-screen');
    }

    this.bindForms();
  },

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }

    const navActions = document.getElementById('nav-actions');
    if (navActions) {
      navActions.style.display = this.token ? 'flex' : 'none';
    }
  },

  toggleAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-reg-btn');

    if (tab === 'login') {
      loginForm.style.display = 'block';
      regForm.style.display = 'none';
      tabLogin.className = 'btn btn-primary';
      tabReg.className = 'btn btn-wood';
    } else {
      loginForm.style.display = 'none';
      regForm.style.display = 'block';
      tabLogin.className = 'btn btn-wood';
      tabReg.className = 'btn btn-success';
    }
  },

  async loadUserData() {
    try {
      const data = await fetchAPI('/api/auth/me');
      this.user = data.user || data;
      this.updateBalanceDisplays(this.user.balance || 0);

      const adminBtn = document.getElementById('btn-admin-link');
      if (adminBtn) {
        adminBtn.style.display = (this.user.role === 'admin' || this.user.is_admin) ? 'block' : 'none';
      }

      if (document.getElementById('landing-screen').classList.contains('active')) {
        this.showScreen('menu-screen');
      }
    } catch (e) {
      this.logout();
    }
  },

  updateBalanceDisplays(centavos) {
    const brl = (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const navVal = document.getElementById('nav-balance');
    const walletVal = document.getElementById('wallet-balance-val');
    if (navVal) navVal.innerText = brl;
    if (walletVal) walletVal.innerText = brl;
  },

  bindForms() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
          const res = await fetchAPI('/api/auth/login', 'POST', { email, password });
          this.token = res.token;
          localStorage.setItem('token', res.token);
          this.showToast('Login efetuado com sucesso! 🚀', 'success');
          await this.loadUserData();
          this.showScreen('menu-screen');
        } catch (e) {}
      });
    }

    const regForm = document.getElementById('register-form');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const referred_by = localStorage.getItem('ref_code');
        const sub_referred_by = localStorage.getItem('subref_code');

        try {
          const res = await fetchAPI('/api/auth/register', 'POST', {
            username,
            email,
            password,
            referred_by,
            sub_referred_by
          });
          this.token = res.token;
          localStorage.setItem('token', res.token);
          this.showToast('Conta criada com sucesso! Bônus de 300% Ativado 🌽', 'success');
          await this.loadUserData();
          this.showScreen('menu-screen');
        } catch (e) {}
      });
    }
  },

  logout() {
    localStorage.removeItem('token');
    this.token = null;
    this.user = null;
    this.showScreen('landing-screen');
    this.showToast('Você saiu da sua conta', 'info');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
