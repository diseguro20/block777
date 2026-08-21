const wallet = {
  pixCode: '',
  data: null,
  promotion: { promoEnabled: true, bonusPercent: 100, bonusMinDeposit: 2000, rolloverMultiplier: 10 },
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
    this.updatePromoPreview();
  },
  updatePromoPreview() {
    const input = document.getElementById('dep-amount-input');
    if (!input) return;
    const amount = Math.max(0, Number(input.value) || 0);
    const eligible = this.promotion.promoEnabled && amount * 100 >= this.promotion.bonusMinDeposit;
    const bonus = eligible ? amount * this.promotion.bonusPercent / 100 : 0;
    const depositValue = document.getElementById('promo-deposit-value');
    const totalValue = document.getElementById('promo-total-value');
    const detail = document.getElementById('promo-bonus-detail');
    const badge = document.getElementById('deposit-promo-badge');
    const button = document.getElementById('deposit-promo-button');
    if (depositValue) depositValue.textContent = app.formatBRL(amount * 100);
    if (totalValue) totalValue.textContent = app.formatBRL((amount + bonus) * 100);
    if (detail) detail.textContent = eligible
      ? `${app.formatBRL(bonus * 100)} em bônus adicionados automaticamente após a confirmação do PIX.`
      : `Deposite pelo menos ${app.formatBRL(this.promotion.bonusMinDeposit)} para ativar o bônus.`;
    if (badge) badge.textContent = `${this.promotion.bonusPercent}% DE BÔNUS`;
    if (button) button.textContent = eligible
      ? `Gerar PIX e ativar ${this.promotion.bonusPercent}%`
      : 'Gerar PIX';
  },
  async loadWallet() {
    try {
      const data = await app.fetchAPI('/api/wallet/history');
      this.data = data;
      this.promotion = { ...this.promotion, ...(data.promotion || {}) };
      if (app.user) {
        app.user.balance = data.balance;
        app.user.cash_balance = data.cashBalance;
        app.user.bonus_balance = data.bonusBalance;
        app.user.rollover_remaining = data.rolloverRemaining;
      }
      app.updateBalanceDisplays();
      document.getElementById('wallet-cash-val').textContent = app.formatBRL(data.cashBalance || 0);
      document.getElementById('wallet-bonus-val').textContent = app.formatBRL(data.bonusBalance || 0);
      document.getElementById('rollover-progress').style.width = `${data.rolloverProgress || 0}%`;
      document.getElementById('rollover-status').textContent = data.withdrawalsLocked ? `${data.rolloverProgress || 0}% concluído` : 'Concluído';
      document.getElementById('rollover-detail').textContent = data.withdrawalsLocked
        ? `Aposte mais ${app.formatBRL(data.rolloverRemaining)} para liberar os saques.`
        : 'Seu saldo está liberado para saque.';
      document.getElementById('rollover-box').classList.toggle('active', Boolean(data.withdrawalsLocked));
      document.getElementById('withdraw-lock-note').hidden = !data.withdrawalsLocked;
      this.updatePromoPreview();
      this.renderHistory(data.transactions || data || []);
    } catch (_) {}
  },
  async requestDeposit() {
    const amount = Number(document.getElementById('dep-amount-input').value);
    if (amount < 20 || amount > 1000) return app.showToast('O depósito mínimo é de R$ 20.');
    try {
      const data = await app.fetchAPI('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: Math.round(amount * 100) })
      });
      this.pixCode = data.pixCode;
      const qrImage = document.getElementById('pix-qr-image');
      if (qrImage) {
        qrImage.src = data.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.pixCode)}`;
        qrImage.hidden = false;
      }
      document.getElementById('pix-code-display').value = data.pixCode;
      document.getElementById('pix-result-container').style.display = 'block';
      app.showToast(data.bonusAmount > 0
        ? `PIX gerado. Após pagar, você recebe ${app.formatBRL(data.bonusAmount)} de bônus.`
        : 'PIX gerado. Aguardando confirmação do pagamento.');
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
    if (this.data?.withdrawalsLocked) return app.showToast(`Complete o rollover de ${app.formatBRL(this.data.rolloverRemaining)} antes de sacar.`);
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
    const names = { deposit: 'Depósito', deposit_bonus: 'Bônus promocional', bonus_unlock: 'Rollover concluído', deposit_refund: 'Estorno de depósito', chargeback: 'Contestação', withdraw: 'Saque', withdraw_request: 'Saque', bet: 'Aposta', win: 'Prêmio', affiliate_redeem: 'Comissão' };
    body.innerHTML = items.map(tx => {
      const status = tx.status === 'locked' ? 'locked' : tx.status;
      const statusLabel = status === 'pending' ? 'Pendente' : status === 'rejected' ? 'Recusado' : status === 'locked' ? 'Bloqueado' : 'Concluído';
      return `<tr><td>${app.formatDate(tx.created_at)}</td><td>${names[tx.type] || tx.type}</td><td style="color:${Number(tx.amount) > 0 ? 'var(--success)' : 'var(--text)'}">${Number(tx.amount) > 0 ? '+' : ''}${app.formatBRL(tx.amount)}</td><td><span class="badge badge-${status === 'rejected' ? 'danger' : ['pending', 'locked'].includes(status) ? 'pending' : 'success'}">${statusLabel}</span></td></tr>`;
    }).join('');
  }
};

window.wallet = wallet;
