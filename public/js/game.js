const game = {
    canvas: null,
    ctx: null,
    isPlaying: false,
    mode: 'demo', // real, demo
    multiplier: 1.0,
    floor: 0,
    betAmount: 0,

    player: { x: 50, y: 50, vy: 0, size: 30, isJumping: false },
    platforms: [],
    scrollSpeed: 2,

    init() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Touch/Click to jump/move
        this.canvas.addEventListener('mousedown', (e) => this.handleInput(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleInput(e));
    },

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    },

    showGamePrep(mode) {
        if (mode === 'real') {
            const amt = prompt('Enter bet amount (R$):');
            if (!amt) return;
            this.betAmount = parseFloat(amt) * 100;
            this.startRealGame();
        }
    },

    async startRealGame() {
        try {
            const data = await app.fetchAPI('/api/game/start', {
                method: 'POST',
                body: JSON.stringify({ amount: this.betAmount })
            });
            app.updateBalances(app.user.balance - this.betAmount);
            this.mode = 'real';
            this.startGameLoop(data.difficulty);
        } catch (e) {
            console.error(e);
        }
    },

    async startDemoGame() {
        try {
            const data = await app.fetchAPI('/api/game/demo/start', { method: 'POST' });
            this.mode = 'demo';
            this.startGameLoop(data.difficulty);
        } catch (e) {
            console.error(e);
        }
    },

    startGameLoop(diff) {
        app.showScreen('game-screen');
        document.getElementById('btn-cashout').style.display = 'block';
        
        this.isPlaying = true;
        this.multiplier = 1.0;
        this.floor = 0;
        this.platforms = [
            { x: 0, y: this.canvas.height - 50, w: this.canvas.width, h: 50, type: 'safe' }
        ];
        this.player = { x: this.canvas.width/2, y: this.canvas.height - 100, vy: 0, size: 30, isJumping: false };
        
        this.updateHUD();
        this.loop();
    },

    handleInput(e) {
        if (!this.isPlaying) return;
        if (!this.player.isJumping) {
            this.player.vy = -15;
            this.player.isJumping = true;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        
        // Simple steering
        if (x < this.canvas.width/2) {
            this.player.x -= 30;
        } else {
            this.player.x += 30;
        }
    },

    loop() {
        if (!this.isPlaying) return;

        this.update();
        this.draw();

        requestAnimationFrame(() => this.loop());
    },

    update() {
        // Scroll platforms down
        this.platforms.forEach(p => p.y += this.scrollSpeed);
        
        // Generate new platforms
        if (this.platforms[this.platforms.length - 1].y > 100) {
            this.floor++;
            this.multiplier += 0.15;
            this.updateHUD();
            
            const isDanger = Math.random() < 0.3; // simplified diff logic
            this.platforms.push({
                x: Math.random() * (this.canvas.width - 100),
                y: -50,
                w: 100,
                h: 20,
                type: isDanger ? 'danger' : 'safe'
            });
        }

        // Clean up old platforms
        this.platforms = this.platforms.filter(p => p.y < this.canvas.height);

        // Player physics
        this.player.vy += 0.5; // gravity
        this.player.y += this.player.vy;

        // Collision
        this.player.isJumping = true;
        for (let p of this.platforms) {
            if (
                this.player.vy > 0 &&
                this.player.x < p.x + p.w &&
                this.player.x + this.player.size > p.x &&
                this.player.y + this.player.size > p.y &&
                this.player.y + this.player.size < p.y + p.h + this.player.vy
            ) {
                if (p.type === 'danger') {
                    this.gameOver(true);
                    return;
                }
                this.player.y = p.y - this.player.size;
                this.player.vy = 0;
                this.player.isJumping = false;
            }
        }

        if (this.player.y > this.canvas.height) {
            this.gameOver(true);
        }
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.mode === 'demo') {
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.font = '60px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('DEMO', this.canvas.width/2, this.canvas.height/2);
        }

        // Platforms
        this.platforms.forEach(p => {
            this.ctx.fillStyle = p.type === 'danger' ? 'red' : 'green';
            this.ctx.fillRect(p.x, p.y, p.w, p.h);
        });

        // Player (🤠)
        this.ctx.font = '30px Arial';
        this.ctx.fillText('🤠', this.player.x, this.player.y + 25);
    },

    updateHUD() {
        document.getElementById('game-multiplier').textContent = this.multiplier.toFixed(2) + 'x';
        document.getElementById('game-floor').textContent = this.floor;
    },

    async cashout() {
        if (!this.isPlaying || this.mode === 'demo') {
            app.showScreen('menu-screen');
            return;
        }
        this.isPlaying = false;
        try {
            const data = await app.fetchAPI('/api/game/end', {
                method: 'POST',
                body: JSON.stringify({ multiplier: this.multiplier })
            });
            app.toast(`Cashed out! Won ${app.formatBRL(data.payout)}`);
            app.loadUserData();
            app.showScreen('menu-screen');
        } catch (e) {
            app.showScreen('menu-screen');
        }
    },

    async gameOver(isLoss = false) {
        this.isPlaying = false;
        if (this.mode === 'demo') {
            app.toast('Game Over (Demo)');
            setTimeout(() => app.showScreen('menu-screen'), 1000);
            return;
        }
        
        try {
            await app.fetchAPI('/api/game/end', {
                method: 'POST',
                body: JSON.stringify({ multiplier: 0 })
            });
            app.toast('Game Over! You lost.');
            app.loadUserData();
            setTimeout(() => app.showScreen('menu-screen'), 1500);
        } catch (e) {}
    }
};

document.addEventListener('DOMContentLoaded', () => game.init());
