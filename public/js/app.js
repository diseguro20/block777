const app = {
    token: localStorage.getItem('token'),
    user: null,

    init() {
        this.captureRefs();
        if (this.token) {
            this.loadUserData();
        } else {
            this.showScreen('auth-screen');
        }
        this.setupListeners();
    },

    captureRefs() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('ref')) localStorage.setItem('ref', urlParams.get('ref'));
        if (urlParams.has('subref')) localStorage.setItem('subref', urlParams.get('subref'));
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
        
        if (screenId === 'wallet-screen' && window.wallet) {
            wallet.loadWallet();
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Error');
            return data;
        } catch (err) {
            this.toast(err.message);
            throw err;
        }
    },

    async loadUserData() {
        try {
            this.user = await this.fetchAPI('/api/auth/me');
            this.updateBalances(this.user.balance);
            this.showScreen('menu-screen');
        } catch (e) {
            this.logout();
        }
    },

    updateBalances(centavos) {
        const str = this.formatBRL(centavos);
        ['nav-balance', 'menu-balance', 'wallet-balance'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = str;
        });
    },

    formatBRL(centavos) {
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
                    this.loadUserData();
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
                            ref: localStorage.getItem('ref') || null,
                            subref: localStorage.getItem('subref') || null
                        })
                    });
                    this.token = data.token;
                    localStorage.setItem('token', data.token);
                    this.loadUserData();
                } catch (e) {}
            };
        }
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('token');
        this.showScreen('auth-screen');
    },

    toast(msg) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
