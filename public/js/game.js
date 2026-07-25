const BLOCK_COLORS = [
  '#E8432F', // Vermelho Bandeirinha
  '#F7B731', // Amarelo Palha
  '#2D8B4E', // Verde Floresta
  '#E87F24', // Laranja Quente
  '#E84393', // Rosa Pink
  '#8B5E3C'  // Marrom Madeira
];

// Formas de Peças (Matrizes 2D)
const ALL_SHAPES = [
  // 1x1
  [[1]],
  // Linhas 2x1 e 1x2
  [[1, 1]],
  [[1], [1]],
  // Linhas 3x1 e 1x3
  [[1, 1, 1]],
  [[1], [1], [1]],
  // Quadrados 2x2
  [[1, 1], [1, 1]],
  // L pequenas
  [[1, 0], [1, 1]],
  [[0, 1], [1, 1]],
  [[1, 1], [1, 0]],
  [[1, 1], [0, 1]],
  // T pequenas
  [[1, 1, 1], [0, 1, 0]],
  [[0, 1], [1, 1], [0, 1]],
  // Linhas 4x1 e 1x4
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  // Quadrados 3x3
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
  isPlaying: false,
  mode: 'demo', // 'real' ou 'demo'
  gameMode: 'classic', // 'classic' (8x8) ou 'chaos' (10x10)
  gridSize: 8,
  board: [],
  hand: [],
  sessionId: null,
  difficulty: 'balanced',
  betAmount: 200, // Centavos (R$ 2,00)
  multiplier: 1.0,
  linesCleared: 0,
  score: 0,

  // Estado de Arraste (Drag & Drop)
  draggedPieceIndex: null,
  dragX: 0,
  dragY: 0,
  isDragging: false,

  init() {
    this.canvas = document.getElementById('blockerino-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.setupEvents();
    this.resizeCanvas();
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
      const handAreaY = this.canvas.height - 130;
      
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

    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', handleStart);
    this.canvas.addEventListener('touchmove', handleMove);
    this.canvas.addEventListener('touchend', handleEnd);
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    const width = Math.min(container.clientWidth - 16, 420);
    this.canvas.width = width;
    this.canvas.height = width + 130; // Grid quadrado + Área da mão de peças
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
      app.showToast('Valor de aposta inválido! Min R$ 1,00 - Max R$ 100,00.');
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
    try {
      const data = await app.fetchAPI('/api/game/demo/start', { method: 'POST' });
      this.sessionId = data.sessionId;
      this.difficulty = 'easy';
      this.multiplier = 1.0;
      this.linesCleared = 0;
      this.score = 0;

      app.showScreen('game-screen');
      this.initBoard();
      this.isPlaying = true;
      
      document.getElementById('btn-cashout').style.display = 'none';
      this.updateHud();
      this.draw();
      app.showToast('🌽 Modo Treino Demo Iniciado!');
    } catch (err) {
      app.showToast('Erro ao iniciar treino demo.');
    }
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

    // Calcular célula correspondente no grid baseada no centro da peça
    const col = Math.floor((this.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
    const row = Math.floor((this.dragY - 30 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

    if (this.canPlace(piece.shape, row, col)) {
      // Colocar a peça no tabuleiro
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) {
            this.board[row + r][col + c] = piece.color;
          }
        }
      }

      piece.used = true;
      this.checkLines();

      // Se todas as peças da mão foram usadas, gera nova mão
      if (this.hand.every(p => p.used)) {
        this.generateHand();
      }

      // Checar se o jogo acabou
      if (!this.canAnyPieceBePlaced()) {
        this.handleGameOver();
      }
    }
  },

  canPlace(shape, startRow, startCol) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const targetRow = startRow + r;
          const targetCol = startCol + c;
          if (
            targetRow < 0 ||
            targetRow >= this.gridSize ||
            targetCol < 0 ||
            targetCol >= this.gridSize ||
            this.board[targetRow][targetCol] !== null
          ) {
            return false;
          }
        }
      }
    }
    return true;
  },

  canAnyPieceBePlaced() {
    for (const piece of this.hand) {
      if (piece.used) continue;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (this.canPlace(piece.shape, r, c)) {
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

    // Checar Linhas
    for (let r = 0; r < this.gridSize; r++) {
      if (this.board[r].every(cell => cell !== null)) {
        rowsToClear.push(r);
      }
    }

    // Checar Colunas
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
      // Limpar Linhas
      rowsToClear.forEach(r => {
        for (let c = 0; c < this.gridSize; c++) this.board[r][c] = null;
      });

      // Limpar Colunas
      colsToClear.forEach(c => {
        for (let r = 0; r < this.gridSize; r++) this.board[r][c] = null;
      });

      // Atualizar Multiplicador
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
      app.showToast(err.message || 'Erro ao realizar saque de vitória.');
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
    if (!this.ctx) return;
    const w = this.canvas.width;
    const gridW = w;
    const cellSize = gridW / this.gridSize;

    // Limpar Canvas
    this.ctx.clearRect(0, 0, w, this.canvas.height);

    // Fundo do Grid
    this.ctx.fillStyle = '#1a0a2e';
    this.ctx.fillRect(0, 0, gridW, gridW);

    // Linhas do Grid
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

    // Desenhar Bloco Colocados no Tabuleiro
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.board[r][c]) {
          this.drawBlock(c * cellSize, r * cellSize, cellSize, this.board[r][c]);
        }
      }
    }

    // Desenhar Preview do Arraste
    if (this.isDragging && this.draggedPieceIndex !== null) {
      const piece = this.hand[this.draggedPieceIndex];
      if (piece) {
        const col = Math.floor((this.dragX - (piece.shape[0].length * cellSize) / 2) / cellSize + 0.5);
        const row = Math.floor((this.dragY - 30 - (piece.shape.length * cellSize) / 2) / cellSize + 0.5);

        if (this.canPlace(piece.shape, row, col)) {
          this.ctx.globalAlpha = 0.45;
          for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
              if (piece.shape[r][c]) {
                this.drawBlock((col + c) * cellSize, (row + r) * cellSize, cellSize, piece.color);
              }
            }
          }
          this.ctx.globalAlpha = 1.0;
        }
      }
    }

    // Desenhar Área da Mão de Peças (Rodapé do Canvas)
    const handAreaY = gridW;
    this.ctx.fillStyle = '#0d0618';
    this.ctx.fillRect(0, handAreaY, w, 130);

    this.ctx.strokeStyle = '#8B5E3C';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, handAreaY);
    this.ctx.lineTo(w, handAreaY);
    this.ctx.stroke();

    // Desenhar Peças da Mão
    const slotWidth = w / this.hand.length;
    const miniCellSize = Math.min(cellSize * 0.65, 24);

    this.hand.forEach((p, idx) => {
      if (p.used) return;

      // Se a peça está sendo arrastada, desenha na posição do cursor
      if (this.isDragging && this.draggedPieceIndex === idx) {
        const pW = p.shape[0].length * cellSize;
        const pH = p.shape.length * cellSize;
        const startX = this.dragX - pW / 2;
        const startY = this.dragY - 30 - pH / 2;

        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) {
              this.drawBlock(startX + c * cellSize, startY + r * cellSize, cellSize, p.color);
            }
          }
        }
      } else {
        // Desenha no slot da mão
        const slotCenterX = idx * slotWidth + slotWidth / 2;
        const slotCenterY = handAreaY + 65;
        const pW = p.shape[0].length * miniCellSize;
        const pH = p.shape.length * miniCellSize;
        const startX = slotCenterX - pW / 2;
        const startY = slotCenterY - pH / 2;

        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (p.shape[r][c]) {
              this.drawBlock(startX + c * miniCellSize, startY + r * miniCellSize, miniCellSize, p.color);
            }
          }
        }
      }
    });

    // Marca d'água Modo Treino Demo
    if (this.mode === 'demo') {
      this.ctx.font = 'bold 12px Silkscreen';
      this.ctx.fillStyle = 'rgba(247, 183, 49, 0.4)';
      this.ctx.fillText('MODO TREINO DEMO', 10, gridW - 10);
    }
  },

  drawBlock(x, y, size, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    // Bordas estilo madeira / 3D
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.fillRect(x + 1, y + 1, size - 2, 3);
    this.ctx.fillRect(x + 1, y + 1, 3, size - 2);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(x + 1, y + size - 4, size - 2, 3);
    this.ctx.fillRect(x + size - 4, y + 1, 3, size - 2);
  }
};
