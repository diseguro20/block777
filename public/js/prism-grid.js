(() => {
  const root = document.getElementById('prism-grid');
  const canvas = document.getElementById('prism-grid-canvas');
  const landing = document.getElementById('landing-screen');
  if (!root || !canvas || !landing) return;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const palette = ['#c9ff43', '#9dd51b', '#60e49c', '#2d8b4e', '#f7b731', '#e87f24'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  let width = 0;
  let height = 0;
  let cellSize = 46;
  let columns = 0;
  let rows = 0;
  let frame = 0;
  let lastFrame = 0;
  let lastAmbient = 0;
  let lastFormationStep = 0;
  let formation = null;
  let lineFlash = null;
  let active = true;
  const litCells = new Map();

  const cellKey = (column, row) => `${column}:${row}`;
  const lightCell = (column, row, strength = 1, color, life) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return;
    litCells.set(cellKey(column, row), {
      column,
      row,
      color: color || palette[Math.floor(Math.random() * palette.length)],
      strength,
      born: performance.now(),
      life: life || (coarsePointer ? 1500 : 1050)
    });
  };

  const beginFormation = now => {
    const widthInCells = Math.min(8, Math.max(4, columns - 2));
    const startColumn = Math.max(1, Math.floor(Math.random() * Math.max(1, columns - widthInCells - 1)));
    const targetRow = Math.max(3, Math.min(rows - 2, 4 + Math.floor(Math.random() * Math.max(1, rows - 7))));
    const pieceLayouts = widthInCells >= 8 ? [
      [[0, 0], [-1, 0], [0, 1]],
      [[0, 2], [0, 3], [-1, 2], [-1, 3]],
      [[0, 4], [0, 5], [0, 6], [-1, 5]],
      [[0, 7], [-1, 7], [-2, 7]]
    ] : Array.from({ length: widthInCells }, (_, index) => [[0, index], [-1, index]]);
    formation = { startColumn, targetRow, widthInCells, pieces: pieceLayouts, index: 0, completedAt: 0 };
    lastFormationStep = now - 700;
  };

  const advanceFormation = now => {
    if (!formation) beginFormation(now);
    if (formation.index < formation.pieces.length && now - lastFormationStep > (coarsePointer ? 760 : 620)) {
      lastFormationStep = now;
      const color = palette[(formation.index + Math.floor(now / 1000)) % palette.length];
      formation.pieces[formation.index].forEach(([rowOffset, columnOffset]) => {
        lightCell(formation.startColumn + columnOffset, formation.targetRow + rowOffset, .62, color, 5200);
      });
      formation.index += 1;
      return;
    }
    if (formation.index >= formation.pieces.length && !formation.completedAt) {
      formation.completedAt = now;
      lineFlash = { row: formation.targetRow, start: formation.startColumn, width: formation.widthInCells, born: now };
      for (let column = 0; column < formation.widthInCells; column++) {
        lightCell(formation.startColumn + column, formation.targetRow, .95, '#c9ff43', 720);
      }
    } else if (formation.completedAt && now - formation.completedAt > 1150) {
      formation = null;
    }
  };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1 : 1.5);
    width = Math.max(1, Math.ceil(rect.width));
    height = Math.max(1, Math.ceil(rect.height));
    cellSize = coarsePointer ? 34 : width > 1100 ? 48 : 40;
    columns = Math.ceil(width / cellSize) + 1;
    rows = Math.ceil(height / cellSize) + 1;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    litCells.clear();
    draw(performance.now());
  };

  const draw = now => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(7,11,11,.28)';
    context.fillRect(0, 0, width, height);
    context.beginPath();
    for (let column = 0; column <= columns; column++) {
      const x = column * cellSize + .5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let row = 0; row <= rows; row++) {
      const y = row * cellSize + .5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.strokeStyle = coarsePointer ? 'rgba(201,255,67,.095)' : 'rgba(201,255,67,.13)';
    context.lineWidth = 1;
    context.stroke();

    if (lineFlash) {
      const flashProgress = (now - lineFlash.born) / 700;
      if (flashProgress >= 1) lineFlash = null;
      else {
        context.save();
        context.globalAlpha = (1 - flashProgress) * .42;
        context.shadowColor = '#c9ff43';
        context.shadowBlur = 26;
        context.fillStyle = '#c9ff43';
        context.fillRect(lineFlash.start * cellSize + 1, lineFlash.row * cellSize + 1, lineFlash.width * cellSize - 1, cellSize - 1);
        context.restore();
      }
    }

    for (const [key, cell] of litCells) {
      const progress = Math.min(1, (now - cell.born) / cell.life);
      if (progress >= 1) {
        litCells.delete(key);
        continue;
      }
      const alpha = Math.pow(1 - progress, 1.75) * cell.strength;
      const x = cell.column * cellSize + 1;
      const y = cell.row * cellSize + 1;
      const size = cellSize - 1;
      context.save();
      context.globalAlpha = alpha * .58;
      context.shadowColor = cell.color;
      context.shadowBlur = coarsePointer ? 10 : 18;
      context.fillStyle = cell.color;
      context.fillRect(x, y, size, size);
      context.globalAlpha = alpha;
      context.strokeStyle = cell.color;
      context.lineWidth = 1;
      context.strokeRect(x + .5, y + .5, size - 1, size - 1);
      context.restore();
    }
  };

  const animate = now => {
    if (!active) return;
    advanceFormation(now);
    if (now - lastAmbient > (coarsePointer ? 420 : 700)) {
      lastAmbient = now;
      const column = Math.floor(Math.random() * columns);
      const row = Math.floor(Math.random() * rows);
      lightCell(column, row, coarsePointer ? .5 : .34);
      if (Math.random() > .64) lightCell(column + 1, row, .18);
    }
    if (now - lastFrame > 28) {
      lastFrame = now;
      draw(now);
    }
    frame = requestAnimationFrame(animate);
  };

  const handlePointer = event => {
    if (coarsePointer || reduceMotion || !landing.classList.contains('active')) return;
    const rect = root.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / cellSize);
    const row = Math.floor((event.clientY - rect.top) / cellSize);
    lightCell(column, row, 1);
    if (Math.random() > .72) lightCell(column + (Math.random() > .5 ? 1 : -1), row, .35);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(landing);
  window.addEventListener('pointermove', handlePointer, { passive: true });
  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (active && !reduceMotion) frame = requestAnimationFrame(animate);
    else cancelAnimationFrame(frame);
  });

  resize();
  if (reduceMotion) {
    for (let index = 0; index < 10; index++) lightCell(Math.floor(Math.random() * columns), Math.floor(Math.random() * rows), .28);
    draw(performance.now());
  } else {
    frame = requestAnimationFrame(animate);
  }
})();
