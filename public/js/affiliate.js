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
    if (data.user?.tenant_id) {
      app.tenantSlug = data.user.tenant_id;
      localStorage.setItem('tenant_slug', app.tenantSlug);
    }
    app.token = data.token;
    app.user = data.user;
    localStorage.setItem(`token:${app.tenantSlug || `host:${location.hostname}`}`, data.token);
    if (app.tenantSlug === 'blockerino') localStorage.setItem('token', data.token);
    sessionStorage.setItem('affiliate-auth-message', message);
    location.reload();
  },

  async loadAffiliateStats() {
    const data = await app.fetchAPI('/api/affiliate/stats');
    document.getElementById('ref-link').value = data.referralLink;
    document.getElementById('stat-level1').textContent = data.level1Count;
    document.getElementById('stat-level2').textContent = data.level2Count;
    document.getElementById('stat-total').textContent = data.totalReferred;
    const depEl = document.getElementById('stat-deposited');
    if (depEl) depEl.textContent = app.formatBRL(data.totalDeposited || 0);
    document.getElementById('stat-commissions').textContent = app.formatBRL(data.totalCommissions);
    document.getElementById('stat-balance').textContent = app.formatBRL(data.affiliateBalance);
    document.getElementById('nav-balance').textContent = app.formatBRL(data.affiliateBalance);
    document.getElementById('rate-level1').textContent = `${data.rates.level1}% por depósito`;
    document.getElementById('rate-level2').textContent = `${data.rates.level2}% por depósito`;

    const leadsBody = document.getElementById('affiliate-leads-history');
    if (leadsBody) {
      const leads = data.leads || [];
      leadsBody.innerHTML = leads.length
        ? leads.map((lead) => {
            const rawPhone = String(lead.phone || lead.email || '').replace(/\D/g, '');
            const hasPhone = rawPhone.length >= 10 && rawPhone.length <= 13;
            const waNumber = hasPhone ? (rawPhone.startsWith('55') ? rawPhone : '55' + rawPhone) : '';
            const waLink = waNumber ? `<a href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;color:#25d366;font-weight:600;font-size:11px;background:rgba(37,211,102,0.1);padding:3px 8px;border-radius:4px;text-decoration:none">💬 WhatsApp</a>` : '<span style="color:var(--color-text-muted);font-size:11px">—</span>';
            const depHighlight = Number(lead.totalDeposited || 0) > 0 ? 'style="color:#60e49c;font-weight:700"' : '';

            return `<tr>
              <td>
                <b>${this.escape(lead.username)}</b><br>
                <small style="color:var(--color-text-muted)">${this.escape(lead.phone || lead.email)}</small>
              </td>
              <td><span class="badge ${lead.level === 1 ? 'badge-success' : ''}">Nível ${lead.level}</span></td>
              <td ${depHighlight}><b>${app.formatBRL(lead.totalDeposited || 0)}</b></td>
              <td>${app.formatDate(lead.created_at)}</td>
              <td>${waLink}</td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="5" class="empty-state">Nenhum indicado cadastrado ainda. Compartilhe seu link para começar.</td></tr>';
    }

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

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
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
