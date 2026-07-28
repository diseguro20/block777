const admin = {
  selectedUserIdForBalance: null,

  async init() {
    if (!app.token) {
      this.renderAuthCard();
      return;
    }
    await this.loadAll();
  },

  renderAuthCard() {
    const container = document.querySelector('.screen.active');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-card" style="max-width:400px; margin:40px auto; padding:24px; text-align:center;">
        <h2 style="font-size:20px; color:var(--color-primary); margin-bottom:8px;">👑 LOGIN ADMINISTRATIVO</h2>
        <p style="font-size:11px; color:var(--color-text-muted); margin-bottom:16px;">Informe seu e-mail e senha de administrador para acessar o painel:</p>
        
        <form id="admin-login-form" style="display:flex; flex-direction:column; gap:12px;">
          <input type="email" id="admin-email" placeholder="E-mail admin" required style="margin-bottom:0;">
          <input type="password" id="admin-password" placeholder="Senha" required style="margin-bottom:0;">
          <button type="submit" class="btn btn-primary" style="width:100%; min-height:44px;">ENTRAR NO PAINEL 🚀</button>
        </form>
      </div>
    `;

    document.getElementById('admin-login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value;
      const password = document.getElementById('admin-password').value;

      try {
        const data = await app.fetchAPI('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        app.token = data.token;
        localStorage.setItem('token', data.token);
        app.showToast('👑 Autenticado como Administrador!');
        window.location.reload();
      } catch (err) {
        app.showToast('E-mail ou senha incorretos.');
      }
    };
  },

  async loadAll() {
    await this.loadAdminStats();
    await this.loadSettings();
    await this.loadUsers();
    await this.loadDeposits();
    await this.loadWithdrawals();

    setInterval(() => {
      this.loadAdminStats();
      this.loadDeposits();
      this.loadWithdrawals();
    }, 20000);
  },

  async loadAdminStats() {
    try {
      const data = await app.fetchAPI('/api/admin/stats');
      const usersEl = document.getElementById('stat-users');
      if (usersEl) usersEl.textContent = data.totalUsers || 0;

      const betsEl = document.getElementById('stat-bets');
      if (betsEl) betsEl.textContent = app.formatBRL(data.totalBets || 0);

      const payoutsEl = document.getElementById('stat-payouts');
      if (payoutsEl) payoutsEl.textContent = app.formatBRL(data.totalPayouts || 0);

      const profitEl = document.getElementById('stat-profit');
      if (profitEl) {
        const profit = data.houseProfit || 0;
        profitEl.textContent = app.formatBRL(profit);
        profitEl.style.color = profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
      }
    } catch (e) {
      app.showToast('Acesso negado. É necessário ter privilégios de administrador.');
    }
  },

  async loadSettings() {
    try {
      const data = await app.fetchAPI('/api/admin/settings');
      this.highlightDifficulty(data.difficulty || 'balanced');
    } catch (e) {}
  },

  highlightDifficulty(level) {
    ['easy', 'balanced', 'strict'].forEach(lvl => {
      const btn = document.getElementById(`diff-${lvl}-btn`);
      if (btn) {
        if (lvl === level) {
          btn.style.borderColor = 'var(--color-primary)';
          btn.style.background = 'rgba(247, 183, 49, 0.25)';
          btn.style.fontWeight = 'bold';
        } else {
          btn.style.borderColor = 'var(--color-wood)';
          btn.style.background = 'rgba(139, 94, 60, 0.2)';
          btn.style.fontWeight = 'normal';
        }
      }
    });
  },

  async changeDifficulty(level) {
    try {
      await app.fetchAPI('/api/admin/settings/difficulty', {
        method: 'PUT',
        body: JSON.stringify({ level })
      });
      this.highlightDifficulty(level);
      app.showToast(`⚙️ Dificuldade global definida para: ${level.toUpperCase()}`);
    } catch (e) {}
  },

  async loadUsers(search = '') {
    try {
      const data = await app.fetchAPI(`/api/admin/users?search=${encodeURIComponent(search)}`);
      const tbody = document.getElementById('users-table');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (!data.users || data.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted);">Nenhum jogador encontrado.</td></tr>';
        return;
      }

      data.users.forEach(u => {
        const tr = document.createElement('tr');
        const isInf = u.is_influencer === 1;
        const infBadge = isInf
          ? '<span class="badge badge-influencer">⭐ INFLUENCER (ON)</span>'
          : '<span class="badge badge-wood" style="opacity:0.6;">DESATIVADO</span>';

        tr.innerHTML = `
          <td style="font-weight:bold;">${u.username}</td>
          <td>${u.email}</td>
          <td style="color:var(--color-primary); font-weight:bold;">${app.formatBRL(u.balance || 0)}</td>
          <td><span class="badge ${u.status === 'suspended' ? 'badge-danger' : 'badge-success'}">${u.status}</span></td>
          <td>${infBadge}</td>
          <td style="display:flex; gap:6px;">
            <button class="btn btn-wood" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.toggleInfluencer('${u.id}', ${isInf})">
              ⭐ INF ${isInf ? 'OFF' : 'ON'}
            </button>
            <button class="btn btn-primary" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.openBalanceModal('${u.id}', '${u.username}')">
              💰 SALDO
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  },

  async toggleInfluencer(userId, current) {
    try {
      await app.fetchAPI(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_influencer: current ? 0 : 1 })
      });
      app.showToast(`⭐ Modo Influencer ${current ? 'DESATIVADO' : 'ATIVADO'} para o jogador!`);
      this.loadUsers();
    } catch (e) {}
  },

  openBalanceModal(userId, username) {
    this.selectedUserIdForBalance = userId;
    const modalUser = document.getElementById('balance-modal-user');
    if (modalUser) modalUser.textContent = `Jogador: ${username}`;

    const amt = document.getElementById('balance-amount-input');
    if (amt) amt.value = '';
    const desc = document.getElementById('balance-desc-input');
    if (desc) desc.value = '';

    const modal = document.getElementById('balance-modal');
    if (modal) modal.classList.add('active');
  },

  async confirmBalanceAdjustment() {
    if (!this.selectedUserIdForBalance) return;
    const type = document.getElementById('balance-type-select').value;
    const amountVal = parseFloat(document.getElementById('balance-amount-input').value);
    const desc = document.getElementById('balance-desc-input').value.trim() || 'Ajuste manual via Painel Admin';

    if (isNaN(amountVal) || amountVal <= 0) {
      app.showToast('Informe um valor válido.');
      return;
    }

    const amountCentavos = Math.round(amountVal * 100);

    try {
      await app.fetchAPI(`/api/admin/users/${this.selectedUserIdForBalance}/balance`, {
        method: 'PUT',
        body: JSON.stringify({ amount: amountCentavos, type, description: desc })
      });

      app.showToast('💰 Saldo ajustado com sucesso!');
      const modal = document.getElementById('balance-modal');
      if (modal) modal.classList.remove('active');
      this.loadUsers();
      this.loadAdminStats();
    } catch (e) {}
  },

  async loadDeposits() {
    try {
      const data = await app.fetchAPI('/api/admin/deposits');
      const tbody = document.getElementById('deposits-table');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (!data.deposits || data.deposits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--color-text-muted);">Nenhum depósito pendente.</td></tr>';
        return;
      }

      data.deposits.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${d.id.substring(0, 8)}...</td>
          <td>${d.username || d.user_id}</td>
          <td style="font-weight:bold; color:var(--color-success);">${app.formatBRL(d.amount)}</td>
          <td>${new Date(d.created_at || Date.now()).toLocaleDateString('pt-BR')}</td>
          <td style="display:flex; gap:6px;">
            <button class="btn btn-success" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.approveDeposit('${d.id}')">
              ✓ APROVAR
            </button>
            <button class="btn btn-danger" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.rejectDeposit('${d.id}')">
              ✕ RECUSAR
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  },

  async approveDeposit(id) {
    try {
      await app.fetchAPI(`/api/admin/deposits/${id}/approve`, { method: 'PUT' });
      app.showToast('✅ Depósito aprovado e comissões de afiliados pagas!');
      this.loadDeposits();
      this.loadAdminStats();
      this.loadUsers();
    } catch (e) {}
  },

  async rejectDeposit(id) {
    try {
      await app.fetchAPI(`/api/admin/deposits/${id}/reject`, { method: 'PUT' });
      app.showToast('✕ Depósito recusado.');
      this.loadDeposits();
    } catch (e) {}
  },

  async loadWithdrawals() {
    try {
      const data = await app.fetchAPI('/api/admin/withdrawals');
      const tbody = document.getElementById('withdrawals-table');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (!data.withdrawals || data.withdrawals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--color-text-muted);">Nenhum saque pendente.</td></tr>';
        return;
      }

      data.withdrawals.forEach(w => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${w.id.substring(0, 8)}...</td>
          <td>${w.username || w.user_id}</td>
          <td style="font-weight:bold; color:var(--color-danger);">${app.formatBRL(w.amount)}</td>
          <td>${w.pix_key || '-'}</td>
          <td style="display:flex; gap:6px;">
            <button class="btn btn-success" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.approveWithdrawal('${w.id}')">
              ✓ PAGAR SAQUE
            </button>
            <button class="btn btn-danger" style="padding:4px 8px; min-height:30px; font-size:10px;" onclick="admin.rejectWithdrawal('${w.id}')">
              ✕ RECUSAR
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  },

  async approveWithdrawal(id) {
    try {
      await app.fetchAPI(`/api/admin/withdrawals/${id}/approve`, { method: 'PUT' });
      app.showToast('✅ Saque aprovado!');
      this.loadWithdrawals();
      this.loadAdminStats();
    } catch (e) {}
  },

  async rejectWithdrawal(id) {
    try {
      await app.fetchAPI(`/api/admin/withdrawals/${id}/reject`, { method: 'PUT' });
      app.showToast('✕ Saque recusado e saldo reembolsado ao jogador.');
      this.loadWithdrawals();
      this.loadUsers();
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => admin.init());
