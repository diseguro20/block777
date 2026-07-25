const wallet = {
    async loadWallet() {
        try {
            const data = await app.fetchAPI('/api/wallet/history');
            this.renderHistory(data.transactions);
            app.updateBalances(app.user.balance);
        } catch (e) {
            console.error(e);
        }
    },

    async requestDeposit() {
        const amountEl = document.getElementById('dep-amount');
        const amount = parseFloat(amountEl.value) * 100;
        if (!amount || amount <= 0) return;

        try {
            const data = await app.fetchAPI('/api/wallet/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
            
            document.getElementById('pix-container').style.display = 'block';
            document.getElementById('pix-code').value = data.pixCode || '000201010211...PIX...';
            app.toast('PIX Generated');
            this.loadWallet();
        } catch (e) {
            console.error(e);
        }
    },

    async requestWithdraw() {
        const amountEl = document.getElementById('with-amount');
        const keyEl = document.getElementById('with-key');
        const amount = parseFloat(amountEl.value) * 100;
        
        if (!amount || amount <= 0 || !keyEl.value) return;

        try {
            await app.fetchAPI('/api/wallet/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount, pixKey: keyEl.value })
            });
            
            app.toast('Withdrawal requested');
            this.loadWallet();
            amountEl.value = '';
            keyEl.value = '';
        } catch (e) {
            console.error(e);
        }
    },

    renderHistory(txs) {
        const tbody = document.querySelector('#tx-history tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        txs.forEach(tx => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(tx.created_at).toLocaleString()}</td>
                <td>${tx.type}</td>
                <td>${app.formatBRL(tx.amount)}</td>
                <td><span class="badge badge-${tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'pending' : 'danger'}">${tx.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
};
