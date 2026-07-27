// Engine Completa do Jogo Blockerino HTML5 Canvas
// 100% Responsivo, sem travamentos, com Efeitos Sonoros Web Audio e Lucro Flutuante

class BlockerinoEngine {
  constructor(canvasId, isLanding = false) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.isLanding = isLanding;
    this.gridSize = 8; // Tabuleiro 8x8 Clássico
    this.cellSize = 36;
    this.padding = 10;
    
    // ESTADO DO JOGO: TABULEIRO 8x8 TOTALMENTE VAZIO NO INÍCIO
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    
    this.hand = [];
    this.draggedPiece = null;
    this.dragOffset = { x: 0, y: 0 };
    this.hoverPos = null;
    
    this.multiplier = 1.0;
    this.linesCleared = 0;
    this.betAmount = 2.00;
    this.gameMode = 'classic';
    this.isDemo = isLanding;
    this.isActive = false;

    // Cores caipiras das peças
    this.pieceColors = [
      '#E8432F', // Vermelho Bandeirinha
      '#F7B731', // Amarelo Palha
      '#2D8B4E', // Verde Floresta
      '#E87F24', // Laranja Quente
      '#E84393', // Rosa Pink
      '#8B5E3C'  // Marrom Madeira
    ];

    // Formatos de Peças Clássicas Blockerino
    this.pieceShapes = [
      [[1]], // 1x1
      [[1, 1]], // 2x1 H
      [[1], [1]], // 1x2 V
      [[1, 1, 1]], // 3x1 H
      [[1], [1], [1]], // 1x3 V
      [[1, 1], [1, 1]], // 2x2
      [[1, 1, 1], [0, 1, 0]], // T-Shape
      [[1, 0], [1, 1]], // L-Shape
      [[1, 1, 1], [1, 1, 1], [1, 1, 1]] // 3x3
    ];

