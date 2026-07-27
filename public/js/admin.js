const admin = {
  selectedUserIdForBalance: null,

  async init() {
    if (!app.token) {
      window.location.href = 'index.html';
      return;
    }
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
      document.getElementById('stat-users').textContent = data.totalUsers || 0;
      document.getElementById('stat-bets').textContent = app.formatBRL(data.totalBets || 0);
      document.getElementById('stat-payouts').textContent = app.formatBRL(data.totalPayouts || 0);

      const profitEl = document.getElementById('stat-profit');
      const profit = data.houseProfit || 0;
      profitEl.textContent = app.formatBRL(profit);
      profitEl.style.color = profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    } catch (e) {
      app.showToast('Acesso administrativo negado.');
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
    document.getElementById('balance-modal-user').textContent = `Jogador: ${username}`;
    document.getElementById('balance-amount-input').value = '';
    document.getElementById('balance-desc-input').value = '';
    document.getElementById('balance-modal').classList.add('active');
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
      document.getElementById('balance-modal').classList.remove('active');
      this.loadUsers();
      this.loadAdminStats();
    } catch (e) {}
  },

  async loadDeposits() {
    try {
      const data = await app.fetchAPI('/api/admin/deposits');
      const tbody = document.getElementById('deposits-table');
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
