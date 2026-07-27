const wallet = {
  activeTab: 'deposit',
  pixCode: null,

  toggleTab(tab) {
    this.activeTab = tab;
    const depContent = document.getElementById('dep-content');
    const withContent = document.getElementById('with-content');
    const depBtn = document.getElementById('tab-dep-btn');
    const withBtn = document.getElementById('tab-with-btn');

    if (tab === 'deposit') {
      depContent.style.display = 'block';
      withContent.style.display = 'none';
      depBtn.className = 'btn btn-primary';
      withBtn.className = 'btn btn-wood';
    } else {
      depContent.style.display = 'none';
      withContent.style.display = 'block';
      depBtn.className = 'btn btn-wood';
      withBtn.className = 'btn btn-danger';
    }
  },

  selectPreset(val) {
    document.getElementById('dep-amount-input').value = val;
    document.querySelectorAll('.preset-card').forEach(card => {
      card.classList.toggle('active', card.textContent.trim() === `R$ ${val}`);
    });
  },

  async loadWallet() {
    try {
      const data = await app.fetchAPI('/api/wallet/history');
      this.renderHistory(data.transactions || []);
      app.updateBalanceDisplays();
    } catch (e) {
      console.error(e);
    }
  },

  async requestDeposit() {
    const input = document.getElementById('dep-amount-input');
    const amountVal = parseFloat(input.value);

    if (isNaN(amountVal) || amountVal < 5) {
      app.showToast('Informe um valor mínimo de depósito de R$ 5,00.');
      return;
    }

    const amountCentavos = Math.round(amountVal * 100);

    try {
      const data = await app.fetchAPI('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: amountCentavos })
      });

      this.pixCode = data.pixCode || `00020126580014BR.GOV.BCB.PIX0136PIX_IN_${Date.now()}520400005303986540${amountVal.toFixed(2)}5802BR5920BLOCKERINO BET GAMING6009SAO PAULO62070503***6304`;
      
      document.getElementById('pix-result-container').style.display = 'block';
      document.getElementById('pix-code-display').value = this.pixCode;
      
      app.showToast('⚡ Código PIX Copia e Cola gerado com sucesso!');
      await this.loadWallet();
    } catch (e) {
      console.error(e);
    }
  },

  copyPixCode() {
    if (!this.pixCode) return;
    navigator.clipboard.writeText(this.pixCode);
    app.showToast('📋 Código PIX copiado para a área de transferência!');
  },

  async requestWithdraw() {
    const amountInput = document.getElementById('with-amount-input');
    const keyInput = document.getElementById('with-key-input');
    const amountVal = parseFloat(amountInput.value);
    const pixKey = keyInput.value.trim();

    if (!pixKey) {
      app.showToast('Informe a sua chave PIX.');
      return;
    }

    if (isNaN(amountVal) || amountVal < 10) {
      app.showToast('O valor mínimo para saque PIX é de R$ 10,00.');
      return;
    }

    const amountCentavos = Math.round(amountVal * 100);

    if (app.user.balance < amountCentavos) {
      app.showToast('Saldo insuficiente para realizar este saque.');
      return;
    }

    try {
      await app.fetchAPI('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: amountCentavos, pixKey })
      });

      app.showToast('🔥 Solicitação de saque PIX realizada com sucesso!');
      amountInput.value = '';
      keyInput.value = '';
      await this.loadWallet();
    } catch (e) {
      console.error(e);
    }
  },

  renderHistory(txs) {
    const tbody = document.querySelector('#tx-history-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--color-text-muted);">Nenhuma transação registrada.</td></tr>';
      return;
    }

    txs.forEach(tx => {
      const tr = document.createElement('tr');
      const dateStr = new Date(tx.created_at || Date.now()).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      let typeLabel = tx.type;
      if (tx.type === 'deposit') typeLabel = '🌽 Depósito';
      else if (tx.type === 'withdraw') typeLabel = '🔥 Saque';
      else if (tx.type === 'bet') typeLabel = '🎮 Aposta';
      else if (tx.type === 'win') typeLabel = '🏆 Prêmio';
      else if (tx.type === 'affiliate_commission') typeLabel = '🤝 Comissão';

      let statusBadge = 'badge-pending';
      let statusLabel = 'Pendente';
      if (tx.status === 'completed' || tx.status === 'approved') {
        statusBadge = 'badge-success';
        statusLabel = 'Aprovado';
      } else if (tx.status === 'rejected') {
        statusBadge = 'badge-danger';
        statusLabel = 'Recusado';
      }

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${typeLabel}</td>
        <td style="font-weight:bold;">${app.formatBRL(tx.amount)}</td>
        <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
};
