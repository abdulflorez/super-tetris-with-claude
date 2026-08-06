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
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(px, py, s, s);
      context.fillStyle = THEMES[theme].highlight;
      context.fillRect(px, py, s, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00e5ff', '#fff176', '#e040fb', '#69f0ae', '#ff5252', '#448aff', '#ffab40'],
    boardBg: '#000000',
    gridColor: 'rgba(255,255,255,0.07)',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      const color = this.colors[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = 14;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,0.65)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      context.restore();
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8dadc', '#ffe8a3', '#d8bbf3', '#b8e3c2', '#f7b8b8', '#b8d4f7', '#f7d0a8'],
    boardBg: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      const r = Math.min(6, s / 3);
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.beginPath();
      if (context.roundRect) {
        context.roundRect(px, py, s, s, r);
      } else {
        context.moveTo(px + r, py);
        context.arcTo(px + s, py, px + s, py + s, r);
        context.arcTo(px + s, py + s, px, py + s, r);
        context.arcTo(px, py + s, px, py, r);
        context.arcTo(px, py, px + s, py, r);
        context.closePath();
      }
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS,
    boardBg: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(px, py, s, s);
      const cell = Math.max(2, Math.floor(s / 4));
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let ty = 0; ty < s; ty += cell) {
        for (let tx = 0; tx < s; tx += cell) {
          if (((tx / cell + ty / cell) % 2) === 0) {
            context.fillRect(px + tx, py + ty, cell, cell);
          }
        }
      }
      context.strokeStyle = 'rgba(0,0,0,0.45)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      context.globalAlpha = 1;
    },
  },
};

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
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const restartMenuBtn = document.getElementById('restart-menu-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const pauseControlsPanel = document.getElementById('pause-controls-panel');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme, skin, startLevel;

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
    level = startLevel + Math.floor(lines / 10);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  SKINS[skin].drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].gridColor || THEMES[theme].grid;
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

function openPauseMenu() {
  pauseControlsPanel.classList.add('hidden');
  controlsToggleBtn.setAttribute('aria-expanded', 'false');
  startLevelSelect.value = String(startLevel);
  pauseOverlay.classList.remove('hidden');
  pauseOverlay.setAttribute('aria-hidden', 'false');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseOverlay.classList.add('hidden');
  pauseOverlay.setAttribute('aria-hidden', 'true');
}

function togglePauseControlsPanel() {
  const isHidden = pauseControlsPanel.classList.toggle('hidden');
  controlsToggleBtn.setAttribute('aria-expanded', String(!isHidden));
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
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

function applySkin(key) {
  skin = SKINS[key] ? key : 'retro';
  const boardBg = SKINS[skin].boardBg;
  canvas.style.backgroundColor = boardBg || '';
  nextCanvas.style.backgroundColor = boardBg || '';
  if (skinSelect) skinSelect.value = skin;
  localStorage.setItem(SKIN_STORAGE_KEY, skin);
  if (board) {
    draw();
    drawNext();
  }
}

function init() {
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  applySkin(localStorage.getItem(SKIN_STORAGE_KEY) || 'retro');
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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
skinSelect.addEventListener('change', e => applySkin(e.target.value));
resumeBtn.addEventListener('click', togglePause);
restartMenuBtn.addEventListener('click', () => {
  closePauseMenu();
  init();
});
controlsToggleBtn.addEventListener('click', togglePauseControlsPanel);
startLevelSelect.addEventListener('change', e => {
  startLevel = Number(e.target.value) || 1;
});

startLevel = 1;
init();
