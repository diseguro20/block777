const admin = {
    init() {
        if (!app.token) {
            window.location.href = 'index.html';
            return;
        }
        this.loadAdminStats();
        this.loadUsers();
        setInterval(() => this.loadAdminStats(), 30000);
    },

    async loadAdminStats() {
        try {
            const data = await app.fetchAPI('/api/admin/stats');
            document.getElementById('stat-users').textContent = data.totalUsers;
            document.getElementById('stat-bets').textContent = app.formatBRL(data.totalBets);
            document.getElementById('stat-payouts').textContent = app.formatBRL(data.totalPayouts);
            
            const profitEl = document.getElementById('stat-profit');
            profitEl.textContent = app.formatBRL(data.houseProfit);
            profitEl.style.color = data.houseProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
        } catch (e) {
            app.toast('Admin access denied');
        }
    },

    async changeDifficulty(level) {
        try {
            await app.fetchAPI('/api/admin/settings/difficulty', {
                method: 'PUT',
                body: JSON.stringify({ level })
            });
            app.toast(`Difficulty set to ${level}`);
        } catch (e) {}
    },

    async loadUsers(search = '') {
        try {
            const data = await app.fetchAPI(`/api/admin/users?search=${search}`);
            const tbody = document.getElementById('users-table');
            tbody.innerHTML = '';
            
            data.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.username}</td>
                    <td>${u.email}</td>
                    <td>${app.formatBRL(u.balance)}</td>
                    <td>${u.status}</td>
                    <td>${u.is_influencer ? '✅' : '❌'}</td>
                    <td>
                        <button class="btn" style="padding:4px 8px;font-size:12px" onclick="admin.toggleInfluencer(${u.id}, ${u.is_influencer})">Toggle INF</button>
                        <button class="btn btn-primary" style="padding:4px 8px;font-size:12px" onclick="admin.showBalanceModal(${u.id})">Balance</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {}
    },

    async toggleInfluencer(id, current) {
        try {
            await app.fetchAPI(`/api/admin/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ is_influencer: !current })
            });
            this.loadUsers();
        } catch (e) {}
    },

    showBalanceModal(id) {
        const amount = prompt('Enter amount (+ for credit, - for debit):');
        if (!amount) return;
        const val = parseFloat(amount) * 100;
        const desc = prompt('Reason/Description:');
        
        this.adjustBalance(id, val, val > 0 ? 'credit' : 'debit', desc);
    },

    async adjustBalance(id, amount, type, description) {
        try {
            await app.fetchAPI(`/api/admin/users/${id}/balance`, {
                method: 'PUT',
                body: JSON.stringify({ amount: Math.abs(amount), type, description })
            });
            app.toast('Balance adjusted');
            this.loadUsers();
        } catch (e) {}
    }
};

document.addEventListener('DOMContentLoaded', () => admin.init());
