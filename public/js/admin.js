const admin = {
  selectedUserIdForBalance: null,
  selectedManagerId: null,
  refreshTimer: null,
  searchTimer: null,
  withdrawals: [],

  async init() {
    if (!app.token) return this.requireLogin();
    try {
      await app.fetchUserDataOnly();
      if (!['admin', 'super_admin', 'tenant_admin'].includes(app.user?.role)) throw new Error('Sem permissão');
      this.configureAccess();
      await this.loadInitialView();
      this.bindSettings();
      this.bindBranding();
      this.bindBanners();
      this.bindTenants();
    } catch (_) {
      this.requireLogin();
    }
  },

  requireLogin() {
    document.querySelector('.admin-layout')?.classList.add('locked');
    const auth = document.getElementById('admin-auth');
    if (!auth) return;
    auth.hidden = false;
  },

  async handleLogin(event) {
    if (event) event.preventDefault();
    const emailEl = document.getElementById('admin-email');
    const passEl = document.getElementById('admin-password');
    const errEl = document.getElementById('admin-login-error');
    const btn = document.getElementById('admin-login-btn') || document.querySelector('#admin-login-form button');

    const email = String(emailEl?.value || '').trim();
    const password = String(passEl?.value || '');

    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (!email || !password) {
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = 'Informe e-mail e senha para entrar.';
      }
      app.showToast('Informe e-mail e senha para entrar.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Entrando...';
    }

    try {
      const data = await app.fetchAPI('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!['admin', 'super_admin', 'tenant_admin'].includes(data?.user?.role)) {
        throw new Error('Esta conta não possui acesso administrativo.');
      }
      app.persistSession(data);

      const auth = document.getElementById('admin-auth');
      if (auth) auth.hidden = true;
      document.querySelector('.admin-layout')?.classList.remove('locked');

      this.configureAccess();
      await this.loadInitialView();
      this.bindSettings();
      this.bindBranding();
      this.bindBanners();
      this.bindTenants();
      app.showToast('Login de administrador realizado com sucesso!');
    } catch (error) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
      const msg = error.message || 'E-mail ou senha incorretos.';
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = msg;
      }
      app.showToast(msg);
    }
  },

  showView(name) {
    if (name === 'tenants' && !this.isPlatformAdmin()) return;
    document.querySelectorAll('.admin-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.side-nav button').forEach(item => item.classList.toggle('active', item.dataset.view === name));
    document.getElementById('admin-page-title').textContent = ({
      overview: 'Visão geral',
      players: 'Jogadores',
      managers: 'Gerentes',
      games: 'Partidas',
      finance: 'Financeiro',
      settings: 'Configurações',
      tenants: 'Clientes white label'
    })[name];
    if (name === 'players') this.loadUsers();
    if (name === 'managers') this.loadManagers();
    if (name === 'games') this.loadGameLogs();
    if (name === 'finance') {
      this.loadDeposits();
      this.loadWithdrawals();
      this.loadGatewayStatus();
    }
    if (name === 'tenants') this.loadTenants();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async loadInitialView() {
    await Promise.all([
      this.loadOverview(),
      this.loadSettings(),
      this.loadGatewayStatus()
    ]);
  },

  isPlatformAdmin() {
    return ['admin', 'super_admin'].includes(app.user?.role);
  },

  configureAccess() {
    const platformAdmin = this.isPlatformAdmin();
    document.body.classList.toggle('platform-admin', platformAdmin);
    const tenantNav = document.getElementById('nav-tenants');
    if (tenantNav) tenantNav.hidden = !platformAdmin;
    const profileTitle = document.querySelector('.admin-profile span b');
    const profileCopy = document.querySelector('.admin-profile span small');
    if (profileTitle) profileTitle.textContent = platformAdmin ? 'Administrador da plataforma' : 'Administrador do cliente';
    if (profileCopy) profileCopy.textContent = platformAdmin ? 'Controle de operações white label' : 'Acesso isolado à sua operação';
  },

  scheduleUserSearch(value = '') {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadUsers(value), 450);
  },

  scheduleGameSearch(value = '') {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadGameLogs(value), 450);
  },

  async loadOverview(silent = false) {
    try {
      const data = await app.fetchAPI('/api/admin/stats');
      document.getElementById('stat-users').textContent = Number(data.totalUsers || 0).toLocaleString('pt-BR');
      document.getElementById('stat-bets').textContent = app.formatBRL(data.totalBets || 0);
      document.getElementById('stat-payouts').textContent = app.formatBRL(data.totalPayouts || 0);
      document.getElementById('stat-profit').textContent = app.formatBRL(data.houseProfit || 0);
      document.getElementById('stat-pending-deposits').textContent = data.pendingDeposits || 0;
      document.getElementById('stat-pending-withdrawals').textContent = data.pendingWithdrawals || 0;
      document.getElementById('stat-games').textContent = Number(data.totalGames || 0).toLocaleString('pt-BR');
      document.getElementById('stat-record').textContent = `${Number(data.wins || 0).toLocaleString('pt-BR')}V · ${Number(data.losses || 0).toLocaleString('pt-BR')}D`;
      document.getElementById('stat-blocks').textContent = Number(data.blocksPlaced || 0).toLocaleString('pt-BR');
      document.getElementById('stat-lines').textContent = Number(data.linesCleared || 0).toLocaleString('pt-BR');
      document.getElementById('stat-bonus-granted').textContent = app.formatBRL(data.totalBonusGranted || 0);
      document.getElementById('stat-bonus-locked').textContent = app.formatBRL(data.lockedBonus || 0);
      document.getElementById('stat-rollover-users').textContent = Number(data.activeRolloverUsers || 0).toLocaleString('pt-BR');
    } catch (error) {
      if (!silent) app.showToast(error.message);
    }
  },

  async loadSettings() {
    const data = await app.fetchAPI('/api/admin/settings');
    this.highlightDifficulty(data.difficulty);
    const fields = {
      'set-min-bet': data.minBet / 100,
      'set-max-bet': data.maxBet / 100,
      'set-min-deposit': data.minDeposit / 100,
      'set-min-withdrawal': data.minWithdrawal / 100,
      'set-level1': data.level1Rate,
      'set-level2': data.level2Rate,
      'set-manager-ggr': data.defaultManagerGgrRate ?? 30,
      'set-bonus-percent': data.bonusPercent,
      'set-bonus-min': data.bonusMinDeposit / 100,
      'set-rollover': data.rolloverMultiplier,
      'set-deposit-rollover': data.depositRolloverMultiplier ?? 1
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });
    const maintenance = document.getElementById('set-maintenance');
    if (maintenance) maintenance.checked = Boolean(data.maintenance);
    const promoEnabled = document.getElementById('set-promo-enabled');
    if (promoEnabled) promoEnabled.checked = Boolean(data.promoEnabled);
    const managerSignupEnabled = document.getElementById('set-manager-signup-enabled');
    if (managerSignupEnabled) managerSignupEnabled.checked = data.managerSelfRegistrationEnabled !== false;
    const brandingFields = {
      'set-brand-name': data.brandName || 'BLOCKERINO',
      'set-brand-tagline': data.brandTagline || 'PLAY SMART',
      'set-primary-color': data.primaryColor || '#c9ff43',
      'set-secondary-color': data.secondaryColor || '#9dd51b',
      'set-support-whatsapp': data.supportWhatsapp || '',
      'set-support-email': data.supportEmail || '',
      'set-logo-url': data.logoUrl || '',
      'set-site-url': data.siteUrl || ''
    };
    Object.entries(brandingFields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });
    this.populateBanners(data.banners || {});
  },

  bindSettings() {
    const form = document.getElementById('settings-form');
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const payload = {
        minBet: Math.round(Number(document.getElementById('set-min-bet').value) * 100),
        maxBet: Math.round(Number(document.getElementById('set-max-bet').value) * 100),
        minDeposit: Math.round(Number(document.getElementById('set-min-deposit').value) * 100),
        minWithdrawal: Math.round(Number(document.getElementById('set-min-withdrawal').value) * 100),
        level1Rate: Number(document.getElementById('set-level1').value),
        level2Rate: Number(document.getElementById('set-level2').value),
        defaultManagerGgrRate: Number(document.getElementById('set-manager-ggr').value),
        bonusPercent: Number(document.getElementById('set-bonus-percent').value),
        bonusMinDeposit: Math.round(Number(document.getElementById('set-bonus-min').value) * 100),
        rolloverMultiplier: Number(document.getElementById('set-rollover').value),
        depositRolloverMultiplier: Number(document.getElementById('set-deposit-rollover').value),
        promoEnabled: document.getElementById('set-promo-enabled').checked,
        managerSelfRegistrationEnabled: document.getElementById('set-manager-signup-enabled').checked,
        maintenance: document.getElementById('set-maintenance').checked
      };
      await app.fetchAPI('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      app.showToast('Configurações salvas.');
    };
  },

  bindBranding() {
    const form = document.getElementById('branding-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.onsubmit = async event => {
      event.preventDefault();
      const payload = {
        brandName: document.getElementById('set-brand-name').value,
        brandTagline: document.getElementById('set-brand-tagline').value,
        primaryColor: document.getElementById('set-primary-color').value,
        secondaryColor: document.getElementById('set-secondary-color').value,
        supportWhatsapp: document.getElementById('set-support-whatsapp').value,
        supportEmail: document.getElementById('set-support-email').value,
        logoUrl: document.getElementById('set-logo-url').value,
        siteUrl: document.getElementById('set-site-url').value
      };
      try {
        await app.fetchAPI('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
        app.showToast('Identidade white-label salva. Recarregue as páginas abertas para visualizar.');
      } catch (error) {
        app.showToast(error.message || 'Não foi possível salvar a identidade.');
      }
    };
  },

  bannerFromForm(prefix) {
    return {
      enabled: document.getElementById(`banner-${prefix}-enabled`)?.checked === true,
      imageUrl: document.getElementById(`banner-${prefix}-image`)?.value || '',
      title: document.getElementById(`banner-${prefix}-title`)?.value || '',
      copy: document.getElementById(`banner-${prefix}-copy`)?.value || '',
      ctaLabel: document.getElementById(`banner-${prefix}-cta-label`)?.value || '',
      ctaUrl: document.getElementById(`banner-${prefix}-cta-url`)?.value || ''
    };
  },

  populateBanners(banners) {
    const mapping = { top: banners.topBanner || {}, dashboard: banners.dashboardBanner || {}, affiliate: banners.affiliateBanner || {} };
    Object.entries(mapping).forEach(([prefix, banner]) => {
      const enabled = document.getElementById(`banner-${prefix}-enabled`);
      if (enabled) enabled.checked = banner.enabled === true;
      ['image', 'title', 'copy', 'cta-label', 'cta-url'].forEach(field => {
        const key = ({ image: 'imageUrl', title: 'title', copy: 'copy', 'cta-label': 'ctaLabel', 'cta-url': 'ctaUrl' })[field];
        const element = document.getElementById(`banner-${prefix}-${field}`);
        if (element) element.value = banner[key] || '';
      });
    });
  },

  bindBanners() {
    const form = document.getElementById('banners-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.onsubmit = async event => {
      event.preventDefault();
      try {
        await app.fetchAPI('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ banners: {
          topBanner: this.bannerFromForm('top'),
          dashboardBanner: this.bannerFromForm('dashboard'),
          affiliateBanner: this.bannerFromForm('affiliate')
        } }) });
        app.showToast('Banners publicados com segurança.');
      } catch (error) { app.showToast(error.message || 'Não foi possível salvar os banners.'); }
    };
  },

  bindTenants() {
    const form = document.getElementById('tenant-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    const slug = document.getElementById('tenant-slug');
    if (slug) slug.addEventListener('input', () => { slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); });
    form.onsubmit = async event => {
      event.preventDefault();
      const payload = {
        name: document.getElementById('tenant-name').value,
        slug: document.getElementById('tenant-slug').value,
        adminName: document.getElementById('tenant-admin-name').value,
        adminEmail: document.getElementById('tenant-admin-email').value,
        password: document.getElementById('tenant-admin-password').value,
        domain: document.getElementById('tenant-domains').value
      };
      try {
        const created = await app.fetchAPI('/api/platform/tenants', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        await this.loadTenants();
        app.showToast(`Operação ${created.tenant.name} criada.`);
      } catch (error) { app.showToast(error.message || 'Não foi possível criar o cliente.'); }
    };
  },

  async loadTenants() {
    if (!this.isPlatformAdmin()) return;
    const table = document.getElementById('tenants-table');
    if (!table) return;
    try {
      const data = await app.fetchAPI('/api/platform/tenants');
      const tenants = data.tenants || [];
      table.innerHTML = tenants.length ? tenants.map(tenant => {
        const slug = this.escape(tenant.slug || tenant.id);
        const active = tenant.status !== 'suspended';
        const domains = Array.isArray(tenant.domains) && tenant.domains.length ? tenant.domains.join(', ') : 'URL compartilhada';
        const base = `${location.origin}/?tenant=${encodeURIComponent(tenant.slug || tenant.id)}`;
        const adminUrl = `${location.origin}/admin/?tenant=${encodeURIComponent(tenant.slug || tenant.id)}`;
        return `<tr><td data-label="Cliente"><b>${this.escape(tenant.name || slug)}</b></td><td data-label="Identificador"><span class="mono">${slug}</span></td><td data-label="Domínios">${this.escape(domains)}</td><td data-label="Links"><a href="${base}" target="_blank" rel="noopener">Site</a> · <a href="${adminUrl}" target="_blank" rel="noopener">Admin</a></td><td data-label="Status"><span class="badge ${active ? '' : 'badge-danger'}">${active ? 'Ativo' : 'Suspenso'}</span></td><td data-label="Ação"><button class="table-action" onclick="admin.setTenantStatus('${slug}','${active ? 'suspended' : 'active'}')">${active ? 'Suspender' : 'Ativar'}</button></td></tr>`;
      }).join('') : '<tr><td colspan="6" class="empty-state">Nenhum cliente white label criado.</td></tr>';
    } catch (error) { table.innerHTML = `<tr><td colspan="6" class="empty-state">${this.escape(error.message)}</td></tr>`; }
  },

  async setTenantStatus(id, status) {
    try {
      await app.fetchAPI(`/api/platform/tenants/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      await this.loadTenants();
      app.showToast(status === 'active' ? 'Operação ativada.' : 'Operação suspensa.');
    } catch (error) { app.showToast(error.message); }
  },

  highlightDifficulty(level) {
    ['easy', 'balanced', 'strict'].forEach(name => document.getElementById(`diff-${name}-btn`)?.classList.toggle('active', name === level));
  },

  async changeDifficulty(level) {
    await app.fetchAPI('/api/admin/settings/difficulty', { method: 'PUT', body: JSON.stringify({ level }) });
    this.highlightDifficulty(level);
    app.showToast('Dificuldade global atualizada.');
  },

  formatPhone(value) {
    if (!value) return '';
    const digits = String(value).replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  },

  getWhatsAppUrl(phone, username) {
    if (!phone) return null;
    const cleanDigits = String(phone).replace(/\D/g, '');
    if (cleanDigits.length < 10) return null;
    const fullNumber = cleanDigits.startsWith('55') && cleanDigits.length >= 12 ? cleanDigits : `55${cleanDigits}`;
    const text = encodeURIComponent(`Olá ${username || 'jogador'}, tudo bem? Aqui é da equipe do Block777!`);
    return `https://wa.me/${fullNumber}?text=${text}`;
  },

  async loadUsers(search = '') {
    const body = document.getElementById('users-table');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="12" class="empty-state">Carregando leads...</td></tr>';
    let data;
    try {
      data = await app.fetchAPI(`/api/admin/users?search=${encodeURIComponent(search)}`);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="12" class="empty-state">${this.escape(error.message || 'Não foi possível carregar os leads.')}</td></tr>`;
      return;
    }
    const createdAtMillis = value => {
      if (!value) return 0;
      const seconds = Number(value.seconds ?? value._seconds);
      if (Number.isFinite(seconds)) return seconds * 1000;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const users = [...(data.users || [])].sort((a, b) => createdAtMillis(b.created_at) - createdAtMillis(a.created_at));
    body.innerHTML = users.length ? users.map(user => {
      const phoneDigits = user.phone ? String(user.phone).replace(/\D/g, '') : (user.email && user.email.includes('@block777.com') ? user.email.split('@')[0].replace(/\D/g, '') : '');
      const waUrl = this.getWhatsAppUrl(phoneDigits, user.username);
      const displayContact = phoneDigits ? `📱 ${this.formatPhone(phoneDigits)}` : this.escape(user.email);
      return `
      <tr>
        <td data-label="Jogador">
          <div class="user-cell">
            <b>${this.escape(user.username)}</b>
            <span>${displayContact}</span>
            ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn" title="Chamar no WhatsApp"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.056-1.144-.086-.282-.09-.643-.223-1.109-.425-1.951-.844-3.218-2.83-3.315-2.961-.098-.13-1.077-1.434-1.077-2.735 0-1.302.684-1.942.927-2.203.243-.261.532-.326.709-.326.178 0 .355.002.511.009.167.007.391-.063.612.468.228.548.777 1.896.845 2.034.068.138.114.3.023.479-.091.178-.137.29-.273.45-.136.16-.286.357-.409.479-.136.136-.279.284-.12.558.159.274.708 1.168 1.521 1.892 1.047.933 1.929 1.222 2.203 1.358.274.137.433.114.593-.069.16-.183.684-.799.866-1.073.183-.274.366-.228.616-.137.251.091 1.589.749 1.863.886.274.137.457.205.525.32.068.114.068.662-.076 1.067z"/></svg><span>WhatsApp</span></a>` : ''}
          </div>
        </td>
        <td data-label="Origem do cadastro">${this.renderOrigin(user.origin)}</td>
        <td data-label="Saldo" class="mono">${app.formatBRL(user.balance)}</td>
        <td data-label="Bônus" class="mono positive">${app.formatBRL(user.bonus_balance || 0)}</td>
        <td data-label="Rollover" class="mono">${app.formatBRL(user.rollover_remaining || 0)}</td>
        <td data-label="Partidas" class="mono">${Number(user.gamesPlayed || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Vitórias / derrotas"><span class="badge badge-success">${Number(user.wins || 0)}V</span> <span class="badge badge-danger">${Number(user.losses || 0)}D</span></td>
        <td data-label="Blocos" class="mono">${Number(user.blocksPlaced || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Linhas" class="mono">${Number(user.linesCleared || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Status"><button class="badge badge-${user.status === 'active' ? 'success' : 'danger'}" onclick="admin.toggleStatus('${user.id}','${user.status}')">${user.status === 'active' ? 'Ativo' : 'Suspenso'}</button></td>
        <td data-label="Influencer"><button class="badge ${user.is_influencer ? 'badge-success' : ''}" onclick="admin.toggleInfluencer('${user.id}',${Boolean(user.is_influencer)})">${user.is_influencer ? 'Ativo' : 'Padrão'}</button></td>
        <td data-label="Ação" class="actions">
          <button class="table-action" style="color:#60e49c;border-color:rgba(96,228,156,0.4)" title="Entrar na conta do usuário" onclick="admin.impersonateUser('${user.id}','${this.escape(user.username)}')">👤 Entrar</button>
          <button class="table-action" style="color:#f7b731;border-color:rgba(247,183,49,0.4)" title="Editar comissão personalizada de influenciador/afiliado" onclick="admin.openCommissionModal('${user.id}','${this.escape(user.username)}',${user.affiliate_rate ?? 'null'},${user.sub_affiliate_rate ?? 'null'})">🤝 Comissão</button>
          <button class="table-action" title="Trocar senha do usuário" onclick="admin.openPasswordModal('${user.id}','${this.escape(user.username)}')">🔑 Senha</button>
          <button class="table-action" onclick="admin.openBalanceModal('${user.id}','${this.escape(user.username)}')">Saldo</button>
          ${user.role === 'admin' ? '' : user.role === 'manager' ? `<button class="table-action" onclick="admin.showView('managers')">Gerente</button>` : `<button class="table-action" onclick="admin.activateManager('${user.id}','${this.escape(user.username)}')">Tornar gerente</button>`}
          ${user.role === 'admin' ? '' : `<button class="table-action" style="color:#ff5555;border-color:rgba(255,85,85,0.4)" onclick="admin.banUser('${user.id}','${this.escape(user.username)}')">🚫 Ban IP</button>`}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="12" class="empty-state">Nenhum jogador encontrado.</td></tr>';
  },

  openCommissionModal(id, username, level1, level2) {
    this.selectedCommissionUserId = id;
    this.selectedCommissionUsername = username;
    const nameEl = document.getElementById('commission-modal-user');
    if (nameEl) nameEl.textContent = username;
    const l1Input = document.getElementById('comm-level1-input');
    const l2Input = document.getElementById('comm-level2-input');
    if (l1Input) l1Input.value = level1 != null ? level1 : 10;
    if (l2Input) l2Input.value = level2 != null ? level2 : 2;
    const modal = document.getElementById('commission-modal');
    if (modal) modal.classList.add('active');
  },

  async saveCustomCommission() {
    if (!this.selectedCommissionUserId) return;
    const level1 = Number(document.getElementById('comm-level1-input').value);
    const level2 = Number(document.getElementById('comm-level2-input').value);
    try {
      await app.fetchAPI(`/api/admin/users/${encodeURIComponent(this.selectedCommissionUserId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          affiliate_rate: level1,
          sub_affiliate_rate: level2
        })
      });
      app.closeModal('commission-modal');
      app.showToast(`Comissão de ${this.selectedCommissionUsername || 'usuário'} atualizada para ${level1}% (Nível 1) e ${level2}% (Nível 2).`);
      await this.loadUsers();
    } catch (error) {
      app.showToast(error.message || 'Erro ao salvar comissão.');
    }
  },

  async recalculateRollovers() {
    try {
      app.showToast('Recalculando e ativando rollovers...');
      const data = await app.fetchAPI('/api/admin/recalculate-rollovers', {
        method: 'POST'
      });
      app.showToast(`Rollover atualizado com sucesso para ${data.updatedCount || 0} jogadores!`);
      await Promise.all([this.loadOverview(true), this.loadUsers()]);
    } catch (error) {
      app.showToast(error.message || 'Erro ao recalcular rollovers.');
    }
  },

  async impersonateUser(id, username) {
    try {
      const data = await app.fetchAPI(`/api/admin/users/${encodeURIComponent(id)}/impersonate`, {
        method: 'POST'
      });
      if (data && data.token) {
        app.showToast(`Abrindo conta de ${username}...`);
        const tenant = app.tenantSlug && app.tenantSlug !== 'blockerino' ? `&tenant=${encodeURIComponent(app.tenantSlug)}` : '';
        window.open(`/?impersonate_token=${encodeURIComponent(data.token)}${tenant}`, '_blank', 'noopener');
      }
    } catch (error) {
      app.showToast(error.message || 'Não foi possível entrar na conta.');
    }
  },

  openPasswordModal(id, username) {
    this.selectedPasswordUserId = id;
    this.selectedPasswordUsername = username;
    const nameEl = document.getElementById('password-modal-user');
    if (nameEl) nameEl.textContent = username;
    const passInput = document.getElementById('user-new-password');
    if (passInput) passInput.value = '';
    const modal = document.getElementById('password-modal');
    if (modal) modal.classList.add('active');
  },

  async confirmPasswordChange() {
    if (!this.selectedPasswordUserId) return;
    const passInput = document.getElementById('user-new-password');
    const newPassword = passInput ? passInput.value.trim() : '';
    if (!newPassword || newPassword.length < 8) {
      return app.showToast('A nova senha deve ter no mínimo 8 caracteres.');
    }
    try {
      await app.fetchAPI(`/api/admin/users/${encodeURIComponent(this.selectedPasswordUserId)}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword })
      });
      app.closeModal('password-modal');
      app.showToast(`Senha de ${this.selectedPasswordUsername || 'usuário'} alterada com sucesso!`);
    } catch (error) {
      app.showToast(error.message || 'Erro ao alterar senha.');
    }
  },

  async activateManager(id, name) {
    const data = await app.fetchAPI(`/api/admin/managers/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    app.showToast(`${name} agora é gerente com taxa de ${Number(data.rate || 30).toFixed(2)}%.`);
    await Promise.all([this.loadUsers(), this.loadManagers()]);
    this.showView('managers');
  },

  async loadManagers() {
    const data = await app.fetchAPI('/api/admin/managers');
    const managers = data.managers || [];
    const totalGgr = managers.reduce((total, item) => total + Number(item.ggr || 0), 0);
    const totalFee = managers.reduce((total, item) => total + Number(item.feeAccrued || 0), 0);
    const totalDue = managers.reduce((total, item) => total + Number(item.outstanding || 0), 0);
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('manager-stat-count', managers.length.toLocaleString('pt-BR'));
    setText('manager-stat-ggr', app.formatBRL(totalGgr));
    setText('manager-stat-fee', app.formatBRL(totalFee));
    setText('manager-stat-due', app.formatBRL(totalDue));
    const body = document.getElementById('managers-table');
    if (!body) return;
    body.innerHTML = managers.length ? managers.map(item => `<tr>
      <td data-label="Gerente"><div class="user-cell"><b>${this.escape(item.username)}</b><span>${this.escape(item.email)}</span></div></td>
      <td data-label="Código"><span class="badge">${this.escape(item.code || '-')}</span></td>
      <td data-label="Jogadores" class="mono">${Number(item.players || 0).toLocaleString('pt-BR')}</td>
      <td data-label="Taxa" class="mono">${Number(item.rate || 0).toFixed(2)}%</td>
      <td data-label="Apostado" class="mono">${app.formatBRL(item.totalBets || 0)}</td>
      <td data-label="Prêmios" class="mono">${app.formatBRL(item.totalPayouts || 0)}</td>
      <td data-label="GGR" class="mono ${Number(item.ggr || 0) >= 0 ? 'positive' : ''}">${app.formatBRL(item.ggr || 0)}</td>
      <td data-label="Pago" class="mono">${app.formatBRL(item.totalPaid || 0)}</td>
      <td data-label="A receber" class="mono">${app.formatBRL(item.outstanding || 0)}</td>
      <td data-label="Status"><span class="badge badge-${item.status === 'active' ? 'success' : 'danger'}">${item.status === 'active' ? 'Ativo' : 'Suspenso'}</span></td>
      <td data-label="Ações"><button class="table-action" onclick="admin.openManagerModal('${item.id}','${this.escape(item.username)}',${Number(item.rate || 0)},'${this.escape(item.code || '')}','${item.status}')">Configurar</button></td>
    </tr>`).join('') : '<tr><td colspan="11" class="empty-state">Nenhum gerente cadastrado. Use “Tornar gerente” na lista de jogadores.</td></tr>';
  },

  openManagerModal(id, name, rate, code, status) {
    this.selectedManagerId = id;
    document.getElementById('manager-modal-name').textContent = name;
    document.getElementById('manager-rate-input').value = rate;
    document.getElementById('manager-code-input').value = code;
    document.getElementById('manager-status-select').value = status;
    document.getElementById('manager-payment-input').value = '';
    document.getElementById('manager-payment-desc').value = 'Pagamento de GGR';
    document.getElementById('manager-modal').classList.add('active');
  },

  async saveManager() {
    if (!this.selectedManagerId) return;
    await app.fetchAPI(`/api/admin/managers/${this.selectedManagerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ggrRate: Number(document.getElementById('manager-rate-input').value),
        code: document.getElementById('manager-code-input').value,
        status: document.getElementById('manager-status-select').value
      })
    });
    app.closeModal('manager-modal');
    app.showToast('Gerente atualizado. A nova taxa vale para as próximas partidas.');
    await this.loadManagers();
  },

  async registerManagerPayment() {
    if (!this.selectedManagerId) return;
    const amount = Math.round(Number(document.getElementById('manager-payment-input').value) * 100);
    if (!amount) return app.showToast('Informe o valor recebido.');
    await app.fetchAPI(`/api/admin/managers/${this.selectedManagerId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, description: document.getElementById('manager-payment-desc').value })
    });
    app.closeModal('manager-modal');
    app.showToast('Pagamento de GGR registrado.');
    await this.loadManagers();
  },

  async loadGameLogs(search = '') {
    const { games } = await app.fetchAPI(`/api/admin/game-logs?search=${encodeURIComponent(search)}`);
    const body = document.getElementById('games-table');
    if (!body) return;
    body.innerHTML = games.length ? games.map(game => {
      const won = game.result === 'win' || Number(game.payout) > 0;
      return `<tr>
        <td data-label="Data">${app.formatDate(game.completed_at || game.created_at)}</td>
        <td data-label="Jogador"><div class="user-cell"><b>${this.escape(game.username || game.uid)}</b><span>${this.escape(game.email || '')}</span></div></td>
        <td data-label="Resultado"><span class="badge badge-${won ? 'success' : 'danger'}">${won ? 'Vitória' : 'Derrota'}</span></td>
        <td data-label="Aposta" class="mono">${app.formatBRL(game.amount || 0)}</td>
        <td data-label="Prêmio" class="mono ${won ? 'positive' : ''}">${app.formatBRL(game.payout || 0)}</td>
        <td data-label="GGR" class="mono">${game.manager_id ? app.formatBRL(game.manager_ggr || 0) : '-'}</td>
        <td data-label="Taxa GGR" class="mono">${game.manager_id ? app.formatBRL(game.manager_platform_fee || 0) : '-'}</td>
        <td data-label="Multiplicador" class="mono">${Number(game.multiplier || 0).toFixed(2)}x</td>
        <td data-label="Blocos" class="mono">${Number(game.blocksPlaced || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Linhas" class="mono">${Number(game.linesCleared || game.floorsReached || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Pontos" class="mono">${Number(game.score || 0).toLocaleString('pt-BR')}</td>
        <td data-label="Sessão"><span class="session-id" title="${this.escape(game.sessionId || '')}">${this.escape(String(game.sessionId || '-').slice(0, 8))}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="12" class="empty-state">Nenhuma partida registrada.</td></tr>';
  },

  async loadGatewayStatus() {
    try {
      const data = await app.fetchAPI('/api/wallet/gateway/status');
      const ready = data.configured && data.webhookConfigured;
      const status = document.getElementById('gateway-status');
      const mini = document.getElementById('gateway-status-mini');
      const webhook = document.getElementById('gateway-webhook-mini');
      const description = document.getElementById('gateway-description');
      if (status) {
        status.textContent = ready ? 'Conectado' : data.configured ? 'Webhook pendente' : 'Chaves pendentes';
        status.className = `badge badge-${ready ? 'success' : 'pending'}`;
      }
      if (mini) mini.textContent = ready ? 'CONECTADO' : 'PENDENTE';
      if (webhook) webhook.textContent = data.webhookConfigured ? 'webhook com validação ativa' : 'webhook não configurado';
      if (description) description.textContent = ready
        ? 'Gateway conectado. Depósitos PIX serão confirmados e creditados automaticamente.'
        : 'A integração está instalada. Adicione as chaves oficiais da conta Vizzion Pay para ativar as cobranças.';
    } catch (_) {}
  },

  renderOrigin(origin = {}) {
    const parts = [];
    if (origin.affiliate) {
      const label = origin.affiliate.type === 'influencer' ? 'Influenciador' : 'Afiliado';
      const code = origin.affiliate.code ? ` · ${this.escape(origin.affiliate.code)}` : '';
      parts.push(`<span class="origin-line origin-affiliate"><small>${label}</small><b>${this.escape(origin.affiliate.username)}</b><em>${code}</em></span>`);
    }
    if (origin.manager) {
      const code = origin.manager.code ? ` · ${this.escape(origin.manager.code)}` : '';
      parts.push(`<span class="origin-line origin-manager"><small>Gerente</small><b>${this.escape(origin.manager.username)}</b><em>${code}</em></span>`);
    }
    return parts.length ? `<span class="origin-stack">${parts.join('')}</span>` : '<span class="origin-direct">Direto</span>';
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },

  async toggleStatus(id, current) {
    if (id === 'admin_master_uid') return app.showToast('A conta principal não pode ser suspensa.');
    await app.fetchAPI(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ status: current === 'active' ? 'suspended' : 'active' }) });
    this.loadUsers();
  },

  async toggleInfluencer(id, current) {
    await app.fetchAPI(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ is_influencer: current ? 0 : 1 }) });
    this.loadUsers();
  },

  openBalanceModal(id, name) {
    this.selectedUserIdForBalance = id;
    document.getElementById('balance-modal-user').textContent = name;
    document.getElementById('balance-modal').classList.add('active');
  },

  async confirmBalanceAdjustment() {
    const amount = Math.round(Number(document.getElementById('balance-amount-input').value) * 100);
    if (!amount) return app.showToast('Informe um valor válido.');
    await app.fetchAPI(`/api/admin/users/${this.selectedUserIdForBalance}/balance`, {
      method: 'PUT',
      body: JSON.stringify({
        amount,
        type: document.getElementById('balance-type-select').value,
        description: document.getElementById('balance-desc-input').value
      })
    });
    app.closeModal('balance-modal');
    app.showToast('Saldo ajustado com sucesso.');
    this.loadUsers();
    this.loadOverview();
  },

  async loadDeposits() {
    const data = await app.fetchAPI('/api/admin/deposits');
    const pending = data.pending || [];
    const approved = data.approved || [];
    const summary = data.summary || {};
    const pendingBody = document.getElementById('deposits-table');
    const approvedBody = document.getElementById('approved-deposits-table');

    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText('deposit-approved-count', Number(summary.approvedCount || approved.length).toLocaleString('pt-BR'));
    setText('deposit-approved-amount', `${app.formatBRL(summary.approvedAmount || 0)} recebidos`);
    setText('deposit-approved-bonus', app.formatBRL(summary.approvedBonus || 0));
    setText('deposit-pending-count', Number(summary.pendingCount || pending.length).toLocaleString('pt-BR'));
    setText('deposit-pending-amount', `${app.formatBRL(summary.pendingAmount || 0)} aguardando pagamento`);

    if (approvedBody) {
      approvedBody.innerHTML = approved.length ? approved.map(item => `<tr>
        <td data-label="Jogador"><div class="user-cell"><b>${this.escape(item.username || item.uid)}</b><span>${this.escape(item.email || '')}</span></div></td>
        <td data-label="Origem">${this.renderOrigin(item.origin)}</td>
        <td data-label="Depósito" class="mono positive">${app.formatBRL(item.amount)}</td>
        <td data-label="Bônus" class="mono positive">${app.formatBRL(item.bonusAmount || 0)}</td>
        <td data-label="Total creditado" class="mono">${app.formatBRL(Number(item.creditedAmount || 0) || (Number(item.amount || 0) + Number(item.bonusAmount || 0)))}</td>
        <td data-label="Gateway"><span class="badge">${this.escape(item.gateway || 'manual')}</span></td>
        <td data-label="Gerado em">${app.formatDate(item.created_at)}</td>
        <td data-label="Aprovado em">${app.formatDate(item.approved_at || item.created_at)}</td>
        <td data-label="Status"><span class="badge badge-success">Aprovado</span></td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty-state">Nenhum depósito aprovado.</td></tr>';
    }

    if (pendingBody) {
      pendingBody.innerHTML = pending.length ? pending.map(item => `<tr>
        <td data-label="Jogador"><div class="user-cell"><b>${this.escape(item.username || item.uid)}</b><span>${this.escape(item.email || '')}</span></div></td>
        <td data-label="Origem">${this.renderOrigin(item.origin)}</td>
        <td data-label="Depósito" class="mono positive">${app.formatBRL(item.amount)}</td>
        <td data-label="Bônus previsto" class="mono positive">${app.formatBRL(item.bonusAmount || 0)}</td>
        <td data-label="Total previsto" class="mono">${app.formatBRL(Number(item.amount || 0) + Number(item.bonusAmount || 0))}</td>
        <td data-label="Gateway"><span class="badge">${this.escape(item.gateway || 'manual')}</span></td>
        <td data-label="Gerado em">${app.formatDate(item.created_at)}</td>
        <td data-label="Status"><span class="badge badge-pending">Pendente</span></td>
        <td data-label="Ações" class="actions"><button class="approve" onclick="admin.resolveDeposit('${item.id}','approve')">Aprovar</button><button onclick="admin.resolveDeposit('${item.id}','reject')">Recusar</button></td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty-state">Nenhum depósito pendente.</td></tr>';
    }
  },

  async resolveDeposit(id, action) {
    await app.fetchAPI(`/api/admin/deposits/${id}/${action}`, { method: 'PUT' });
    app.showToast(action === 'approve' ? 'Depósito aprovado e comissões calculadas.' : 'Depósito recusado.');
    this.loadDeposits();
    this.loadOverview();
  },

  async loadWithdrawals() {
    try {
      const { withdrawals = [], summary = {} } = await app.fetchAPI('/api/admin/withdrawals');
      this.withdrawals = withdrawals;
      ['pending', 'approved', 'rejected'].forEach(status => {
        const values = summary[status] || { count: 0, amount: 0 };
        const count = document.getElementById(`withdrawal-${status}-count`);
        const amount = document.getElementById(`withdrawal-${status}-amount`);
        if (count) count.textContent = Number(values.count || 0).toLocaleString('pt-BR');
        if (amount) amount.textContent = `${app.formatBRL(values.amount || 0)} ${status === 'pending' ? 'aguardando' : status === 'approved' ? 'aprovados' : 'devolvidos'}`;
      });
      this.renderWithdrawals();
    } catch (error) {
      app.showToast(error.message || 'Não foi possível carregar os saques.');
    }
  },

  renderWithdrawals() {
    const pendingBody = document.getElementById('withdrawals-table');
    const historyBody = document.getElementById('withdrawals-history-table');
    const pending = this.withdrawals.filter(item => item.status === 'pending');
    const filter = document.getElementById('withdrawal-status-filter')?.value || 'all';
    const history = this.withdrawals.filter(item => item.status !== 'pending' && (filter === 'all' || item.status === filter));

    if (pendingBody) pendingBody.innerHTML = pending.length ? pending.map(item => `<tr>
      <td data-label="Jogador"><div class="user-cell"><b>${this.escape(item.username || item.uid)}</b><span>${this.escape(item.email || item.phone || '')}</span></div></td>
      <td data-label="Origem">${this.renderOrigin(item.origin)}</td>
      <td data-label="Valor" class="mono positive">${app.formatBRL(item.amount)}</td>
      <td data-label="Chave PIX" class="pix-key-cell">${this.escape(item.pix_key || '-')}</td>
      <td data-label="Solicitado em">${app.formatDate(item.created_at)}</td>
      <td data-label="Ações" class="actions"><button class="approve" onclick="admin.resolveWithdrawal('${item.id}','approve')">Confirmar pagamento</button><button onclick="admin.resolveWithdrawal('${item.id}','reject')">Recusar e devolver</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum saque pendente.</td></tr>';

    if (historyBody) historyBody.innerHTML = history.length ? history.map(item => {
      const approved = item.status === 'approved';
      const detail = approved ? (item.admin_note || 'Pagamento confirmado') : (item.rejection_reason || 'Saldo devolvido');
      return `<tr>
        <td data-label="Jogador"><div class="user-cell"><b>${this.escape(item.username || item.uid)}</b><span>${this.escape(item.email || item.phone || '')}</span></div></td>
        <td data-label="Origem">${this.renderOrigin(item.origin)}</td>
        <td data-label="Valor" class="mono">${app.formatBRL(item.amount)}</td>
        <td data-label="Chave PIX" class="pix-key-cell">${this.escape(item.pix_key || '-')}</td>
        <td data-label="Solicitado em">${app.formatDate(item.created_at)}</td>
        <td data-label="Processado em">${app.formatDate(item.processed_at || item.approved_at || item.rejected_at)}</td>
        <td data-label="Status / motivo"><span class="badge ${approved ? 'badge-success' : 'badge-danger'}">${approved ? 'Pago' : 'Recusado'}</span><small class="withdrawal-detail">${this.escape(detail)}</small></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty-state">Nenhum saque processado neste filtro.</td></tr>';
  },

  async resolveWithdrawal(id, action) {
    const isApproval = action === 'approve';
    if (isApproval && !confirm('Confirma que o PIX deste saque já foi pago ao jogador? Esta ação não envia o PIX automaticamente.')) return;
    let reason = '';
    if (!isApproval) {
      reason = prompt('Informe o motivo da recusa. O valor será devolvido automaticamente ao saldo do jogador:', 'Dados PIX inválidos') || '';
      if (!reason.trim()) return;
      if (!confirm('Recusar este saque e devolver o valor ao saldo do jogador?')) return;
    }
    try {
      await app.fetchAPI(`/api/admin/withdrawals/${id}/${action}`, { method: 'PUT', body: JSON.stringify(isApproval ? { note: 'PIX confirmado pelo administrador' } : { reason }) });
      app.showToast(isApproval ? 'Pagamento confirmado e registrado no histórico.' : 'Saque recusado e saldo devolvido uma única vez.');
      await Promise.all([this.loadWithdrawals(), this.loadOverview()]);
    } catch (error) {
      app.showToast(error.message || 'Não foi possível processar o saque.');
    }
  },

  async banUser(id, name) {
    if (!confirm(`Tem certeza que deseja BANIR PERMANENTEMENTE o jogador "${name}" e bloquear o IP dele? O saldo será zerado e o IP ficará bloqueado.`)) return;
    try {
      const data = await app.fetchAPI('/api/admin/ban-user-ip', {
        method: 'POST',
        body: JSON.stringify({ userId: id })
      });
      app.showToast(`Jogador ${name} banido com sucesso! IP ${data.bannedIP || 'bloqueado'}.`);
      await this.loadUsers();
    } catch (err) {
      app.showToast(err.message || 'Erro ao banir jogador.');
    }
  }
};

window.admin = admin;
document.addEventListener('DOMContentLoaded', () => setTimeout(() => admin.init(), 50));
