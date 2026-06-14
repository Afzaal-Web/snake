const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const COLS = 20;
const ROWS = 20;
let CELL;

const elScore = document.getElementById('score');
const elHighScore = document.getElementById('highScore');
const elSpeedFill = document.getElementById('speedFill');
const elSpeedLevel = document.getElementById('speedLevel');
const elFinalScore = document.getElementById('finalScore');
const elFinalBest = document.getElementById('finalBest');
const elFinalLength = document.getElementById('finalLength');
const elFinalLevel = document.getElementById('finalLevel');
const elDifficulty = document.getElementById('difficultySelect');
const elWallMode = document.getElementById('wallMode');
const elSoundToggle = document.getElementById('soundToggle');
const elGridToggle = document.getElementById('gridToggle');

const overlayStart = document.getElementById('overlayStart');
const overlayDead = document.getElementById('overlayDead');
const overlayPause = document.getElementById('overlayPause');

document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnRestart').addEventListener('click', startGame);
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnPause').addEventListener('click', togglePause);
elDifficulty.addEventListener('change', updateSettings);
elWallMode.addEventListener('change', updateSettings);
elSoundToggle.addEventListener('change', updateSettings);
elGridToggle.addEventListener('change', updateSettings);

let snake;
let dir;
let nextDir;
let food;
let score;
let highScore;
let gameLoop;
let speed;
let level;
let alive;
let paused;
let started;
let difficulty;
let wallMode;
let soundEnabled;
let showGrid;
let foodColor;
let foodPulse = 0;
let audioCtx = null;

const DIFFICULTIES = {
  chill: { base: 190, min: 80 },
  normal: { base: 160, min: 55 },
  fast: { base: 125, min: 45 },
};
const SPEED_STEP = 15;

const FOOD_COLORS = [
  { fill: '#ff4d6d', glow: '#ff004466' },
  { fill: '#ffe066', glow: '#ffcc0066' },
  { fill: '#00e5ff', glow: '#00e5ff66' },
  { fill: '#b44dff', glow: '#b44dff66' },
  { fill: '#ff9c33', glow: '#ff9c3366' },
  { fill: '#ff4db8', glow: '#ff4db866' },
  { fill: '#39ff85', glow: '#39ff8566' },
];

function loadSettings() {
  difficulty = localStorage.getItem('snekDifficulty') || 'normal';
  if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
  wallMode = localStorage.getItem('snekWallMode') === 'true';
  soundEnabled = localStorage.getItem('snekSoundEnabled') !== 'false';
  showGrid = localStorage.getItem('snekShowGrid') !== 'false';

  elDifficulty.value = difficulty;
  elWallMode.checked = wallMode;
  elSoundToggle.checked = soundEnabled;
  elGridToggle.checked = showGrid;
}

function updateSettings() {
  difficulty = elDifficulty.value;
  wallMode = elWallMode.checked;
  soundEnabled = elSoundToggle.checked;
  showGrid = elGridToggle.checked;

  localStorage.setItem('snekDifficulty', difficulty);
  localStorage.setItem('snekWallMode', wallMode);
  localStorage.setItem('snekSoundEnabled', soundEnabled);
  localStorage.setItem('snekShowGrid', showGrid);

  if (!alive) drawFrame();
}

function getSpeedConfig() {
  return DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
}

function getAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

function playTone(freq, type = 'square', dur = 0.08, vol = 0.18) {
  if (!soundEnabled) return;
  const ac = getAudio();
  if (!ac) return;

  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  } catch {
    // Sound is optional.
  }
}

function sfxEat() {
  playTone(660, 'sine', 0.12, 0.22);
}

function sfxDie() {
  playTone(220, 'sawtooth', 0.18, 0.3);
  setTimeout(() => playTone(140, 'sawtooth', 0.25, 0.25), 160);
}

function sfxLevel() {
  playTone(523, 'sine', 0.08, 0.2);
  setTimeout(() => playTone(659, 'sine', 0.08, 0.2), 90);
  setTimeout(() => playTone(784, 'sine', 0.12, 0.25), 180);
}

function resizeCanvas() {
  const arena = document.getElementById('arena');
  const size = arena.clientWidth;
  canvas.width = size;
  canvas.height = size;
  CELL = size / COLS;
}

function startGame() {
  updateSettings();
  showOverlay(null);
  const speedConfig = getSpeedConfig();

  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  level = 1;
  speed = speedConfig.base;
  alive = true;
  paused = false;
  started = true;

  foodColor = randomFoodColor();
  placeFood();
  updateScore(0);
  updateSpeedUI();
  drawFrame();

  clearTimeout(gameLoop);
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(gameLoop);
  gameLoop = setTimeout(() => {
    if (!paused && alive) {
      tick();
      drawFrame();
    }
    if (alive) scheduleNext();
  }, speed);
}

function tick() {
  dir = { ...nextDir };

  const rawHead = {
    x: snake[0].x + dir.x,
    y: snake[0].y + dir.y,
  };

  if (wallMode && (rawHead.x < 0 || rawHead.x >= COLS || rawHead.y < 0 || rawHead.y >= ROWS)) {
    return endGame();
  }

  const head = {
    x: (rawHead.x + COLS) % COLS,
    y: (rawHead.y + ROWS) % ROWS,
  };

  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    return endGame();
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    sfxEat();
    updateScore(score + 10);
    foodColor = randomFoodColor();
    placeFood();
    checkLevel();
  } else {
    snake.pop();
  }
}

function updateScore(val) {
  score = val;
  elScore.textContent = score;
  elScore.classList.remove('score-pop');
  void elScore.offsetWidth;
  elScore.classList.add('score-pop');

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('snekBest', highScore);
    elHighScore.textContent = highScore;
  }
}

