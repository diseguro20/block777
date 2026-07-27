const BLOCK_COLORS = [
  '#E8432F', // Vermelho Bandeirinha
  '#F7B731', // Amarelo Palha
  '#2D8B4E', // Verde Floresta
  '#E87F24', // Laranja Quente
  '#E84393', // Rosa Pink
  '#8B5E3C'  // Marrom Madeira
];

const ALL_SHAPES = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [[1, 1], [1, 1]],
  [[1, 0], [1, 1]],
  [[0, 1], [1, 1]],
  [[1, 1], [1, 0]],
  [[1, 1], [0, 1]],
  [[1, 1, 1], [0, 1, 0]],
  [[0, 1], [1, 1], [0, 1]],
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
];

const EASY_SHAPES = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1], [1, 1]],
  [[1, 0], [1, 1]],
];

const STRICT_SHAPES = [
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  [[1, 1, 1], [1, 0, 0], [1, 0, 0]],
  [[1, 1, 1], [0, 0, 1], [0, 0, 1]],
];

const game = {
  canvas: null,
  ctx: null,
  landingCanvas: null,
  landingCtx: null,

  isPlaying: false,
  mode: 'demo', // 'real' ou 'demo'
  gameMode: 'classic', // 'classic' (8x8) ou 'chaos' (10x10)
  gridSize: 8,
  board: [],
  hand: [],
  sessionId: null,
  difficulty: 'easy',
  betAmount: 200,
  multiplier: 1.0,
  linesCleared: 0,
  score: 0,

  draggedPieceIndex: null,
  dragX: 0,
  dragY: 0,
  isDragging: false,

  // Jogo Real em Prévia Gratuita na Landing Page (8x8 Completo)
  landingDemo: {
    board: [],
    hand: [],
    gridSize: 8,
    multiplier: 1.0,
    linesCleared: 0,
    isDragging: false,
    draggedIndex: null,
    dragX: 0,
    dragY: 0,
    betBase: 2000 // R$ 20,00 base
  },

  init() {
    this.canvas = document.getElementById('blockerino-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.setupEvents();
    this.resizeCanvas();
  },

  initLandingDemo() {
    this.landingCanvas = document.getElementById('mini-demo-canvas');
    if (!this.landingCanvas) return;
    this.landingCtx = this.landingCanvas.getContext('2d');

    const container = this.landingCanvas.parentElement;
    const containerW = (container && container.clientWidth > 50) ? container.clientWidth - 16 : 340;
    const size = Math.max(Math.min(containerW, 400), 290);

    this.landingCanvas.width = size;
    this.landingCanvas.height = size + 120; // Grid 8x8 + Mão de Peças

    this.landingDemo.gridSize = 8;
    this.landingDemo.board = Array(8).fill(null).map(() => Array(8).fill(null));

    // Blocos decorativos iniciais coloridos para engajamento imediato
    this.landingDemo.board[1][1] = BLOCK_COLORS[0];
    this.landingDemo.board[1][2] = BLOCK_COLORS[0];
    this.landingDemo.board[3][4] = BLOCK_COLORS[1];
    this.landingDemo.board[4][4] = BLOCK_COLORS[1];
    this.landingDemo.board[7][0] = BLOCK_COLORS[2];
    this.landingDemo.board[7][1] = BLOCK_COLORS[2];
    this.landingDemo.board[7][2] = BLOCK_COLORS[2];
    this.landingDemo.board[7][3] = BLOCK_COLORS[2];

    this.landingDemo.multiplier = 1.0;
    this.landingDemo.linesCleared = 0;
    this.generateLandingHand();
    this.setupLandingEvents();
    this.drawLandingDemo();
    this.updateLandingHud();
  },

  generateLandingHand() {
    this.landingDemo.hand = [];
    const shapes = EASY_SHAPES;
    for (let i = 0; i < 3; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
      this.landingDemo.hand.push({ shape, color, used: false });
    }
  },

  setupLandingEvents() {
    if (!this.landingCanvas) return;

    const getPos = (e) => {
      const rect = this.landingCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.landingCanvas.width / rect.width),
        y: (clientY - rect.top) * (this.landingCanvas.height / rect.height)
      };
    };

    const handleStart = (e) => {
      const pos = getPos(e);
      const handAreaY = this.landingCanvas.width;
      if (pos.y >= handAreaY) {
        const slotW = this.landingCanvas.width / this.landingDemo.hand.length;
        const idx = Math.floor(pos.x / slotW);
        if (this.landingDemo.hand[idx] && !this.landingDemo.hand[idx].used) {
          this.landingDemo.isDragging = true;
          this.landingDemo.draggedIndex = idx;
          this.landingDemo.dragX = pos.x;
          this.landingDemo.dragY = pos.y;
          this.drawLandingDemo();
        }
      }
    };

    const handleMove = (e) => {
      if (!this.landingDemo.isDragging) return;
      e.preventDefault();
      const pos = getPos(e);
      this.landingDemo.dragX = pos.x;
      this.landingDemo.dragY = pos.y;
      this.drawLandingDemo();
    };

    const handleEnd = () => {
      if (!this.landingDemo.isDragging) return;
      this.landingDemo.isDragging = false;
      this.tryPlaceLandingPiece();
      this.landingDemo.draggedIndex = null;
      this.drawLandingDemo();
    };

    this.landingCanvas.onmousedown = handleStart;
    this.landingCanvas.onmousemove = handleMove;
    this.landingCanvas.onmouseup = handleEnd;

    this.landingCanvas.ontouchstart = handleStart;
    this.landingCanvas.ontouchmove = handleMove;
    this.landingCanvas.ontouchend = handleEnd;
  },

  tryPlaceLandingPiece() {
    const idx = this.landingDemo.draggedIndex;
    if (idx === null) return;
    const piece = this.landingDemo.hand[idx];
    if (!piece || piece.used) return;

    const gridW = this.landingCanvas.width;
    const cellSize = gridW / 8;

    const col = Math.floor((this.landingDemo.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
    const row = Math.floor((this.landingDemo.dragY - 25 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

    if (this.canPlaceOnGrid(this.landingDemo.board, piece.shape, row, col, 8)) {
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) {
            this.landingDemo.board[row + r][col + c] = piece.color;
          }
        }
      }
      piece.used = true;
      this.checkLandingLines();

      if (this.landingDemo.hand.every(p => p.used)) {
        this.generateLandingHand();
      }
    }
  },

  checkLandingLines() {
    let lines = 0;
    const board = this.landingDemo.board;
    const rowsToClear = [];
    const colsToClear = [];

    for (let r = 0; r < 8; r++) {
      if (board[r].every(c => c !== null)) rowsToClear.push(r);
    }

    for (let c = 0; c < 8; c++) {
      let full = true;
      for (let r = 0; r < 8; r++) if (!board[r][c]) full = false;
      if (full) colsToClear.push(c);
    }

    lines = rowsToClear.length + colsToClear.length;

    if (lines > 0) {
      rowsToClear.forEach(r => { for (let c = 0; c < 8; c++) board[r][c] = null; });
      colsToClear.forEach(c => { for (let r = 0; r < 8; r++) board[r][c] = null; });

      this.landingDemo.linesCleared += lines;
      this.landingDemo.multiplier = parseFloat((this.landingDemo.multiplier + lines * 0.20).toFixed(2));
      this.updateLandingHud();
      app.showToast(`🔥 ${lines} LINHA(S) QUEBRADA(S)! Multiplicador: ${this.landingDemo.multiplier.toFixed(2)}x`);
    }
  },

  updateLandingHud() {
    const multEl = document.getElementById('mini-demo-mult');
    if (multEl) multEl.textContent = `${this.landingDemo.multiplier.toFixed(2)}x`;
    
    const linesEl = document.getElementById('mini-demo-lines');
    if (linesEl) linesEl.textContent = this.landingDemo.linesCleared;

    const valEl = document.getElementById('mini-demo-value');
    const profitCentavos = Math.round(this.landingDemo.betBase * this.landingDemo.multiplier);
    const profitStr = app.formatBRL(profitCentavos);

    if (valEl) valEl.textContent = profitStr;

    const ctaBtn = document.getElementById('landing-cta-btn');
    if (ctaBtn) {
      ctaBtn.innerHTML = `🔥 GANHAR ${profitStr} DE VERDADE (RESGATAR BÔNUS 300%) 🚀`;
    }
  },

  drawLandingDemo() {
    if (!this.landingCtx || !this.landingCanvas) return;
    const ctx = this.landingCtx;
    const w = this.landingCanvas.width;
    const gridW = w;
    const cellSize = gridW / 8;

    ctx.clearRect(0, 0, w, this.landingCanvas.height);
    ctx.fillStyle = '#1a0a2e';
    ctx.fillRect(0, 0, gridW, gridW);

    ctx.strokeStyle = 'rgba(139, 94, 60, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(gridW, i * cellSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, gridW); ctx.stroke();
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.landingDemo.board[r][c]) {
          this.drawBlockCtx(ctx, c * cellSize, r * cellSize, cellSize, this.landingDemo.board[r][c]);
        }
      }
    }

    // Preview do Arraste no Jogo Real em Prévia
    if (this.landingDemo.isDragging && this.landingDemo.draggedIndex !== null) {
      const piece = this.landingDemo.hand[this.landingDemo.draggedIndex];
      if (piece) {
        const col = Math.floor((this.landingDemo.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
        const row = Math.floor((this.landingDemo.dragY - 25 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);
        if (this.canPlaceOnGrid(this.landingDemo.board, piece.shape, row, col, 8)) {
          ctx.globalAlpha = 0.5;
          for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
              if (piece.shape[r][c]) {
                this.drawBlockCtx(ctx, (col + c) * cellSize, (row + r) * cellSize, cellSize, piece.color);
              }
            }
          }
          ctx.globalAlpha = 1.0;
        }
      }
    }

    // Área da mão de peças (Rodapé)
    ctx.fillStyle = '#0d0618';
    ctx.fillRect(0, gridW, w, 120);
    ctx.strokeStyle = '#8B5E3C';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gridW); ctx.lineTo(w, gridW); ctx.stroke();

    const slotW = w / 3;
    const miniCell = cellSize * 0.65;
    this.landingDemo.hand.forEach((p, idx) => {
      if (p.used) return;
      if (this.landingDemo.isDragging && this.landingDemo.draggedIndex === idx) {
        const pW = p.shape[0].length * cellSize;
        const pH = p.shape.length * cellSize;
        const startX = this.landingDemo.dragX - pW / 2;
        const startY = this.landingDemo.dragY - 25 - pH / 2;
        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) this.drawBlockCtx(ctx, startX + c * cellSize, startY + r * cellSize, cellSize, p.color);
          }
        }
      } else {
        const startX = idx * slotW + slotW / 2 - (p.shape[0].length * miniCell) / 2;
        const startY = gridW + 60 - (p.shape.length * miniCell) / 2;
        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) this.drawBlockCtx(ctx, startX + c * miniCell, startY + r * miniCell, miniCell, p.color);
          }
        }
      }
    });

    ctx.font = 'bold 11px Silkscreen';
    ctx.fillStyle = 'rgba(247, 183, 49, 0.5)';
    ctx.fillText('JOGO REAL — PRÉVIA GRATUITA', 10, gridW - 10);
  },

  canPlaceOnGrid(grid, shape, startRow, startCol, maxGrid) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const tr = startRow + r;
          const tc = startCol + c;
          if (tr < 0 || tr >= maxGrid || tc < 0 || tc >= maxGrid || grid[tr][tc] !== null) return false;
        }
      }
    }
    return true;
  },

  setupEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.canvas.width / rect.width),
        y: (clientY - rect.top) * (this.canvas.height / rect.height)
      };
    };

    const handleStart = (e) => {
      if (!this.isPlaying) return;
      const pos = getPos(e);
      const handAreaY = this.canvas.width;
      
      if (pos.y >= handAreaY) {
        const slotWidth = this.canvas.width / this.hand.length;
        const index = Math.floor(pos.x / slotWidth);
        if (this.hand[index] && !this.hand[index].used) {
          this.isDragging = true;
          this.draggedPieceIndex = index;
          this.dragX = pos.x;
          this.dragY = pos.y;
          this.draw();
        }
      }
    };

    const handleMove = (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const pos = getPos(e);
      this.dragX = pos.x;
      this.dragY = pos.y;
      this.draw();
    };

    const handleEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.tryPlacePiece();
      this.draggedPieceIndex = null;
      this.draw();
    };

    this.canvas.onmousedown = handleStart;
    this.canvas.onmousemove = handleMove;
    this.canvas.onmouseup = handleEnd;

    this.canvas.ontouchstart = handleStart;
    this.canvas.ontouchmove = handleMove;
    this.canvas.ontouchend = handleEnd;
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    const width = Math.min(container.clientWidth - 16, 420);
    this.canvas.width = width;
    this.canvas.height = width + 130;
    if (this.isPlaying) this.draw();
  },

  showPrep(mode, gameModeType = 'classic') {
    this.mode = mode;
    this.gameMode = gameModeType;
    this.gridSize = gameModeType === 'chaos' ? 10 : 8;

    if (mode === 'real') {
      document.getElementById('prep-modal').classList.add('active');
    } else {
      this.startDemoGame();
    }
  },

  async startRealGame() {
    const inputVal = document.getElementById('bet-input-val').value;
    const betVal = parseFloat(inputVal);
    if (isNaN(betVal) || betVal < 1.0 || betVal > 100.0) {
      app.showToast('Valor de aposta inválido! Mínimo R$ 1,00 - Máximo R$ 100,00.');
      return;
    }

    this.betAmount = Math.round(betVal * 100);

    if (app.user.balance < this.betAmount) {
      document.getElementById('prep-modal').classList.remove('active');
      app.showToast('Saldo insuficiente! Faça um depósito PIX.');
      app.showScreen('wallet-screen');
      return;
    }

    try {
      const data = await app.fetchAPI('/api/game/start', {
        method: 'POST',
        body: JSON.stringify({ amount: this.betAmount })
      });

      app.user.balance = data.balance_after;
      app.updateBalanceDisplays();

      this.sessionId = data.sessionId;
      this.difficulty = data.difficulty;
      this.multiplier = 1.0;
      this.linesCleared = 0;
      this.score = 0;

      document.getElementById('prep-modal').classList.remove('active');
      app.showScreen('game-screen');
      this.initBoard();
      this.isPlaying = true;
      
      document.getElementById('btn-cashout').style.display = 'flex';
      this.updateHud();
      this.draw();
      app.showToast('🎉 Partida iniciada no Arraiá! Boa sorte!');
    } catch (err) {
      app.showToast(err.message || 'Erro ao iniciar partida.');
    }
  },

  async startDemoGame() {
    this.sessionId = 'demo-' + Date.now();
    this.difficulty = 'easy';
    this.multiplier = 1.0;
    this.linesCleared = 0;
    this.score = 0;
    this.mode = 'demo';

    try {
      await app.fetchAPI('/api/game/demo/start', { method: 'POST' });
    } catch (e) {}

    app.showScreen('game-screen');
    this.initBoard();
    this.isPlaying = true;
    
    document.getElementById('btn-cashout').style.display = 'none';
    this.updateHud();
    this.draw();
    app.showToast('🌽 Modo Treino Demo Iniciado!');
  },

  initBoard() {
    this.board = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
    this.generateHand();
  },

  generateHand() {
    const handSize = this.gameMode === 'chaos' ? 5 : 3;
    this.hand = [];

    let pool = ALL_SHAPES;
    if (this.difficulty === 'easy') {
      pool = EASY_SHAPES;
    } else if (this.difficulty === 'strict' && this.getBoardFillRatio() > 0.4) {
      pool = STRICT_SHAPES;
    }

    for (let i = 0; i < handSize; i++) {
      const shape = pool[Math.floor(Math.random() * pool.length)];
      const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
      this.hand.push({ shape, color, used: false });
    }
  },

  getBoardFillRatio() {
    let filled = 0;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.board[r][c]) filled++;
      }
    }
    return filled / (this.gridSize * this.gridSize);
  },

  tryPlacePiece() {
    if (this.draggedPieceIndex === null) return;
    const piece = this.hand[this.draggedPieceIndex];
    if (!piece || piece.used) return;

    const boardWidth = this.canvas.width;
    const cellSize = boardWidth / this.gridSize;

    const col = Math.floor((this.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
    const row = Math.floor((this.dragY - 30 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

    if (this.canPlaceOnGrid(this.board, piece.shape, row, col, this.gridSize)) {
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) {
            this.board[row + r][col + c] = piece.color;
          }
        }
      }

      piece.used = true;
      this.checkLines();

      if (this.hand.every(p => p.used)) {
        this.generateHand();
      }

      if (!this.canAnyPieceBePlaced()) {
        this.handleGameOver();
      }
    }
  },

  canAnyPieceBePlaced() {
    for (const piece of this.hand) {
      if (piece.used) continue;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (this.canPlaceOnGrid(this.board, piece.shape, r, c, this.gridSize)) {
            return true;
          }
        }
      }
    }
    return false;
  },

  checkLines() {
    const rowsToClear = [];
    const colsToClear = [];

    for (let r = 0; r < this.gridSize; r++) {
      if (this.board[r].every(cell => cell !== null)) {
        rowsToClear.push(r);
      }
    }

    for (let c = 0; c < this.gridSize; c++) {
      let full = true;
      for (let r = 0; r < this.gridSize; r++) {
        if (this.board[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) colsToClear.push(c);
    }

    const totalLines = rowsToClear.length + colsToClear.length;
    if (totalLines > 0) {
      rowsToClear.forEach(r => {
        for (let c = 0; c < this.gridSize; c++) this.board[r][c] = null;
      });

      colsToClear.forEach(c => {
        for (let r = 0; r < this.gridSize; r++) this.board[r][c] = null;
      });

      this.linesCleared += totalLines;
      const baseIncrease = totalLines * 0.15;
      const comboBonus = totalLines > 1 ? totalLines * 0.10 : 0;
      this.multiplier = parseFloat((this.multiplier + baseIncrease + comboBonus).toFixed(2));
      this.score += totalLines * 100;

      this.updateHud();
      app.showToast(`🔥 ${totalLines} LINHA(S) QUEBRADA(S)! Multiplicador: ${this.multiplier.toFixed(2)}x`);
    }
  },

  updateHud() {
    document.getElementById('hud-multiplier').textContent = `${this.multiplier.toFixed(2)}x`;
    document.getElementById('hud-lines').textContent = this.linesCleared;
    
    const payout = Math.floor(this.betAmount * this.multiplier);
    document.getElementById('hud-payout').textContent = app.formatBRL(payout);
  },

  async cashout() {
    if (!this.isPlaying || this.mode !== 'real') return;
    this.isPlaying = false;

    try {
      const data = await app.fetchAPI('/api/game/end', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.sessionId,
          floorsReached: this.linesCleared,
          multiplier: this.multiplier
        })
      });

      app.user.balance = data.balance_after;
      app.updateBalanceDisplays();

      document.getElementById('win-modal-payout').textContent = app.formatBRL(data.payout);
      document.getElementById('win-modal-mult').textContent = `${data.multiplier.toFixed(2)}x`;
      document.getElementById('win-modal').classList.add('active');
    } catch (err) {
      app.showToast(err.message || 'Erro ao realizar resgate de vitória.');
    }
  },

  async handleGameOver() {
    this.isPlaying = false;

    if (this.mode === 'real') {
      try {
        await app.fetchAPI('/api/game/end', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: this.sessionId,
            floorsReached: this.linesCleared,
            multiplier: 0
          })
        });
      } catch (e) {}
    }

    document.getElementById('gameover-modal').classList.add('active');
  },

  draw() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const gridW = w;
    const cellSize = gridW / this.gridSize;

    this.ctx.clearRect(0, 0, w, this.canvas.height);
    this.ctx.fillStyle = '#1a0a2e';
    this.ctx.fillRect(0, 0, gridW, gridW);

    this.ctx.strokeStyle = 'rgba(139, 94, 60, 0.3)';
    this.ctx.lineWidth = 1;

    for (let r = 0; r <= this.gridSize; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, r * cellSize);
      this.ctx.lineTo(gridW, r * cellSize);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(r * cellSize, 0);
      this.ctx.lineTo(r * cellSize, gridW);
      this.ctx.stroke();
    }

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.board[r][c]) {
          this.drawBlockCtx(this.ctx, c * cellSize, r * cellSize, cellSize, this.board[r][c]);
        }
      }
    }

    if (this.isDragging && this.draggedPieceIndex !== null) {
      const piece = this.hand[this.draggedPieceIndex];
      if (piece) {
        const col = Math.floor((this.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
        const row = Math.floor((this.dragY - 30 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

        if (this.canPlaceOnGrid(this.board, piece.shape, row, col, this.gridSize)) {
          this.ctx.globalAlpha = 0.45;
          for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
              if (piece.shape[r][c]) {
                this.drawBlockCtx(this.ctx, (col + c) * cellSize, (row + r) * cellSize, cellSize, piece.color);
              }
            }
          }
          this.ctx.globalAlpha = 1.0;
        }
      }
    }

    const handAreaY = gridW;
    this.ctx.fillStyle = '#0d0618';
    this.ctx.fillRect(0, handAreaY, w, 130);

    this.ctx.strokeStyle = '#8B5E3C';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, handAreaY);
    this.ctx.lineTo(w, handAreaY);
    this.ctx.stroke();

    const slotWidth = w / this.hand.length;
    const miniCellSize = Math.min(cellSize * 0.65, 24);

    this.hand.forEach((p, idx) => {
      if (p.used) return;

      if (this.isDragging && this.draggedPieceIndex === idx) {
        const pW = p.shape[0].length * cellSize;
        const pH = p.shape.length * cellSize;
        const startX = this.dragX - pW / 2;
        const startY = this.dragY - 30 - pH / 2;

        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) {
              this.drawBlockCtx(this.ctx, startX + c * cellSize, startY + r * cellSize, cellSize, p.color);
            }
          }
        }
      } else {
        const slotCenterX = idx * slotWidth + slotWidth / 2;
        const slotCenterY = handAreaY + 65;
        const pW = p.shape[0].length * miniCellSize;
        const pH = p.shape.length * miniCellSize;
        const startX = slotCenterX - pW / 2;
        const startY = slotCenterY - pH / 2;

        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) {
              this.drawBlockCtx(this.ctx, startX + c * miniCellSize, startY + r * miniCellSize, miniCellSize, p.color);
            }
          }
        }
      }
    });

    if (this.mode === 'demo') {
      this.ctx.font = 'bold 12px Silkscreen';
      this.ctx.fillStyle = 'rgba(247, 183, 49, 0.4)';
      this.ctx.fillText('MODO TREINO DEMO', 10, gridW - 10);
    }
  },

  drawBlockCtx(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x + 1, y + 1, size - 2, 3);
    ctx.fillRect(x + 1, y + 1, 3, size - 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x + 1, y + size - 4, size - 2, 3);
    ctx.fillRect(x + size - 4, y + 1, 3, size - 2);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => game.initLandingDemo(), 150);
});
window.addEventListener('load', () => {
  setTimeout(() => game.initLandingDemo(), 200);
});
