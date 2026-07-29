const wallet = {
  pixCode: '',
  toggleTab(tab) {
    const deposit = tab === 'deposit';
    document.getElementById('dep-content').hidden = !deposit;
    document.getElementById('with-content').hidden = deposit;
    document.getElementById('tab-dep-btn').classList.toggle('active', deposit);
    document.getElementById('tab-with-btn').classList.toggle('active', !deposit);
  },
  selectPreset(value) {
    document.getElementById('dep-amount-input').value = value;
    document.querySelectorAll('.quick-values button').forEach(button => button.classList.toggle('active', button.textContent.includes(` ${value}`)));
  },
  async loadWallet() {
    try {
      const data = await app.fetchAPI('/api/wallet/history');
      if (data.balance != null && app.user) app.user.balance = data.balance;
      app.updateBalanceDisplays();
      this.renderHistory(data.transactions || data || []);
    } catch (_) {}
  },
  async requestDeposit() {
    const amount = Number(document.getElementById('dep-amount-input').value);
    if (amount < 5 || amount > 1000) return app.showToast('Deposite entre R$ 5 e R$ 1.000.');
    try {
      const data = await app.fetchAPI('/api/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount: Math.round(amount * 100) }) });
      this.pixCode = data.pixCode;
      document.getElementById('pix-code-display').value = data.pixCode;
      document.getElementById('pix-result-container').style.display = 'block';
      app.showToast('PIX gerado. Aguardando confirmação do pagamento.');
      await this.loadWallet();
    } catch (_) {}
  },
  async copyPixCode() {
    if (!this.pixCode) return;
    await navigator.clipboard.writeText(this.pixCode);
    app.showToast('Código PIX copiado.');
  },
  async requestWithdraw() {
    const amount = Number(document.getElementById('with-amount-input').value);
    const pixKey = document.getElementById('with-key-input').value.trim();
    if (amount < 10) return app.showToast('O saque mínimo é de R$ 10.');
    if (!pixKey) return app.showToast('Informe uma chave PIX.');
    try {
      const data = await app.fetchAPI('/api/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount: Math.round(amount * 100), pixKey }) });
      if (app.user && data.balance_after != null) app.user.balance = data.balance_after;
      app.updateBalanceDisplays();
      app.showToast('Saque solicitado e enviado para análise.');
      document.getElementById('with-amount-input').value = '';
      document.getElementById('with-key-input').value = '';
      await this.loadWallet();
    } catch (_) {}
  },
  renderHistory(items) {
    const body = document.querySelector('#tx-history-table tbody');
    if (!body) return;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma movimentação registrada.</td></tr>';
      return;
    }
    const names = { deposit: 'Depósito', withdraw: 'Saque', withdraw_request: 'Saque', bet: 'Aposta', win: 'Prêmio', affiliate_redeem: 'Comissão' };
    body.innerHTML = items.map(tx => `<tr><td>${app.formatDate(tx.created_at)}</td><td>${names[tx.type] || tx.type}</td><td style="color:${Number(tx.amount) > 0 ? 'var(--success)' : 'var(--text)'}">${Number(tx.amount) > 0 ? '+' : ''}${app.formatBRL(tx.amount)}</td><td><span class="badge badge-${tx.status === 'rejected' ? 'danger' : tx.status === 'pending' ? 'pending' : 'success'}">${tx.status === 'pending' ? 'Pendente' : tx.status === 'rejected' ? 'Recusado' : 'Concluído'}</span></td></tr>`).join('');
  }
};
