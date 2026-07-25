const affiliate = {
    init() {
        if (!app.token) {
            window.location.href = 'index.html';
            return;
        }
        this.loadAffiliateStats();
        
        const link = `${window.location.origin}?ref=${app.user?.id || 'TEST'}`;
        document.getElementById('ref-link').value = link;
    },

    async loadAffiliateStats() {
        try {
            const data = await app.fetchAPI('/api/affiliate/stats');
            document.getElementById('stat-referred').textContent = data.totalReferred;
            document.getElementById('stat-commissions').textContent = app.formatBRL(data.totalCommissions);
            document.getElementById('stat-balance').textContent = app.formatBRL(data.availableBalance);
        } catch (e) {}
    },

    copyReferralLink() {
        const linkEl = document.getElementById('ref-link');
        linkEl.select();
        document.execCommand('copy');
        app.toast('Referral link copied!');
    },

    async redeemCommissions() {
        try {
            await app.fetchAPI('/api/affiliate/redeem', { method: 'POST' });
            app.toast('Commissions redeemed to wallet!');
            this.loadAffiliateStats();
        } catch (e) {}
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // wait for app to init
    setTimeout(() => affiliate.init(), 500);
});
