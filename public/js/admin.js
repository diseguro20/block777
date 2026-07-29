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
    } catch (_) {
      this.requireLogin();
    }
  },

  requireLogin() {
    document.querySelector('.admin-layout')?.classList.add('locked');
    const auth = document.getElementById('admin-auth');
    if (!auth) return;
    auth.hidden = false;
    document.getElementById('admin-login-form').onsubmit = async event => {
      event.preventDefault();
      try {
        const data = await app.fetchAPI('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('admin-email').value,
            password: document.getElementById('admin-password').value
          })
        });
        if (data.user.role !== 'admin') throw new Error('Esta conta não possui acesso administrativo.');
        app.token = data.token;
        localStorage.setItem('token', data.token);
        location.reload();
      } catch (error) {
        app.showToast(error.message);
      }
    };
  },

  showView(name) {
    document.querySelectorAll('.admin-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.side-nav button').forEach(item => item.classList.toggle('active', item.dataset.view === name));
    document.getElementById('admin-page-title').textContent = ({
      overview: 'Visão geral',
      players: 'Jogadores',
      games: 'Partidas',
      finance: 'Financeiro',
      settings: 'Configurações'
    })[name];
    if (name === 'players') this.loadUsers();
    if (name === 'games') this.loadGameLogs();
    if (name === 'finance') {
      this.loadDeposits();
      this.loadWithdrawals();
      this.loadGatewayStatus();
    }
  },

  async loadAll() {
    await Promise.all([
      this.loadOverview(),
      this.loadUsers(),
      this.loadGameLogs(),
      this.loadDeposits(),
      this.loadWithdrawals(),
      this.loadSettings(),
      this.loadGatewayStatus()
    ]);
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
      'set-level2': data.level2Rate
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });
    const maintenance = document.getElementById('set-maintenance');
    if (maintenance) maintenance.checked = Boolean(data.maintenance);
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
        maintenance: document.getElementById('set-maintenance').checked
      };
      await app.fetchAPI('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      app.showToast('Configurações salvas.');
    };
  },

  highlightDifficulty(level) {
    ['easy', 'balanced', 'strict'].forEach(name => document.getElementById(`diff-${name}-btn`)?.classList.toggle('active', name === level));
  },

  async changeDifficulty(level) {
    await app.fetchAPI('/api/admin/settings/difficulty', { method: 'PUT', body: JSON.stringify({ level }) });
    this.highlightDifficulty(level);
    app.showToast('Dificuldade global atualizada.');
  },

  async loadUsers(search = '') {
    const data = await app.fetchAPI(`/api/admin/users?search=${encodeURIComponent(search)}`);
    const body = document.getElementById('users-table');
    if (!body) return;
    body.innerHTML = data.users.length ? data.users.map(user => `
      <tr>
        <td><div class="user-cell"><b>${this.escape(user.username)}</b><span>${this.escape(user.email)}</span></div></td>
        <td class="mono">${app.formatBRL(user.balance)}</td>
        <td class="mono">${Number(user.gamesPlayed || 0).toLocaleString('pt-BR')}</td>
        <td><span class="badge badge-success">${Number(user.wins || 0)}V</span> <span class="badge badge-danger">${Number(user.losses || 0)}D</span></td>
        <td class="mono">${Number(user.blocksPlaced || 0).toLocaleString('pt-BR')}</td>
        <td class="mono">${Number(user.linesCleared || 0).toLocaleString('pt-BR')}</td>
        <td><button class="badge badge-${user.status === 'active' ? 'success' : 'danger'}" onclick="admin.toggleStatus('${user.id}','${user.status}')">${user.status === 'active' ? 'Ativo' : 'Suspenso'}</button></td>
        <td><button class="badge ${user.is_influencer ? 'badge-success' : ''}" onclick="admin.toggleInfluencer('${user.id}',${Boolean(user.is_influencer)})">${user.is_influencer ? 'Ativo' : 'Padrão'}</button></td>
        <td><button class="table-action" onclick="admin.openBalanceModal('${user.id}','${this.escape(user.username)}')">Saldo</button></td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty-state">Nenhum jogador encontrado.</td></tr>';
  },

  async loadGameLogs(search = '') {
    const { games } = await app.fetchAPI(`/api/admin/game-logs?search=${encodeURIComponent(search)}`);
    const body = document.getElementById('games-table');
    if (!body) return;
    body.innerHTML = games.length ? games.map(game => {
      const won = game.result === 'win' || Number(game.payout) > 0;
      return `<tr>
        <td>${app.formatDate(game.completed_at || game.created_at)}</td>
        <td><div class="user-cell"><b>${this.escape(game.username || game.uid)}</b><span>${this.escape(game.email || '')}</span></div></td>
        <td><span class="badge badge-${won ? 'success' : 'danger'}">${won ? 'Vitória' : 'Derrota'}</span></td>
        <td class="mono">${app.formatBRL(game.amount || 0)}</td>
        <td class="mono ${won ? 'positive' : ''}">${app.formatBRL(game.payout || 0)}</td>
        <td class="mono">${Number(game.multiplier || 0).toFixed(2)}x</td>
        <td class="mono">${Number(game.blocksPlaced || 0).toLocaleString('pt-BR')}</td>
        <td class="mono">${Number(game.linesCleared || game.floorsReached || 0).toLocaleString('pt-BR')}</td>
        <td class="mono">${Number(game.score || 0).toLocaleString('pt-BR')}</td>
        <td><span class="session-id" title="${this.escape(game.sessionId || '')}">${this.escape(String(game.sessionId || '-').slice(0, 8))}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" class="empty-state">Nenhuma partida registrada.</td></tr>';
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
    const { deposits } = await app.fetchAPI('/api/admin/deposits');
    const body = document.getElementById('deposits-table');
    if (!body) return;
    body.innerHTML = deposits.length ? deposits.map(item => `<tr>
      <td>${this.escape(item.username || item.uid)}</td>
      <td class="mono positive">${app.formatBRL(item.amount)}</td>
      <td><span class="badge">${this.escape(item.gateway || 'manual')}</span></td>
      <td>${app.formatDate(item.created_at)}</td>
      <td class="actions"><button class="approve" onclick="admin.resolveDeposit('${item.id}','approve')">Aprovar</button><button onclick="admin.resolveDeposit('${item.id}','reject')">Recusar</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty-state">Nenhum depósito pendente.</td></tr>';
  },

  async resolveDeposit(id, action) {
    await app.fetchAPI(`/api/admin/deposits/${id}/${action}`, { method: 'PUT' });
    app.showToast(action === 'approve' ? 'Depósito aprovado e comissões calculadas.' : 'Depósito recusado.');
    this.loadDeposits();
    this.loadOverview();
  },

  async loadWithdrawals() {
    const { withdrawals } = await app.fetchAPI('/api/admin/withdrawals');
    const body = document.getElementById('withdrawals-table');
    if (!body) return;
    body.innerHTML = withdrawals.length ? withdrawals.map(item => `<tr>
      <td>${this.escape(item.username || item.uid)}</td>
      <td class="mono">${app.formatBRL(item.amount)}</td>
      <td>${this.escape(item.pix_key || '-')}</td>
      <td class="actions"><button class="approve" onclick="admin.resolveWithdrawal('${item.id}','approve')">Pago</button><button onclick="admin.resolveWithdrawal('${item.id}','reject')">Recusar</button></td>
    </tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nenhum saque pendente.</td></tr>';
  },

  async resolveWithdrawal(id, action) {
    await app.fetchAPI(`/api/admin/withdrawals/${id}/${action}`, { method: 'PUT' });
    app.showToast(action === 'approve' ? 'Saque marcado como pago.' : 'Saque recusado e saldo devolvido.');
    this.loadWithdrawals();
    this.loadOverview();
  }
};

window.admin = admin;
document.addEventListener('DOMContentLoaded', () => setTimeout(() => admin.init(), 50));
