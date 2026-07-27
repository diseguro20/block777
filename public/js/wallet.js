// Módulo de Gerenciamento da Carteira PIX (Depósito e Saque)

const wallet = {
  activeTab: 'deposit',
  selectedAmount: 20,

  toggleTab(tab) {
    this.activeTab = tab;
    const depContent = document.getElementById('dep-content');
    const withContent = document.getElementById('with-content');
    const tabDep = document.getElementById('tab-dep-btn');
    const tabWith = document.getElementById('tab-with-btn');

    if (tab === 'deposit') {
      depContent.style.display = 'block';
      withContent.style.display = 'none';
      tabDep.className = 'btn btn-primary';
      tabWith.className = 'btn btn-wood';
    } else {
      depContent.style.display = 'none';
      withContent.style.display = 'block';
      tabDep.className = 'btn btn-wood';
      tabWith.className = 'btn btn-danger';
    }
  },

  selectPreset(amount) {
    this.selectedAmount = amount;
    const input = document.getElementById('dep-amount-input');
    if (input) input.value = amount;

    document.querySelectorAll('.preset-card').forEach((card) => {
      card.classList.remove('active');
    });

    event.target.classList.add('active');
  },

  async requestDeposit() {
    const input = document.getElementById('dep-amount-input');
    const amountVal = parseFloat(input ? input.value : 20) || 20;

    if (amountVal < 5) {
      app.showToast('O valor mínimo de depósito é R$ 5,00', 'danger');
      return;
    }

    const centavos = Math.round(amountVal * 100);

    try {
      const res = await fetchAPI('/api/wallet/deposit', 'POST', { amount: centavos });
      const container = document.getElementById('pix-result-container');
      const pixDisplay = document.getElementById('pix-code-display');

      if (container && pixDisplay) {
        pixDisplay.value = res.pixCode || `00020126580014BR.GOV.BCB.PIX0136PIX_IN_${Date.now()}`;
        container.style.display = 'block';
        app.showToast('Código PIX Copia e Cola gerado com sucesso! 🌽', 'success');
      }
    } catch (e) {}
  },

  copyPixCode() {
    const pixDisplay = document.getElementById('pix-code-display');
    if (pixDisplay && pixDisplay.value) {
      navigator.clipboard.writeText(pixDisplay.value);
      app.showToast('Código PIX copiado para a área de transferência! 📋', 'success');
    }
  },

  async requestWithdraw() {
    const keyInput = document.getElementById('with-key-input');
    const amountInput = document.getElementById('with-amount-input');

    const pixKey = keyInput ? keyInput.value.trim() : '';
    const amountVal = parseFloat(amountInput ? amountInput.value : 0) || 0;

    if (!pixKey) {
      app.showToast('Por favor, informe sua chave PIX', 'danger');
      return;
    }

    if (amountVal < 10) {
      app.showToast('O valor mínimo para saque é R$ 10,00', 'danger');
      return;
    }

    const centavos = Math.round(amountVal * 100);

    try {
      await fetchAPI('/api/wallet/withdraw', 'POST', { amount: centavos, pixKey });
      app.showToast('Solicitação de saque PIX realizada com sucesso! 🔥', 'success');
      if (keyInput) keyInput.value = '';
      if (amountInput) amountInput.value = '';
      app.loadUserData();
    } catch (e) {}
  }
};