function checkLevel() {
  const newLevel = Math.floor(score / (SPEED_STEP * 10)) + 1;
  if (newLevel > level) {
    const speedConfig = getSpeedConfig();
    level = newLevel;
    speed = Math.max(speedConfig.min, speedConfig.base - (level - 1) * 12);
    sfxLevel();
    updateSpeedUI();
  }
}

function updateSpeedUI() {
  const speedConfig = getSpeedConfig();
  const maxLevel = Math.floor((speedConfig.base - speedConfig.min) / 12) + 1;
  const pct = Math.min(100, ((level - 1) / (maxLevel - 1)) * 100) || 5;
  elSpeedFill.style.width = pct + '%';

  if (pct < 40) {
    elSpeedFill.style.background = 'linear-gradient(90deg, #39ff85, #00e5ff)';
  } else if (pct < 70) {
    elSpeedFill.style.background = 'linear-gradient(90deg, #ffe066, #ff9c33)';
  } else {
    elSpeedFill.style.background = 'linear-gradient(90deg, #ff9c33, #ff4d6d)';
  }

  elSpeedLevel.textContent = level;
}

function placeFood() {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  food = pos;
  foodPulse = 0;
}

function randomFoodColor() {
  return FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];
}

function endGame() {
  alive = false;
  clearTimeout(gameLoop);
  sfxDie();

  elFinalScore.textContent = score;
  elFinalBest.textContent = highScore;
  elFinalLength.textContent = snake.length;
  elFinalLevel.textContent = level;

  drawFrame();
  setTimeout(() => showOverlay('dead'), 400);
}

function togglePause() {
  if (!started || !alive) return;
  paused = !paused;
  if (paused) {
    clearTimeout(gameLoop);
    showOverlay('pause');
  } else {
    showOverlay(null);
    scheduleNext();
  }
}

function showOverlay(which) {
  [overlayStart, overlayDead, overlayPause].forEach(el => el.classList.add('overlay--hidden'));
  if (which === 'start') overlayStart.classList.remove('overlay--hidden');
  if (which === 'dead') overlayDead.classList.remove('overlay--hidden');
  if (which === 'pause') overlayPause.classList.remove('overlay--hidden');
}

function drawFrame() {
  if (!CELL) resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  drawSnake();
}

function drawGrid() {
  if (!showGrid) return;
  ctx.strokeStyle = 'rgba(42, 42, 64, 0.5)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }
}

function drawFood() {
  foodPulse = (foodPulse + 0.1) % (Math.PI * 2);
  const scale = 1 + 0.12 * Math.sin(foodPulse);
  const cx = (food.x + 0.5) * CELL;
  const cy = (food.y + 0.5) * CELL;
  const r = CELL * 0.38 * scale;

  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
  grd.addColorStop(0, foodColor.glow);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = foodColor.fill;
  ctx.shadowColor = foodColor.fill;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

function drawSnake() {
  const len = snake.length;
  snake.forEach((seg, i) => {
    const t = i / len;
    const alpha = 1 - t * 0.35;
    const green = Math.floor(210 - t * 100);

    ctx.beginPath();
    roundRect(ctx, seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, CELL * 0.22);
    ctx.fillStyle = i === 0 ? '#39ff85' : `rgba(30, ${green}, 80, ${alpha})`;
    ctx.shadowColor = i < 3 ? '#39ff85' : 'transparent';
    ctx.shadowBlur = i < 3 ? 10 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (i === 0) drawEye(seg);
  });
}

function drawEye(head) {
  const perpX = -dir.y;
  const perpY = dir.x;
  const ex = (head.x + 0.5 + dir.x * 0.2) * CELL;
  const ey = (head.y + 0.5 + dir.y * 0.2) * CELL;

  [{ s: 1 }, { s: -1 }].forEach(({ s }) => {
    const ox = ex + perpX * CELL * 0.18 * s;
    const oy = ey + perpY * CELL * 0.18 * s;

    ctx.beginPath();
    ctx.arc(ox, oy, CELL * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0f';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ox + CELL * 0.03, oy - CELL * 0.03, CELL * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  });
}

function roundRect(context, x, y, w, h, r) {
  if (context.roundRect) {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const KEY_MAP = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

function setDirection(d) {
  if (!d) return;
  if (d.x === -dir.x && d.y === -dir.y) return;
  if (d.x === -nextDir.x && d.y === -nextDir.y) return;
  nextDir = d;
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!started || !alive) startGame();
    else togglePause();
    return;
  }

  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    togglePause();
    return;
  }

  const d = KEY_MAP[e.key];
  if (!d) return;
  setDirection(d);
  e.preventDefault();
});

document.querySelectorAll('.dpad__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const map = {
      UP: { x: 0, y: -1 },
      DOWN: { x: 0, y: 1 },
      LEFT: { x: -1, y: 0 },
      RIGHT: { x: 1, y: 0 },
    };
    setDirection(map[btn.dataset.dir]);
  });
});

let touchStart = null;

canvas.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;

  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;

  const d = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 })
    : (dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  setDirection(d);
}, { passive: true });

window.addEventListener('resize', () => {
  resizeCanvas();
  if (!alive) drawFrame();
});

highScore = Number(localStorage.getItem('snekBest')) || 0;
elHighScore.textContent = highScore;
loadSettings();
snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
dir = { x: 1, y: 0 };
nextDir = { x: 1, y: 0 };
alive = false;
started = false;
score = 0;
level = 1;
food = { x: 15, y: 10 };
foodColor = FOOD_COLORS[0];

resizeCanvas();
showOverlay('start');
drawFrame();