    this.initEvents();
  }

  // Sintetizador de Áudio Nativo (Web Audio API)
  playSound(type, lines = 1) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      
      const now = this.audioCtx.currentTime;

      if (type === 'place') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(now + 0.08);
      } else if (type === 'clear') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.slice(0, Math.min(lines + 2, 4)).forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.06);
          gain.gain.setValueAtTime(0.4, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.06 + 0.15);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.15);
        });
      } else if (type === 'win') {
        const arpeggio = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
        arpeggio.forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.05);
          gain.gain.setValueAtTime(0.35, now + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.2);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.05);
          osc.stop(now + i * 0.05 + 0.2);
        });
      }
    } catch (e) {}
  }

  // Efeito Visual Flutuante de Ganho (+R$ XX,XX!)
  triggerProfitEffect(amountBRL, clientX, clientY) {
    const el = document.createElement('div');
    el.className = 'floating-profit';
    el.innerText = `+R$ ${amountBRL.toFixed(2).replace('.', ',')}`;
    
    // Posiciona próximo ao cursor ou no centro do jogo
    if (clientX && clientY) {
      el.style.left = `${clientX - 40}px`;
      el.style.top = `${clientY - 40}px`;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      el.style.left = `${rect.left + rect.width / 2 - 40}px`;
      el.style.top = `${rect.top + rect.height / 3}px`;
    }

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  // Inicializar Nova Partida (LIMPEZA TOTAL DO TABULEIRO)
  start(mode = 'classic', bet = 2.00, isDemo = false) {
    this.gameMode = mode;
    this.gridSize = mode === 'chaos' ? 10 : 8;
    this.betAmount = bet;
    this.isDemo = isDemo;
    this.multiplier = 1.0;
    this.linesCleared = 0;
    this.isActive = true;

    // TABULEIRO 100% VAZIO NO INÍCIO DAS PARTIDAS
    this.board = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));

    // Ajusta dimensões do canvas conforme o tamanho do grid
    const targetCell = this.gridSize === 10 ? 30 : 36;
    this.cellSize = targetCell;
    const boardDim = this.gridSize * this.cellSize + this.padding * 2;
    this.canvas.width = boardDim;
    this.canvas.height = boardDim + 130; // Espaço para a mão de peças

    this.spawnHand();
    this.updateHUD();
    this.render();
  }

  // Gerar Nova Mão de Peças
  spawnHand() {
    const count = this.gameMode === 'chaos' ? 5 : 3;
    this.hand = [];
    for (let i = 0; i < count; i++) {
      const shape = this.pieceShapes[Math.floor(Math.random() * this.pieceShapes.length)];
      const color = this.pieceColors[Math.floor(Math.random() * this.pieceColors.length)];
      this.hand.push({ id: i, shape, color, placed: false });
    }
  }

  // Renderização do Loop Canvas
  render() {
    if (!this.ctx) return;
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // 1. Fundo do Tabuleiro
    this.ctx.fillStyle = '#1a0a2e';
    this.ctx.fillRect(0, 0, width, height);

    const boardWidth = this.gridSize * this.cellSize;
    const startX = this.padding;
    const startY = this.padding;

    // 2. Desenhar Grid 8x8 / 10x10 com Bordas de Madeira
    this.ctx.strokeStyle = '#8B5E3C';
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeRect(startX - 2, startY - 2, boardWidth + 4, boardWidth + 4);

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const x = startX + c * this.cellSize;
        const y = startY + r * this.cellSize;

        // Célula Vazia
        this.ctx.fillStyle = 'rgba(26, 10, 46, 0.9)';
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
        this.ctx.strokeStyle = 'rgba(139, 94, 60, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);

        // Bloco Preenchido
        if (this.board[r][c]) {
          this.drawBlock(x, y, this.board[r][c]);
        }
      }
    }

    // 3. Desenhar Hover da Peça Sendo Arrastada
    if (this.draggedPiece && this.hoverPos && this.canPlace(this.draggedPiece.shape, this.hoverPos.r, this.hoverPos.c)) {
      const { shape, color } = this.draggedPiece;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const hX = startX + (this.hoverPos.c + c) * this.cellSize;
            const hY = startY + (this.hoverPos.r + r) * this.cellSize;
            this.ctx.globalAlpha = 0.45;
            this.drawBlock(hX, hY, color);
            this.ctx.globalAlpha = 1.0;
          }
        }
      }
    }

    // 4. Desenhar Peças na Mão (Abaixo do Tabuleiro)
    const handY = startY + boardWidth + 20;
    const slotWidth = width / this.hand.length;

    this.hand.forEach((p, idx) => {
      if (p.placed || p === this.draggedPiece) return;

      const pWidth = p.shape[0].length * (this.cellSize * 0.65);
      const pHeight = p.shape.length * (this.cellSize * 0.65);
      const slotX = idx * slotWidth + (slotWidth - pWidth) / 2;
      const slotY = handY + (90 - pHeight) / 2;

      p.bounds = { x: slotX - 10, y: slotY - 10, width: pWidth + 20, height: pHeight + 20 };

      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (p.shape[r][c]) {
            const bx = slotX + c * (this.cellSize * 0.65);
            const by = slotY + r * (this.cellSize * 0.65);
            this.drawMiniBlock(bx, by, p.color, this.cellSize * 0.65);
          }
        }
      }
    });

    // 5. Desenhar Peça em Arraste Segurada pelo Cursor
    if (this.draggedPiece && this.dragPos) {
      const { shape, color } = this.draggedPiece;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const dx = this.dragPos.x + c * (this.cellSize * 0.8) - this.dragOffset.x;
            const dy = this.dragPos.y + r * (this.cellSize * 0.8) - this.dragOffset.y;
            this.drawMiniBlock(dx, dy, color, this.cellSize * 0.8);
          }
        }
      }
    }
  }

  // Desenhar Bloco com Estilo Festa Junina
  drawBlock(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4);
  }

  drawMiniBlock(x, y, color, size) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  }

  // Verificar se a Peça Pode ser Colocada
  canPlace(shape, startRow, startCol) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const br = startRow + r;
          const bc = startCol + c;
          if (br < 0 || br >= this.gridSize || bc < 0 || bc >= this.gridSize) return false;
          if (this.board[br][bc] !== null) return false;
        }
      }
    }
    return true;
  }

  // Lógica dos Eventos de Arraste e Toque
  initEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.canvas.width / rect.width),
        y: (clientY - rect.top) * (this.canvas.height / rect.height),
        rawX: clientX,
        rawY: clientY
      };
    };

    const handleStart = (e) => {
      if (!this.isActive) return;
      const pos = getPos(e);
      this.hand.forEach((p) => {
        if (!p.placed && p.bounds && pos.x >= p.bounds.x && pos.x <= p.bounds.x + p.bounds.width && pos.y >= p.bounds.y && pos.y <= p.bounds.y + p.bounds.height) {
          this.draggedPiece = p;
          this.dragPos = pos;
          this.dragOffset = { x: (p.shape[0].length * (this.cellSize * 0.8)) / 2, y: (p.shape.length * (this.cellSize * 0.8)) / 2 };
        }
      });
    };

    const handleMove = (e) => {
      if (!this.draggedPiece) return;
      e.preventDefault();
      const pos = getPos(e);
      this.dragPos = pos;

      // Calcular posição no tabuleiro
      const startX = this.padding;
      const startY = this.padding;
      const col = Math.floor((pos.x - startX) / this.cellSize);
      const row = Math.floor((pos.y - startY) / this.cellSize);

      if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
        this.hoverPos = { r: row, c: col };
      } else {
        this.hoverPos = null;
      }
      this.render();
    };

    const handleEnd = (e) => {
      if (!this.draggedPiece) return;
      if (this.hoverPos && this.canPlace(this.draggedPiece.shape, this.hoverPos.r, this.hoverPos.c)) {
        // Encaixar peça no tabuleiro
        const { shape, color } = this.draggedPiece;
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
              this.board[this.hoverPos.r + r][this.hoverPos.c + c] = color;
            }
          }
        }
        this.draggedPiece.placed = true;
        this.playSound('place');

        // Verificar quebra de linhas
        this.checkLines(e ? (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) : null, e ? (e.changedTouches ? e.changedTouches[0].clientY : e.clientY) : null);

        // Se colocou todas as peças da mão, gera nova mão
        if (this.hand.every((p) => p.placed)) {
          this.spawnHand();
        }

        // Verificar se há jogadas possíveis para a mão atual
        this.checkGameOver();
      }

      this.draggedPiece = null;
      this.hoverPos = null;
      this.render();
    };

    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', handleStart, { passive: false });
    this.canvas.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  }

  // Quebra de Linhas Verticais e Horizontais
  checkLines(clientX, clientY) {
    let rowsToClear = [];
    let colsToClear = [];

    // Checar linhas horizontais
    for (let r = 0; r < this.gridSize; r++) {
      if (this.board[r].every((cell) => cell !== null)) {
        rowsToClear.push(r);
      }
    }

    // Checar colunas verticais
    for (let c = 0; c < this.gridSize; c++) {
      let fullCol = true;
      for (let r = 0; r < this.gridSize; r++) {
        if (this.board[r][c] === null) {
          fullCol = false;
          break;
        }
      }
      if (fullCol) colsToClear.push(c);
    }

    const totalCleared = rowsToClear.length + colsToClear.length;
    if (totalCleared > 0) {
      rowsToClear.forEach((r) => this.board[r].fill(null));
      colsToClear.forEach((c) => {
        for (let r = 0; r < this.gridSize; r++) this.board[r][c] = null;
      });

      this.linesCleared += totalCleared;
      const multInc = totalCleared * 0.15 + (totalCleared > 1 ? 0.20 : 0);
      this.multiplier = parseFloat((this.multiplier + multInc).toFixed(2));

      // Toca Som de Vitória/Quebra
      this.playSound('clear', totalCleared);

      // Dispara Efeito de Lucro Flutuante
      const currentProfit = this.betAmount * this.multiplier;
      this.triggerProfitEffect(currentProfit, clientX, clientY);

      this.updateHUD();
    }
  }

  // Atualizar Indicadores Superior na Tela
  updateHUD() {
    const currentPayout = (this.betAmount * this.multiplier).toFixed(2).replace('.', ',');
    if (this.isLanding) {
      const multEl = document.getElementById('mini-demo-mult');
      const linesEl = document.getElementById('mini-demo-lines');
      const valEl = document.getElementById('mini-demo-value');
      const ctaBtn = document.getElementById('landing-cta-btn');

      if (multEl) multEl.innerText = `${this.multiplier.toFixed(2)}x`;
      if (linesEl) linesEl.innerText = this.linesCleared;
      if (valEl) valEl.innerText = `R$ ${currentPayout}`;
      if (ctaBtn) ctaBtn.innerText = `🔥 GANHAR R$ ${currentPayout} DE VERDADE (RESGATAR BÔNUS 300%) 🚀`;
    } else {
      const multEl = document.getElementById('hud-multiplier');
      const linesEl = document.getElementById('hud-lines');
      const payoutEl = document.getElementById('hud-payout');

      if (multEl) multEl.innerText = `${this.multiplier.toFixed(2)}x`;
      if (linesEl) linesEl.innerText = this.linesCleared;
      if (payoutEl) payoutEl.innerText = `R$ ${currentPayout}`;
    }
  }

  // Verificar se Faltou Espaço no Tabuleiro
  checkGameOver() {
    let hasMove = false;
    for (let p of this.hand) {
      if (p.placed) continue;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (this.canPlace(p.shape, r, c)) {
            hasMove = true;
            break;
          }
        }
        if (hasMove) break;
      }
      if (hasMove) break;
    }

    if (!hasMove && this.hand.some((p) => !p.placed)) {
      this.isActive = false;
      if (this.isLanding) {
        setTimeout(() => this.start('classic', 2.00, true), 1500);
      } else {
        setTimeout(() => {
          document.getElementById('gameover-modal').classList.add('active');
        }, 600);
      }
    }
  }

  // Efetuar Cashout / Resgatar Prêmio
  cashout() {
    this.playSound('win');
    const winPayout = (this.betAmount * this.multiplier).toFixed(2).replace('.', ',');
    
    if (!this.isDemo && window.app) {
      fetchAPI('/api/game/end', 'POST', {
        sessionId: this.sessionId || 'SESSION_' + Date.now(),
        multiplier: this.multiplier
      }).then(() => app.loadUserData());
    }

    const winModalPayout = document.getElementById('win-modal-payout');
    const winModalMult = document.getElementById('win-modal-mult');
    if (winModalPayout) winModalPayout.innerText = `R$ ${winPayout}`;
    if (winModalMult) winModalMult.innerText = `${this.multiplier.toFixed(2)}x`;

    document.getElementById('win-modal').classList.add('active');
  }
}

// Controller do Jogo
const game = {
  activeEngine: null,
  landingEngine: null,
  gameMode: 'classic',
  isDemo: false,

  initLandingDemo() {
    this.landingEngine = new BlockerinoEngine('mini-demo-canvas', true);
    this.landingEngine.start('classic', 2.00, true);
  },

  showPrep(isDemoOrReal, mode = 'classic') {
    this.isDemo = isDemoOrReal === 'demo';
    this.gameMode = mode;

    if (this.isDemo) {
      app.showScreen('game-screen');
      this.startRealGame();
    } else {
      document.getElementById('prep-modal').classList.add('active');
    }
  },

  startRealGame() {
    document.getElementById('prep-modal').classList.remove('active');
    const betInput = document.getElementById('bet-input-val');
    const betVal = parseFloat(betInput ? betInput.value : 2.00) || 2.00;

    app.showScreen('game-screen');
    this.activeEngine = new BlockerinoEngine('blockerino-canvas', false);
    this.activeEngine.start(this.gameMode, betVal, this.isDemo);
  },

  cashout() {
    if (this.activeEngine) {
      this.activeEngine.cashout();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  game.initLandingDemo();
});
