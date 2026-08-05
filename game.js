'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const THEME_STORAGE_KEY = 'tetris-theme';
const THEMES = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#dcdce6', highlight: 'rgba(0,0,0,0.10)' },
};

const SKIN_STORAGE_KEY = 'tetris-skin';
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];
const PASTEL_COLORS = [
  null,
  '#b5e8ef', // I - cyan
  '#fff2c2', // O - yellow
  '#e3c4ec', // T - purple
  '#c9e8cb', // S - green
  '#f5c6c6', // Z - red
  '#cde3fb', // J - pale blue
  '#ffe0bd', // L - orange
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');
const themeText = document.getElementById('theme-text');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme, skin;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawRoundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  context.globalAlpha = alpha ?? 1;

  if (skin === 'neon') {
    const color = COLORS[colorIndex];
    context.shadowBlur = 15;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.shadowBlur = 0;
    // highlight
    context.fillStyle = THEMES[theme].highlight;
    context.fillRect(px, py, w, 4);
  } else if (skin === 'pastel') {
    const color = PASTEL_COLORS[colorIndex];
    const radius = Math.min(Math.max(4, size * 0.18), w / 2, h / 2);
    drawRoundedRectPath(context, px, py, w, h, radius);
    context.fillStyle = color;
    context.fill();
    // highlight, clipped to the rounded shape so corners stay clean
    context.save();
    drawRoundedRectPath(context, px, py, w, h, radius);
    context.clip();
    context.fillStyle = THEMES[theme].highlight;
    context.fillRect(px, py, w, 4);
    context.restore();
  } else if (skin === 'pixel') {
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    // pixel-art texture: small checkerboard of darker/lighter squares
    const step = Math.max(4, Math.floor(size / 5));
    context.fillStyle = 'rgba(0,0,0,0.15)';
    for (let ty = 0; ty < h; ty += step) {
      for (let tx = 0; tx < w; tx += step) {
        if (((tx / step) + (ty / step)) % 2 === 0) {
          const tw = Math.min(step, w - tx);
          const th = Math.min(step, h - ty);
          context.fillRect(px + tx, py + ty, tw, th);
        }
      }
    }
    context.fillStyle = 'rgba(255,255,255,0.15)';
    for (let ty = 0; ty < h; ty += step) {
      for (let tx = 0; tx < w; tx += step) {
        if (((tx / step) + (ty / step)) % 2 !== 0) {
          const tw = Math.min(step, w - tx);
          const th = Math.min(step, h - ty);
          context.fillRect(px + tx, py + ty, tw, th);
        }
      }
    }
    // highlight
    context.fillStyle = THEMES[theme].highlight;
    context.fillRect(px, py, w, 4);
  } else {
    // retro (default): unchanged original behavior
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    // highlight
    context.fillStyle = THEMES[theme].highlight;
    context.fillRect(px, py, w, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = THEMES[theme].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  themeIcon.textContent = isLight ? '🌙' : '☀️';
  themeText.textContent = isLight ? 'DARK MODE' : 'LIGHT MODE';
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  themeToggleBtn.setAttribute('aria-label', label);
  themeToggleBtn.setAttribute('title', label);
  themeToggleBtn.setAttribute('aria-pressed', String(isLight));
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  if (board) draw();
}

function toggleTheme() {
  applyTheme(theme === 'light' ? 'dark' : 'light');
}

function applySkin(s) {
  skin = SKINS.includes(s) ? s : 'retro';
  localStorage.setItem(SKIN_STORAGE_KEY, skin);
  if (skinSelect) skinSelect.value = skin;
  if (board) draw();
  if (next) drawNext();
}

function init() {
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  applySkin(localStorage.getItem(SKIN_STORAGE_KEY) || 'retro');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', e => applySkin(e.target.value));

init();
