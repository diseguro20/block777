const BLOCK_COLORS = [
  '#E8432F',
  '#F7B731',
  '#2D8B4E',
  '#E87F24',
  '#E84393',
  '#8B5E3C'
];

const ALL_SHAPES = [
  [[1,0,0],[1,1,1]], [[1,1],[1,0],[1,0]], [[1,1,1],[0,0,1]], [[0,1],[0,1],[1,1]],
  [[0,0,1],[1,1,1]], [[1,0],[1,0],[1,1]], [[1,1,1],[1,0,0]], [[1,1],[0,1],[0,1]],
  [[1, 1, 1], [0, 1, 0]],
  [[1,0],[1,1],[1,0]], [[0,1,0],[1,1,1]], [[0,1],[1,1],[0,1]],
  [[0,1,1],[1,1,0]], [[1,0],[1,1],[0,1]], [[1,1,0],[0,1,1]], [[0,1],[1,1],[1,0]],
  [[1,1,1],[1,1,1],[1,1,1]], [[1,1],[1,1]], [[1],[1],[1],[1]], [[1,1,1,1]],
  [[1],[1],[1]], [[1,1,1]], [[1],[1]], [[1,1]]
];

const ORIGINAL_WEIGHTS = [
  2, 2, 2, 2, 2, 2, 2, 2,
  1.5, 1.5, 1.5, 1.5,
  1, 1, 1, 1,
  3, 6, 2, 2, 4, 4, 2, 2
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

// Peças IMPOSSÍVEIS — SOMENTE formas que criam buracos inevitáveis
// 2x2, 3x3, L, J, T e barras REMOVIDOS — todos ajudam a fechar linhas
const IMPOSSIBLE_SHAPES = [
  // S e Z — criam buracos SEMPRE
  [[0, 1, 1], [1, 1, 0]],       // S horizontal
  [[1, 1, 0], [0, 1, 1]],       // Z horizontal
  [[0, 1], [1, 1], [1, 0]],     // S vertical
  [[1, 0], [1, 1], [0, 1]],     // Z vertical
  // S e Z grandes (3x3) — buracos ainda piores
  [[0, 0, 1], [0, 1, 1], [1, 1, 0]],   // S grande
  [[1, 0, 0], [1, 1, 0], [0, 1, 1]],   // Z grande
  [[0, 1, 1], [1, 1, 0], [1, 0, 0]],   // S grande rot
  [[1, 1, 0], [0, 1, 1], [0, 0, 1]],   // Z grande rot
  // Cruz — 4 gaps nos cantos
  [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
  // Escadas diagonais — gaps impossíveis
  [[1, 1, 0], [0, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [0, 1, 0], [1, 1, 0]],
  // U e C — buraco interno que nada preenche
  [[1, 0, 1], [1, 1, 1]],
  [[1, 1, 1], [1, 0, 1]],
];

// S/Z = 80% das peças
const IMPOSSIBLE_WEIGHTS = [
  18,  // S horizontal
  18,  // Z horizontal
  18,  // S vertical
  18,  // Z vertical
  12,  // S grande
  12,  // Z grande
  12,  // S grande rot
  12,  // Z grande rot
  6,   // Cruz
  5,   // Escada 1
  5,   // Escada 2
  3,   // U
  3,   // C
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
  multiplierProfile: 'standard',
  betAmount: 200,
  multiplier: 1.0,
  linesCleared: 0,
  score: 0,
  blocksPlaced: 0,
  combo: 0,
  misses: 0,
  eventsBound: false,
  landingEventsBound: false,

  draggedPieceIndex: null,
  dragX: 0,
  dragY: 0,
  isDragging: false,
  dragLift: 30,
  lineCelebration: null,
  celebrationFrame: null,
  audioContext: null,
  soundEnabled: localStorage.getItem('blockerino-sound') !== 'off',

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
    dragLift: 25,
    betBase: 2000 // R$ 20,00 base
  },

  init() {
    this.canvas = document.getElementById('blockerino-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      app.showToast('Seu navegador não conseguiu iniciar o tabuleiro.');
      return;
    }
    if (!this.eventsBound) {
      this.setupEvents();
      this.eventsBound = true;
    }
    this.updateSoundButton();
    this.resizeCanvas();
  },

  unlockAudio() {
    if (!this.soundEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
    return this.audioContext;
  },

  playTone(frequency, delay = 0, duration = 0.16, type = 'sine', volume = 0.04) {
    const context = this.unlockAudio();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  },

  playLineCompleteSound(lines = 1) {
    if (!this.soundEnabled) return;
    const lift = Math.min(1.2, 1 + (lines - 1) * 0.04);
    [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
      this.playTone(note * lift, index * 0.065, 0.2, index < 3 ? 'triangle' : 'sine', 0.045);
    });
  },

  playCashoutSound(multiplier = 1) {
    if (!this.soundEnabled) return;
    const lift = Math.min(1.25, 1 + Math.max(0, multiplier - 1) * 0.04);
    [659.25, 783.99, 987.77, 1318.51].forEach((note, index) => {
      this.playTone(note * lift, index * 0.09, 0.28, 'sine', 0.05);
      this.playTone(note * 2 * lift, index * 0.09 + 0.025, 0.1, 'square', 0.012);
    });
  },

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('blockerino-sound', this.soundEnabled ? 'on' : 'off');
    this.updateSoundButton();
    if (this.soundEnabled) {
      this.unlockAudio();
      this.playTone(659.25, 0, 0.1, 'sine', 0.035);
      this.playTone(987.77, 0.07, 0.14, 'sine', 0.04);
    }
  },

  updateSoundButton() {
    const button = document.getElementById('btn-game-sound');
    if (!button) return;
    button.textContent = this.soundEnabled ? '🔊 Som' : '🔇 Som';
    button.setAttribute('aria-pressed', String(this.soundEnabled));
    button.setAttribute('aria-label', this.soundEnabled ? 'Silenciar efeitos sonoros' : 'Ativar efeitos sonoros');
  },

  initLandingDemo() {
    this.landingCanvas = document.getElementById('mini-demo-canvas');
    if (!this.landingCanvas) return;
    this.landingCtx = this.landingCanvas.getContext('2d');

    const container = this.landingCanvas.parentElement;
    const containerW = (container && container.clientWidth > 50) ? container.clientWidth : 340;
    const size = Math.max(Math.min(containerW, 480), 260);

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
    if (!this.landingEventsBound) {
      this.setupLandingEvents();
      this.landingEventsBound = true;
      window.addEventListener('resize', () => this.resizeLandingCanvas(), { passive: true });
    }
    this.drawLandingDemo();
    this.updateLandingHud();
  },

  resizeLandingCanvas() {
    if (!this.landingCanvas || !this.landingCanvas.parentElement) return;
    const width = Math.max(Math.min(this.landingCanvas.parentElement.clientWidth, 480), 260);
    if (Math.abs(this.landingCanvas.width - width) < 2 && Math.abs(this.landingCanvas.height - (width + 120)) < 2) return;
    this.landingCanvas.width = width;
    this.landingCanvas.height = width + 120;
    this.drawLandingDemo();
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
      return {
        x: (e.clientX - rect.left) * (this.landingCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.landingCanvas.height / rect.height)
      };
    };

    const handleStart = (e) => {
      if (!e.isPrimary) return;
      this.unlockAudio();
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
          this.landingDemo.dragLift = e.pointerType === 'touch' ? Math.min(72, this.landingCanvas.width * 0.2) : 25;
          this.landingCanvas.setPointerCapture?.(e.pointerId);
          e.preventDefault();
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

    const handleEnd = (e) => {
      if (!this.landingDemo.isDragging) return;
      const pos = getPos(e);
      this.landingDemo.dragX = pos.x;
      this.landingDemo.dragY = pos.y;
      this.landingDemo.isDragging = false;
      this.tryPlaceLandingPiece();
      this.landingDemo.draggedIndex = null;
      this.landingCanvas.releasePointerCapture?.(e.pointerId);
      this.drawLandingDemo();
    };

    const handleCancel = (e) => {
      if (!this.landingDemo.isDragging) return;
      this.landingDemo.isDragging = false;
      this.landingDemo.draggedIndex = null;
      this.landingCanvas.releasePointerCapture?.(e.pointerId);
      this.drawLandingDemo();
    };

    this.landingCanvas.addEventListener('pointerdown', handleStart);
    this.landingCanvas.addEventListener('pointermove', handleMove);
    this.landingCanvas.addEventListener('pointerup', handleEnd);
    this.landingCanvas.addEventListener('pointercancel', handleCancel);
  },

  tryPlaceLandingPiece() {
    const idx = this.landingDemo.draggedIndex;
    if (idx === null) return;
    const piece = this.landingDemo.hand[idx];
    if (!piece || piece.used) return;

    const gridW = this.landingCanvas.width;
    const cellSize = gridW / 8;

    const col = Math.floor((this.landingDemo.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
    const row = Math.floor((this.landingDemo.dragY - this.landingDemo.dragLift - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

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
      this.playLineCompleteSound(lines);
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
      ctaBtn.innerHTML = `🔥 GANHAR ${profitStr} DE VERDADE (RESGATAR BÔNUS) 🚀`;
    }
  },

  drawLandingDemo() {
    if (!this.landingCtx || !this.landingCanvas) return;
    const ctx = this.landingCtx;
    const w = this.landingCanvas.width;
    const gridW = w;
    const cellSize = gridW / 8;

    ctx.clearRect(0, 0, w, this.landingCanvas.height);
    ctx.fillStyle = '#070b0b';
    ctx.fillRect(0, 0, gridW, gridW);

    ctx.strokeStyle = 'rgba(122, 145, 139, 0.22)';
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
        const row = Math.floor((this.landingDemo.dragY - this.landingDemo.dragLift - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);
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
    ctx.fillStyle = '#0a100f';
    ctx.fillRect(0, gridW, w, 120);
    ctx.strokeStyle = '#21302d';
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
        const startY = this.landingDemo.dragY - this.landingDemo.dragLift - pH / 2;
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
    ctx.fillStyle = 'rgba(201, 255, 67, 0.5)';
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
    const handleViewportResize = () => this.resizeCanvas();
    window.addEventListener('resize', handleViewportResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleViewportResize, { passive: true });

    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    };

    const handleStart = (e) => {
      if (!this.isPlaying || !e.isPrimary) return;
      this.unlockAudio();
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
          this.dragLift = e.pointerType === 'touch' ? Math.min(76, this.canvas.width * 0.22) : 30;
          this.canvas.setPointerCapture?.(e.pointerId);
          this.canvas.closest('.game-shell')?.classList.add('dragging');
          e.preventDefault();
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

    const handleEnd = (e) => {
      if (!this.isDragging) return;
      const pos = getPos(e);
      this.dragX = pos.x;
      this.dragY = pos.y;
      this.isDragging = false;
      this.tryPlacePiece();
      this.draggedPieceIndex = null;
      this.canvas.releasePointerCapture?.(e.pointerId);
      this.canvas.closest('.game-shell')?.classList.remove('dragging');
      this.draw();
    };

    const handleCancel = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.draggedPieceIndex = null;
      this.canvas.releasePointerCapture?.(e.pointerId);
      this.canvas.closest('.game-shell')?.classList.remove('dragging');
      this.draw();
    };

    this.canvas.addEventListener('pointerdown', handleStart);
    this.canvas.addEventListener('pointermove', handleMove);
    this.canvas.addEventListener('pointerup', handleEnd);
    this.canvas.addEventListener('pointercancel', handleCancel);
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    const shell = this.canvas.closest('.game-shell');
    const playfield = this.canvas.closest('.game-playfield');
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const isMobile = window.matchMedia('(max-width: 580px)').matches;
    const verticalReserve = viewportHeight <= 600 ? 315 : 350;
    const heightBound = isMobile ? viewportHeight - verticalReserve : 620;
    const minimumWidth = isMobile ? 210 : 260;
    const availableWidth = Math.min(shell?.clientWidth || container.clientWidth, window.innerWidth - 16, 620);
    const width = Math.max(minimumWidth, Math.min(availableWidth, heightBound));
    if (playfield) playfield.style.maxWidth = `${width}px`;
    if (Math.abs(this.canvas.width - width) < 2 && Math.abs(this.canvas.height - (width + 130)) < 2) return;
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
      this.multiplierProfile = data.multiplierProfile === 'demo' ? 'demo' : 'standard';
      this.multiplier = 1.0;
      this.linesCleared = 0;
      this.score = 0;
      this.blocksPlaced = 0;
      this.combo = 0;
      this.misses = 0;

      document.getElementById('prep-modal').classList.remove('active');
      app.showScreen('game-screen');
      this.init();
      this.initBoard();
      this.isPlaying = true;
      
      document.getElementById('btn-cashout').style.display = 'flex';
      document.getElementById('btn-cashout').disabled = false;
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
    this.multiplierProfile = 'standard';
    this.multiplier = 1.0;
    this.linesCleared = 0;
    this.score = 0;
    this.blocksPlaced = 0;
    this.combo = 0;
    this.misses = 0;
    this.mode = 'demo';

    try {
      await app.fetchAPI('/api/game/demo/start', { method: 'POST' });
    } catch (e) {}

    app.showScreen('game-screen');
    this.init();
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

    let pool, weights;

    if (this.difficulty === 'easy') {
      pool = EASY_SHAPES;
      weights = null;
    } else if (this.difficulty === 'impossible' || this.difficulty === 'balanced') {
      pool = IMPOSSIBLE_SHAPES;
      weights = IMPOSSIBLE_WEIGHTS;
    } else if (this.difficulty === 'strict') {
      pool = this.getBoardFillRatio() > 0.3 ? STRICT_SHAPES : IMPOSSIBLE_SHAPES;
      weights = this.getBoardFillRatio() > 0.3 ? null : IMPOSSIBLE_WEIGHTS;
    } else {
      pool = IMPOSSIBLE_SHAPES;
      weights = IMPOSSIBLE_WEIGHTS;
    }

    for (let i = 0; i < handSize; i++) {
      const shape = weights
        ? this.pickWeightedShape(pool, weights)
        : pool[Math.floor(Math.random() * pool.length)];
      const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
      this.hand.push({ shape, color, used: false });
    }
  },

  pickWeightedShape(shapes, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    for (let i = 0; i < shapes.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) return shapes[i];
    }
    return shapes[shapes.length - 1];
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
    const row = Math.floor((this.dragY - this.dragLift - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

    if (this.canPlaceOnGrid(this.board, piece.shape, row, col, this.gridSize)) {
      let placedBlocks = 0;
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) {
            this.board[row + r][col + c] = piece.color;
            placedBlocks++;
          }
        }
      }

      piece.used = true;
      this.score += placedBlocks;
      this.blocksPlaced += placedBlocks;
      if (this.multiplierProfile === 'demo') {
        this.multiplier = Math.min(10, parseFloat((this.multiplier + 0.50).toFixed(2)));
      }
      const clearedLines = this.checkLines(placedBlocks);

      if (clearedLines === 0) {
        this.misses++;
        if (this.misses >= this.hand.length) {
          this.combo = 0;
          this.misses = 0;
        }
      } else {
        this.combo += clearedLines;
        this.misses = 0;
      }

      if (this.hand.every(p => p.used)) {
        this.generateHand();
      }

      this.updateHud();
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

  checkLines(placedBlocks = 0) {
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
      const previousMultiplier = this.multiplier;
      rowsToClear.forEach(r => {
        for (let c = 0; c < this.gridSize; c++) this.board[r][c] = null;
      });

      colsToClear.forEach(c => {
        for (let r = 0; r < this.gridSize; r++) this.board[r][c] = null;
      });

      this.linesCleared += totalLines;

      if (this.multiplierProfile === 'demo') {
        // Demo avança sempre em passos exatos de 0,50x, até o teto de 10x.
        this.multiplier = Math.min(10, parseFloat((this.multiplier + totalLines * 0.50).toFixed(2)));
      } else {
        const baseIncrease = totalLines * 0.05;
        const comboBonus = Math.min(this.combo + totalLines, 5) * 0.01;
        this.multiplier = parseFloat((this.multiplier + baseIncrease + comboBonus).toFixed(2));
      }
      this.playLineCompleteSound(totalLines);
      
      this.score += Math.round(totalLines * this.gridSize * Math.max(1, (this.combo + totalLines) / 2) * Math.max(1, placedBlocks));
      this.triggerLineCelebration(rowsToClear, colsToClear, previousMultiplier);

      app.showToast(`🔥 ${totalLines} LINHA(S) QUEBRADA(S)! Multiplicador: ${this.multiplier.toFixed(2)}x`);
    }
    return totalLines;
  },

  triggerLineCelebration(rows, cols, previousMultiplier) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const totalPayout = Math.floor(this.betAmount * this.multiplier);
    const effect = document.getElementById('cash-in-effect');
    const value = document.getElementById('cash-in-value');
    const multiplier = document.getElementById('cash-in-multiplier');

    if (value) value.textContent = app.formatBRL(totalPayout);
    if (multiplier) multiplier.textContent = `${previousMultiplier.toFixed(2)}x → ${this.multiplier.toFixed(2)}x`;
    if (effect) {
      effect.classList.remove('active');
      void effect.offsetWidth;
      effect.classList.add('active');
      window.setTimeout(() => effect.classList.remove('active'), reducedMotion ? 300 : 1450);
    }

    if (navigator.vibrate && !reducedMotion) navigator.vibrate([35, 25, 55]);
    if (reducedMotion) return;

    this.lineCelebration = {
      rows: [...rows],
      cols: [...cols],
      startedAt: performance.now(),
      duration: 1050
    };
    if (this.celebrationFrame) cancelAnimationFrame(this.celebrationFrame);

    const animate = now => {
      if (!this.lineCelebration) return;
      this.draw(now);
      if (now - this.lineCelebration.startedAt < this.lineCelebration.duration) {
        this.celebrationFrame = requestAnimationFrame(animate);
      } else {
        this.lineCelebration = null;
        this.celebrationFrame = null;
        this.draw();
      }
    };
    this.celebrationFrame = requestAnimationFrame(animate);
  },

  drawLineCelebration(now = performance.now()) {
    const effect = this.lineCelebration;
    if (!effect || !this.ctx || !this.canvas) return;
    const progress = Math.min(1, Math.max(0, (now - effect.startedAt) / effect.duration));
    const pulse = Math.sin(progress * Math.PI);
    const cellSize = this.canvas.width / this.gridSize;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = '#c9ff43';
    ctx.shadowBlur = 20 + pulse * 26;
    ctx.fillStyle = `rgba(201,255,67,${0.2 + pulse * 0.65})`;

    effect.rows.forEach(row => ctx.fillRect(0, row * cellSize + 2, this.canvas.width, cellSize - 4));
    effect.cols.forEach(col => ctx.fillRect(col * cellSize + 2, 0, cellSize - 4, this.canvas.width));

    const lines = [
      ...effect.rows.map(row => ({ horizontal: true, index: row })),
      ...effect.cols.map(col => ({ horizontal: false, index: col }))
    ];
    lines.forEach((line, lineIndex) => {
      for (let i = 0; i < 12; i++) {
        const travel = (i / 11 + progress * 0.65) % 1;
        const wave = Math.sin((i + lineIndex * 3) * 2.4 + progress * 10) * cellSize * 0.45;
        const x = line.horizontal ? travel * this.canvas.width : line.index * cellSize + cellSize / 2 + wave;
        const y = line.horizontal ? line.index * cellSize + cellSize / 2 + wave : travel * this.canvas.width;
        const radius = 2 + ((i + lineIndex) % 3) * 1.5;
        ctx.beginPath();
        ctx.fillStyle = i % 2 ? `rgba(255,255,255,${pulse})` : `rgba(201,255,67,${pulse})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  },

  updateHud() {
    const multiplier = document.getElementById('hud-multiplier');
    const score = document.getElementById('hud-score');
    const lines = document.getElementById('hud-lines');
    const payoutElement = document.getElementById('hud-payout');
    const cashoutButton = document.getElementById('btn-cashout');
    const comboBar = document.getElementById('hud-combo-bar');
    const comboLabel = document.getElementById('hud-combo-label');

    if (multiplier) multiplier.textContent = `${this.multiplier.toFixed(2)}x`;
    if (score) score.textContent = this.score.toLocaleString('pt-BR');
    if (lines) lines.textContent = this.linesCleared;
    
    const payout = Math.floor(this.betAmount * this.multiplier);
    if (payoutElement) payoutElement.textContent = app.formatBRL(payout);
    if (cashoutButton && this.mode === 'real') {
      const formattedPayout = app.formatBRL(payout);
      cashoutButton.textContent = `Retirar ${formattedPayout}`;
      cashoutButton.setAttribute('aria-label', `Retirar agora o valor disponível de ${formattedPayout}`);
    }
    if (comboBar) comboBar.style.width = `${Math.max(0, 100 - (this.misses / Math.max(1, this.hand.length)) * 100)}%`;
    if (comboLabel) comboLabel.textContent = this.combo > 0 ? `COMBO ${this.combo}x` : 'MONTE SEU COMBO';
  },

  async cashout() {
    if (!this.isPlaying || this.mode !== 'real') return;
    this.unlockAudio();
    this.isPlaying = false;
    const cashoutButton = document.getElementById('btn-cashout');
    if (cashoutButton) cashoutButton.disabled = true;

    try {
      const data = await app.fetchAPI('/api/game/end', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.sessionId,
          floorsReached: this.linesCleared,
          multiplier: this.multiplier,
          blocksPlaced: this.blocksPlaced,
          score: this.score
        })
      });

      app.user.balance = data.balance_after;
      app.updateBalanceDisplays();
      this.playCashoutSound(data.multiplier);

      document.getElementById('win-modal-payout').textContent = app.formatBRL(data.payout);
      document.getElementById('win-modal-mult').textContent = `${data.multiplier.toFixed(2)}x`;
      document.getElementById('win-modal').classList.add('active');
    } catch (err) {
      this.isPlaying = true;
      if (cashoutButton) cashoutButton.disabled = false;
      app.showToast(err.message || 'Erro ao realizar resgate de vitória.');
    }
  },

  async leaveGame() {
    if (!this.isPlaying) {
      app.showScreen('menu-screen');
      return;
    }

    if (this.mode === 'demo') {
      this.isPlaying = false;
      app.showScreen('menu-screen');
      return;
    }

    this.isPlaying = false;
    try {
      const data = await app.fetchAPI('/api/game/end', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.sessionId,
          floorsReached: this.linesCleared,
          multiplier: 0,
          blocksPlaced: this.blocksPlaced,
          score: this.score
        })
      });
      if (app.user && data.balance_after != null) {
        app.user.balance = data.balance_after;
        app.updateBalanceDisplays();
      }
      app.showToast('Partida encerrada. O valor apostado não foi resgatado.');
      app.showScreen('menu-screen');
      app.loadDashboard();
    } catch (err) {
      this.isPlaying = true;
      app.showToast(err.message || 'Não foi possível encerrar a partida.');
    }
  },

  async handleGameOver() {
    this.isPlaying = false;

    if (this.mode === 'real') {
      try {
        const data = await app.fetchAPI('/api/game/end', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: this.sessionId,
            floorsReached: this.linesCleared,
            multiplier: 0,
            blocksPlaced: this.blocksPlaced,
            score: this.score
          })
        });
        if (app.user && data.balance_after != null) {
          app.user.balance = data.balance_after;
          app.updateBalanceDisplays();
        }
      } catch (e) {}
    }

    document.getElementById('gameover-modal').classList.add('active');
  },

  draw(animationTime) {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const gridW = w;
    const cellSize = gridW / this.gridSize;

    this.ctx.clearRect(0, 0, w, this.canvas.height);
    this.ctx.fillStyle = '#070b0b';
    this.ctx.fillRect(0, 0, gridW, gridW);

    this.ctx.strokeStyle = 'rgba(122, 145, 139, 0.22)';
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

    this.drawLineCelebration(animationTime);

    if (this.isDragging && this.draggedPieceIndex !== null) {
      const piece = this.hand[this.draggedPieceIndex];
      if (piece) {
        const col = Math.floor((this.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
        const row = Math.floor((this.dragY - this.dragLift - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

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
    this.ctx.fillStyle = '#0a100f';
    this.ctx.fillRect(0, handAreaY, w, 130);

    this.ctx.strokeStyle = '#21302d';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, handAreaY);
    this.ctx.lineTo(w, handAreaY);
    this.ctx.stroke();

    const slotWidth = w / this.hand.length;
    const widestPiece = Math.max(1, ...this.hand.map(p => p.shape[0].length));
    const tallestPiece = Math.max(1, ...this.hand.map(p => p.shape.length));
    const miniCellSize = Math.min(cellSize * 0.65, 24, (slotWidth - 14) / widestPiece, 92 / tallestPiece);

    this.hand.forEach((p, idx) => {
      if (p.used) return;

      if (this.isDragging && this.draggedPieceIndex === idx) {
        const pW = p.shape[0].length * cellSize;
        const pH = p.shape.length * cellSize;
        const startX = this.dragX - pW / 2;
        const startY = this.dragY - this.dragLift - pH / 2;

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
      this.ctx.fillStyle = 'rgba(201, 255, 67, 0.4)';
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

window.game = game;
