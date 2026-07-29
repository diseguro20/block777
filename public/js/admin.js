const admin = {
  selectedUserIdForBalance: null,
  refreshTimer: null,
  async init() {
    if (!app.token) return this.requireLogin();
    try {
      await app.fetchUserDataOnly();
      if (app.user?.role !== 'admin') throw new Error('Sem permissão');
      await this.loadAll();
      this.bindSettings();
      this.refreshTimer = setInterval(() => this.loadOverview(true), 20000);
    } catch (_) { this.requireLogin(); }
  },
  requireLogin() {
    document.querySelector('.admin-layout').classList.add('locked');
    const auth = document.getElementById('admin-auth'); auth.hidden = false;
    document.getElementById('admin-login-form').onsubmit = async event => {
      event.preventDefault();
      try {
        const data = await app.fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('admin-email').value, password: document.getElementById('admin-password').value }) });
        if (data.user.role !== 'admin') throw new Error('Esta conta não possui acesso administrativo.');
        app.token = data.token; localStorage.setItem('token', data.token); location.reload();
      } catch (error) { app.showToast(error.message); }
    };
  },
  showView(name, button) {
    document.querySelectorAll('.admin-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.side-nav button').forEach(item => item.classList.toggle('active', item.dataset.view === name));
    document.getElementById('admin-page-title').textContent = ({ overview: 'Visão geral', players: 'Jogadores', finance: 'Financeiro', settings: 'Configurações' })[name];
    if (name === 'players') this.loadUsers();
    if (name === 'finance') { this.loadDeposits(); this.loadWithdrawals(); }
  },
  async loadAll() { await Promise.all([this.loadOverview(), this.loadUsers(), this.loadDeposits(), this.loadWithdrawals(), this.loadSettings()]); },
  async loadOverview(silent = false) {
    try {
      const data = await app.fetchAPI('/api/admin/stats');
      document.getElementById('stat-users').textContent = data.totalUsers;
      document.getElementById('stat-bets').textContent = app.formatBRL(data.totalBets);
      document.getElementById('stat-payouts').textContent = app.formatBRL(data.totalPayouts);
      document.getElementById('stat-profit').textContent = app.formatBRL(data.houseProfit);
      document.getElementById('stat-pending-deposits').textContent = data.pendingDeposits;
      document.getElementById('stat-pending-withdrawals').textContent = data.pendingWithdrawals;
    } catch (error) { if (!silent) app.showToast(error.message); }
  },
  async loadSettings() {
    const data = await app.fetchAPI('/api/admin/settings');
    this.highlightDifficulty(data.difficulty);
    const fields = { 'set-min-bet': data.minBet / 100, 'set-max-bet': data.maxBet / 100, 'set-min-deposit': data.minDeposit / 100, 'set-min-withdrawal': data.minWithdrawal / 100, 'set-level1': data.level1Rate, 'set-level2': data.level2Rate };
    Object.entries(fields).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
    document.getElementById('set-maintenance').checked = Boolean(data.maintenance);
  },
  bindSettings() {
    document.getElementById('settings-form').onsubmit = async event => {
      event.preventDefault();
      const payload = { minBet: Math.round(Number(document.getElementById('set-min-bet').value) * 100), maxBet: Math.round(Number(document.getElementById('set-max-bet').value) * 100), minDeposit: Math.round(Number(document.getElementById('set-min-deposit').value) * 100), minWithdrawal: Math.round(Number(document.getElementById('set-min-withdrawal').value) * 100), level1Rate: Number(document.getElementById('set-level1').value), level2Rate: Number(document.getElementById('set-level2').value), maintenance: document.getElementById('set-maintenance').checked };
      await app.fetchAPI('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }); app.showToast('Configurações salvas.');
    };
  },
  highlightDifficulty(level) { ['easy','balanced','strict'].forEach(name => document.getElementById(`diff-${name}-btn`)?.classList.toggle('active', name === level)); },
  async changeDifficulty(level) { await app.fetchAPI('/api/admin/settings/difficulty', { method: 'PUT', body: JSON.stringify({ level }) }); this.highlightDifficulty(level); app.showToast('Dificuldade global atualizada.'); },
  async loadUsers(search = '') {
    const data = await app.fetchAPI(`/api/admin/users?search=${encodeURIComponent(search)}`);
    const body = document.getElementById('users-table');
    body.innerHTML = data.users.length ? data.users.map(user => `<tr><td><div class="user-cell"><b>${this.escape(user.username)}</b><span>${this.escape(user.email)}</span></div></td><td class="mono">${app.formatBRL(user.balance)}</td><td><span class="badge">${user.role}</span></td><td><button class="badge badge-${user.status === 'active' ? 'success' : 'danger'}" onclick="admin.toggleStatus('${user.id}','${user.status}')">${user.status === 'active' ? 'Ativo' : 'Suspenso'}</button></td><td><button class="badge ${user.is_influencer ? 'badge-success' : ''}" onclick="admin.toggleInfluencer('${user.id}',${Boolean(user.is_influencer)})">${user.is_influencer ? 'Ativo' : 'Padrão'}</button></td><td><button class="table-action" onclick="admin.openBalanceModal('${user.id}','${this.escape(user.username)}')">Ajustar saldo</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum jogador encontrado.</td></tr>';
  },
  escape(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); },
  async toggleStatus(id, current) { if (id === 'admin_master_uid') return app.showToast('A conta principal não pode ser suspensa.'); await app.fetchAPI(`/api/admin/users/${id}`, { method:'PUT', body:JSON.stringify({ status: current === 'active' ? 'suspended' : 'active' }) }); this.loadUsers(); },
  async toggleInfluencer(id, current) { await app.fetchAPI(`/api/admin/users/${id}`, { method:'PUT', body:JSON.stringify({ is_influencer: current ? 0 : 1 }) }); this.loadUsers(); },
  openBalanceModal(id, name) { this.selectedUserIdForBalance = id; document.getElementById('balance-modal-user').textContent = name; document.getElementById('balance-modal').classList.add('active'); },
  async confirmBalanceAdjustment() {
    const amount = Math.round(Number(document.getElementById('balance-amount-input').value) * 100);
    if (!amount) return app.showToast('Informe um valor válido.');
    await app.fetchAPI(`/api/admin/users/${this.selectedUserIdForBalance}/balance`, { method:'PUT', body:JSON.stringify({ amount, type:document.getElementById('balance-type-select').value, description:document.getElementById('balance-desc-input').value }) });
    app.closeModal('balance-modal'); app.showToast('Saldo ajustado com sucesso.'); this.loadUsers(); this.loadOverview();
  },
  async loadDeposits() {
    const { deposits } = await app.fetchAPI('/api/admin/deposits'); const body = document.getElementById('deposits-table');
    body.innerHTML = deposits.length ? deposits.map(item => `<tr><td>${this.escape(item.username || item.uid)}</td><td class="mono positive">${app.formatBRL(item.amount)}</td><td>${app.formatDate(item.created_at)}</td><td class="actions"><button class="approve" onclick="admin.resolveDeposit('${item.id}','approve')">Aprovar</button><button onclick="admin.resolveDeposit('${item.id}','reject')">Recusar</button></td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nenhum depósito pendente.</td></tr>';
  },
  async resolveDeposit(id, action) { await app.fetchAPI(`/api/admin/deposits/${id}/${action}`, { method:'PUT' }); app.showToast(action === 'approve' ? 'Depósito aprovado e comissões calculadas.' : 'Depósito recusado.'); this.loadDeposits(); this.loadOverview(); },
  async loadWithdrawals() {
    const { withdrawals } = await app.fetchAPI('/api/admin/withdrawals'); const body = document.getElementById('withdrawals-table');
    body.innerHTML = withdrawals.length ? withdrawals.map(item => `<tr><td>${this.escape(item.username || item.uid)}</td><td class="mono">${app.formatBRL(item.amount)}</td><td>${this.escape(item.pix_key || '-')}</td><td class="actions"><button class="approve" onclick="admin.resolveWithdrawal('${item.id}','approve')">Pago</button><button onclick="admin.resolveWithdrawal('${item.id}','reject')">Recusar</button></td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nenhum saque pendente.</td></tr>';
  },
  async resolveWithdrawal(id, action) { await app.fetchAPI(`/api/admin/withdrawals/${id}/${action}`, { method:'PUT' }); app.showToast(action === 'approve' ? 'Saque marcado como pago.' : 'Saque recusado e saldo devolvido.'); this.loadWithdrawals(); this.loadOverview(); }
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => admin.init(), 50));
