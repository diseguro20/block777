const manager = {
  data: null,

  async init() {
    this.bindDemoForm();
    if (!app.token) return this.requireLogin();
    try {
      await app.fetchUserDataOnly();
      if (app.user?.role !== 'manager') throw new Error('Esta conta não possui acesso de gerente.');
      await Promise.all([this.loadDashboard(), this.loadPlayers()]);
    } catch (error) {
      this.requireLogin(error.message);
    }
  },

  requireLogin(message = '') {
    const login = document.getElementById('manager-login');
    login.hidden = false;
    if (message) app.showToast(message);
    document.getElementById('manager-login-form').onsubmit = async event => {
      event.preventDefault();
      try {
        const data = await app.fetchAPI('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('manager-login-email').value,
            password: document.getElementById('manager-login-password').value
          })
        });
        if (data.user.role !== 'manager') throw new Error('Esta conta não foi ativada como gerente.');
        app.token = data.token;
        localStorage.setItem('token', data.token);
        location.reload();
      } catch (error) {
        app.showToast(error.message);
      }
    };
  },

  async loadDashboard() {
    const data = await app.fetchAPI('/api/manager/dashboard');
    this.data = data;
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('manager-name', data.manager.username || 'Gerente');
    setText('manager-email', data.manager.email || '');
    setText('manager-link', data.manager.referralLink || '');
    setText('manager-period', data.currentPeriod || '—');
    setText('manager-rate', `${Number(data.manager.rate || 0).toFixed(2)}%`);
    setText('metric-players', Number(data.players || 0).toLocaleString('pt-BR'));
    setText('metric-bets', app.formatBRL(data.current.totalBets || 0));
    setText('metric-payouts', app.formatBRL(data.current.totalPayouts || 0));
    setText('metric-ggr', app.formatBRL(data.current.ggr || 0));
    setText('metric-fee', app.formatBRL(data.current.platformFee || 0));
    setText('metric-due', app.formatBRL(data.allTime.outstanding || 0));
    setText('manager-total-paid', `${app.formatBRL(data.allTime.totalPaid || 0)} pagos`);
    this.renderGames(data.recentGames || []);
    this.renderPayments(data.payments || []);
  },

  async loadPlayers() {
    const data = await app.fetchAPI('/api/manager/players');
    const body = document.getElementById('manager-players-table');
    body.innerHTML = data.players.length ? data.players.map(player => `<tr><td data-label="Jogador"><b>${this.escape(player.username)}</b><br><small>${this.escape(player.email)}</small></td><td data-label="Partidas">${Number(player.games || 0).toLocaleString('pt-BR')}</td><td data-label="Apostado">${app.formatBRL(player.totalBets || 0)}</td><td data-label="Prêmios">${app.formatBRL(player.totalPayouts || 0)}</td><td data-label="GGR">${player.demoAccount ? 'Virtual' : app.formatBRL(player.ggr || 0)}</td><td data-label="Modo"><span class="badge ${player.isInfluencer ? 'badge-success' : ''}">${player.demoAccount ? 'Demo' : player.isInfluencer ? 'Influencer' : 'Normal'}</span></td><td data-label="Status"><span class="badge badge-${player.status === 'active' ? 'success' : 'danger'}">${player.status === 'active' ? 'Ativo' : 'Suspenso'}</span></td><td data-label="Ação"><button class="table-action" onclick="manager.toggleInfluencer('${player.id}',${!player.isInfluencer})">${player.isInfluencer ? 'Desativar demo' : 'Ativar demo'}</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-state">Nenhum jogador vinculado ainda.</td></tr>';
  },

  async toggleInfluencer(playerId, enabled) {
    const action = enabled ? 'ativar' : 'desativar';
    if (!window.confirm(`Deseja ${action} o modo influencer para este jogador?`)) return;
    try {
      await app.fetchAPI(`/api/manager/players/${encodeURIComponent(playerId)}/influencer`, {
        method: 'PUT',
        body: JSON.stringify({ enabled })
      });
      app.showToast(enabled ? 'Modo influencer ativado.' : 'Modo influencer desativado.');
      await this.loadPlayers();
    } catch (error) {
      app.showToast(error.message);
    }
  },

  openDemoModal() {
    document.getElementById('manager-demo-modal').classList.add('active');
  },

  bindDemoForm() {
    const form = document.getElementById('manager-demo-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = document.getElementById('demo-submit');
      submit.disabled = true;
      submit.textContent = 'Criando…';
      try {
        const data = await app.fetchAPI('/api/manager/demo-accounts', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('demo-username').value.trim(),
            email: document.getElementById('demo-email').value.trim(),
            password: document.getElementById('demo-password').value,
            demoBalance: Math.round(Number(document.getElementById('demo-balance').value) * 100)
          })
        });
        app.closeModal('manager-demo-modal');
        form.reset();
        document.getElementById('demo-balance').value = 500;
        app.showToast(`Conta demo de ${data.username} criada com ${app.formatBRL(data.demoBalance)}.`);
        await Promise.all([this.loadPlayers(), this.loadDashboard()]);
      } catch (error) {
        app.showToast(error.message);
      } finally {
        submit.disabled = false;
        submit.textContent = 'Criar conta demo';
      }
    };
  },

  renderGames(games) {
    const body = document.getElementById('manager-games-table');
    body.innerHTML = games.length ? games.map(game => `<tr><td data-label="Data">${app.formatDate(game.completed_at || game.created_at)}</td><td data-label="Aposta">${app.formatBRL(game.amount || 0)}</td><td data-label="Prêmio">${app.formatBRL(game.payout || 0)}</td><td data-label="GGR">${app.formatBRL(game.manager_ggr || 0)}</td><td data-label="Taxa">${app.formatBRL(game.manager_platform_fee || 0)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">As partidas dos seus jogadores aparecerão aqui.</td></tr>';
  },

  renderPayments(payments) {
    const body = document.getElementById('manager-payments-table');
    body.innerHTML = payments.length ? payments.map(payment => `<tr><td data-label="Data">${app.formatDate(payment.created_at)}</td><td data-label="Competência">${this.escape(payment.period || '-')}</td><td data-label="Descrição">${this.escape(payment.description || 'Pagamento de GGR')}</td><td data-label="Valor">${app.formatBRL(payment.amount || 0)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nenhum pagamento registrado.</td></tr>';
  },

  async copyLink() {
    if (!this.data?.manager?.referralLink) return;
    await navigator.clipboard.writeText(this.data.manager.referralLink);
    app.showToast('Link do gerente copiado.');
  },

  logout() {
    localStorage.removeItem('token');
    location.reload();
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
};

window.manager = manager;
document.addEventListener('DOMContentLoaded', () => setTimeout(() => manager.init(), 60));
