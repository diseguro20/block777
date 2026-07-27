// Módulo de Gerenciamento do Painel de Administração

const admin = {
  selectedUserId: null,

  async init() {
    try {
      await this.loadStats();
      await this.loadUsers();
      await this.loadDeposits();
    } catch (e) {
      console.warn('Erro ao carregar dados do admin:', e);
    }
  },

  async loadStats() {
    try {
      const stats = await fetchAPI('/api/admin/stats');
      document.getElementById('stat-total-users').innerText = stats.totalUsers || 0;
      document.getElementById('stat-total-bets').innerText = `R$ ${((stats.totalBets || 0) / 100).toFixed(2).replace('.', ',')}`;
      document.getElementById('stat-total-payouts').innerText = `R$ ${((stats.totalPayouts || 0) / 100).toFixed(2).replace('.', ',')}`;
      
      const profitCentavos = (stats.totalBets || 0) - (stats.totalPayouts || 0);
      const profitEl = document.getElementById('stat-house-profit');
      if (profitEl) {
        profitEl.innerText = `R$ ${(profitCentavos / 100).toFixed(2).replace('.', ',')}`;
        profitEl.style.color = profitCentavos >= 0 ? 'var(--color-success)' : 'var(--color-accent)';
      }
    } catch (e) {}
  },

  async loadUsers(search = '') {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await fetchAPI(`/api/admin/users${query}`);
      const users = data.users || data || [];
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;

      tbody.innerHTML = '';
      users.forEach((u) => {
        const tr = document.createElement('tr');
        const balanceBRL = ((u.balance || 0) / 100).toFixed(2).replace('.', ',');
        const isInfluencer = u.is_influencer === 1;

        tr.innerHTML = `
          <td><strong>${u.username}</strong></td>
          <td>${u.email}</td>
          <td style="color:var(--color-primary); font-weight:bold;">R$ ${balanceBRL}</td>
          <td>
            <button class="btn ${isInfluencer ? 'btn-success' : 'btn-wood'}" style="padding:4px 8px; min-height:28px; font-size:9px;" onclick="admin.toggleInfluencer('${u.id}', ${isInfluencer ? 0 : 1})">
              ${isInfluencer ? '⭐ ATIVADO' : 'DESATIVADO'}
            </button>
          </td>
          <td>
            <button class="btn btn-wood" style="padding:4px 8px; min-height:28px; font-size:9px;" onclick="admin.openBalanceAdjust('${u.id}')">💰 SALDO</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  },

  async toggleInfluencer(userId, newStatus) {
    try {
      await fetchAPI(`/api/admin/users/${userId}`, 'PUT', { is_influencer: newStatus });
      app.showToast('Status de Influencer atualizado com sucesso! ⭐', 'success');
      this.loadUsers();
    } catch (e) {}
  },

  openBalanceAdjust(userId) {
    this.selectedUserId = userId;
    document.getElementById('admin-balance-modal').classList.add('active');
  },

  async confirmBalanceAdjust() {
    if (!this.selectedUserId) return;
    const amountVal = parseFloat(document.getElementById('adj-amount-input').value) || 0;
    const type = document.getElementById('adj-type-select').value;
    const desc = document.getElementById('adj-desc-input').value || 'Ajuste Manual Admin';

    if (amountVal <= 0) {
      app.showToast('Informe um valor maior que 0', 'danger');
      return;
    }

    const centavos = Math.round(amountVal * 100);

    try {
      await fetchAPI(`/api/admin/users/${this.selectedUserId}/balance`, 'PUT', { amount: centavos, type, description: desc });
      app.showToast('Saldo do jogador ajustado!', 'success');
      document.getElementById('admin-balance-modal').classList.remove('active');
      this.loadUsers();
      this.loadStats();
    } catch (e) {}
  },

  async setDifficulty(level) {
    try {
      await fetchAPI('/api/admin/settings/difficulty', 'PUT', { difficulty: level });
      app.showToast(`Dificuldade global alterada para: ${level.toUpperCase()}`, 'success');
    } catch (e) {}
  },

  async loadDeposits() {
    try {
      const deposits = await fetchAPI('/api/admin/deposits');
      const tbody = document.getElementById('deposits-table-body');
      if (!tbody) return;

      tbody.innerHTML = '';
      (deposits || []).forEach((d) => {
        const tr = document.createElement('tr');
        const amountBRL = ((d.amount || 0) / 100).toFixed(2).replace('.', ',');
        tr.innerHTML = `
          <td>${d.id ? d.id.substring(0, 8) : 'DEP'}</td>
          <td>${d.username || d.user_id}</td>
          <td style="color:var(--color-success); font-weight:bold;">R$ ${amountBRL}</td>
          <td>
            <button class="btn btn-success" style="padding:4px 8px; min-height:28px; font-size:9px;" onclick="admin.approveDeposit('${d.id}')">✓ APROVAR</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  },

  async approveDeposit(id) {
    try {
      await fetchAPI(`/api/admin/deposits/${id}/approve`, 'PUT');
      app.showToast('Depósito aprovado com sucesso! Saldo creditado 🌽', 'success');
      this.loadDeposits();
      this.loadStats();
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  admin.init();
});
