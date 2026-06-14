/* ═══════════════════════════════════════════════════════
   SNEK — Complete Snake Game
   Features: Colorful food, speed levels, high score,
             Web Audio sound effects, swipe support
═══════════════════════════════════════════════════════ */

/* ── Canvas setup ────────────────────────────────────── */
const canvas   = document.getElementById('gameCanvas');
const ctx      = canvas.getContext('2d');
const COLS     = 20;
const ROWS     = 20;
let   CELL;    // computed from canvas size

/* ── DOM refs ────────────────────────────────────────── */
const elScore       = document.getElementById('score');
const elHighScore   = document.getElementById('highScore');
const elSpeedFill   = document.getElementById('speedFill');
const elSpeedLevel  = document.getElementById('speedLevel');
const elFinalScore  = document.getElementById('finalScore');
const elFinalBest   = document.getElementById('finalBest');
const elFinalLength = document.getElementById('finalLength');
const elFinalLevel  = document.getElementById('finalLevel');

const overlayStart  = document.getElementById('overlayStart');
const overlayDead   = document.getElementById('overlayDead');
const overlayPause  = document.getElementById('overlayPause');

document.getElementById('btnStart').addEventListener('click',   startGame);
document.getElementById('btnRestart').addEventListener('click', startGame);
document.getElementById('btnResume').addEventListener('click',  togglePause);
document.getElementById('btnPause').addEventListener('click',   togglePause);

/* ── Game state ──────────────────────────────────────── */
let snake, dir, nextDir, food, score, highScore, gameLoop,
    speed, level, alive, paused, started, frameCount;

highScore = +localStorage.getItem('snekBest') || 0;
elHighScore.textContent = highScore;

/* ── Speed config ────────────────────────────────────── */
const BASE_INTERVAL = 160;  // ms at level 1
const MIN_INTERVAL  = 55;   // ms floor
const SPEED_STEP    = 15;   // every N points → level up

/* ── Food colour palette ─────────────────────────────── */
const FOOD_COLORS = [
  { fill: '#ff4d6d', glow: '#ff004466' },  // red
  { fill: '#ffe066', glow: '#ffcc0066' },  // yellow
  { fill: '#00e5ff', glow: '#00e5ff66' },  // cyan
  { fill: '#b44dff', glow: '#b44dff66' },  // purple
  { fill: '#ff9c33', glow: '#ff9c3366' },  // orange
  { fill: '#ff4db8', glow: '#ff4db866' },  // pink
  { fill: '#39ff85', glow: '#39ff8566' },  // green (rare)
];

let foodColor = FOOD_COLORS[0];
let foodPulse = 0;

/* ── Web Audio (lazy init) ───────────────────────────── */
let audioCtx = null;

function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { audioCtx = null; }
  }
  return audioCtx;
}

function playTone(freq, type = 'square', dur = 0.08, vol = 0.18) {
  const ac = getAudio();
  if (!ac) return;
  try {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  } catch { /* ignore */ }
}

function sfxEat()  { playTone(660, 'sine', 0.12, 0.22); }
function sfxDie()  {
  playTone(220, 'sawtooth', 0.18, 0.3);
  setTimeout(() => playTone(140, 'sawtooth', 0.25, 0.25), 160);
}
function sfxLevel() {
  playTone(523, 'sine', 0.08, 0.2);
  setTimeout(() => playTone(659, 'sine', 0.08, 0.2), 90);
  setTimeout(() => playTone(784, 'sine', 0.12, 0.25), 180);
}

/* ── Canvas resize ───────────────────────────────────── */
function resizeCanvas() {
  const arena = document.getElementById('arena');
  const size  = arena.clientWidth;
  canvas.width  = size;
  canvas.height = size;
  CELL = size / COLS;
}

window.addEventListener('resize', () => {
  resizeCanvas();
  if (!alive) drawFrame();
});
resizeCanvas();

/* ── Init / Start ────────────────────────────────────── */
function startGame() {
  showOverlay(null);

  snake     = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir       = { x: 1, y: 0 };
  nextDir   = { x: 1, y: 0 };
  score     = 0;
  level     = 1;
  speed     = BASE_INTERVAL;
  alive     = true;
  paused    = false;
  started   = true;
  frameCount = 0;

  foodColor = randomFoodColor();
  placeFood();
  updateScore(0);
  updateSpeedUI();

  clearInterval(gameLoop);
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

/* ── Tick ────────────────────────────────────────────── */
function tick() {
  dir = { ...nextDir };

  const head = {
    x: (snake[0].x + dir.x + COLS) % COLS,
    y: (snake[0].y + dir.y + ROWS) % ROWS,
  };

  // Self collision
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    return endGame();
  }

  snake.unshift(head);

  // Eat food
  if (head.x === food.x && head.y === food.y) {
    sfxEat();
    updateScore(score + 10);
    foodColor = randomFoodColor();
    placeFood();
    checkLevel();
  } else {
    snake.pop();
  }

  frameCount++;
}

/* ── Score & level ───────────────────────────────────── */
function updateScore(val) {
  score = val;
  elScore.textContent = score;

  // Pop animation
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
    level = newLevel;
    speed = Math.max(MIN_INTERVAL, BASE_INTERVAL - (level - 1) * 12);
    sfxLevel();
    updateSpeedUI();
  }
}

function updateSpeedUI() {
  const maxLevel = Math.floor((BASE_INTERVAL - MIN_INTERVAL) / 12) + 1;
  const pct      = Math.min(100, ((level - 1) / (maxLevel - 1)) * 100) || 5;
  elSpeedFill.style.width = pct + '%';

  if (pct < 40)       elSpeedFill.style.background = 'linear-gradient(90deg, #39ff85, #00e5ff)';
  else if (pct < 70)  elSpeedFill.style.background = 'linear-gradient(90deg, #ffe066, #ff9c33)';
  else                elSpeedFill.style.background = 'linear-gradient(90deg, #ff9c33, #ff4d6d)';

  elSpeedLevel.textContent = level;
}

/* ── Food ────────────────────────────────────────────── */
function placeFood() {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  food = pos;
  foodPulse = 0;
}

function randomFoodColor() {
  return FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];
}

/* ── Game Over ───────────────────────────────────────── */
function endGame() {
  alive = false;
  clearTimeout(gameLoop);
  sfxDie();

  elFinalScore.textContent  = score;
  elFinalBest.textContent   = highScore;
  elFinalLength.textContent = snake.length;
  elFinalLevel.textContent  = level;

  drawFrame();
  setTimeout(() => showOverlay('dead'), 400);
}

/* ── Pause ───────────────────────────────────────────── */
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

/* ── Overlays ────────────────────────────────────────── */
function showOverlay(which) {
  [overlayStart, overlayDead, overlayPause].forEach(el => el.classList.add('overlay--hidden'));
  if (which === 'start') overlayStart.classList.remove('overlay--hidden');
  if (which === 'dead')  overlayDead.classList.remove('overlay--hidden');
  if (which === 'pause') overlayPause.classList.remove('overlay--hidden');
}

/* ── Drawing ─────────────────────────────────────────── */
function drawFrame() {
  if (!CELL) resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawFood();
  drawSnake();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(42, 42, 64, 0.5)';
  ctx.lineWidth   = 0.5;
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
  const cx    = (food.x + 0.5) * CELL;
  const cy    = (food.y + 0.5) * CELL;
  const r     = (CELL * 0.38) * scale;

  // Glow
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
  grd.addColorStop(0, foodColor.glow);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = foodColor.fill;
  ctx.shadowColor = foodColor.fill;
  ctx.shadowBlur  = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Shine
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

function drawSnake() {
  const len = snake.length;
  snake.forEach((seg, i) => {
    const t   = i / len;                         // 0 = head, 1 = tail
    const cx  = seg.x * CELL + CELL / 2;
    const cy  = seg.y * CELL + CELL / 2;
    const r   = CELL * 0.44 * (1 - t * 0.25);   // taper to tail

    // Colour: head is bright green → tail fades
    const alpha = 1 - t * 0.35;
    const green = Math.floor(210 - t * 100);

    ctx.beginPath();
    roundRect(ctx, seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, CELL * 0.22);
    ctx.fillStyle = i === 0
      ? '#39ff85'                                // head: full neon
      : `rgba(30, ${green}, 80, ${alpha})`;     // body: gradient fade
    ctx.shadowColor = i < 3 ? '#39ff85' : 'transparent';
    ctx.shadowBlur  = i < 3 ? 10 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eye on head
    if (i === 0) drawEye(seg);
  });
}

function drawEye(head) {
  // Left + right eye positions relative to direction
  const perpX = -dir.y;
  const perpY =  dir.x;
  const ex    = (head.x + 0.5 + dir.x * 0.2) * CELL;
  const ey    = (head.y + 0.5 + dir.y * 0.2) * CELL;

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

/* ── Rounded rect helper (polyfill) ─────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }
}

/* ── Input: Keyboard ─────────────────────────────────── */
const KEY_MAP = {
  ArrowUp:    { x: 0,  y: -1 },
  ArrowDown:  { x: 0,  y:  1 },
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x: 1,  y:  0 },
  w:          { x: 0,  y: -1 },
  s:          { x: 0,  y:  1 },
  a:          { x: -1, y:  0 },
  d:          { x: 1,  y:  0 },
};

document.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    togglePause();
    return;
  }
  const d = KEY_MAP[e.key];
  if (!d) return;

  // Prevent reverse
  if (d.x === -dir.x && d.y === -dir.y) return;
  if (d.x !== 0 || d.y !== 0) {
    nextDir = d;
    e.preventDefault();
  }
});

/* ── Input: Mobile D-Pad ─────────────────────────────── */
document.querySelectorAll('.dpad__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.dir;
    const map = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
    const d   = map[key];
    if (!d || (d.x === -dir.x && d.y === -dir.y)) return;
    nextDir = d;
  });
});

/* ── Input: Swipe ────────────────────────────────────── */
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

  let d;
  if (Math.abs(dx) > Math.abs(dy)) {
    d = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  } else {
    d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }

  if (d.x === -dir.x && d.y === -dir.y) return;
  nextDir = d;
}, { passive: true });

/* ── Idle draw loop (food pulse on start screen) ─────── */
function idleLoop() {
  if (!alive) {
    if (!started && food) {
      drawFrame();
    }
    requestAnimationFrame(idleLoop);
  }
}

/* ── Boot ────────────────────────────────────────────── */
snake  = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
dir    = { x: 1, y: 0 };
nextDir = { x: 1, y: 0 };
alive  = false;
started = false;
score  = 0;
level  = 1;
food   = { x: 15, y: 10 };
foodColor = FOOD_COLORS[0];
foodPulse = 0;

showOverlay('start');
drawFrame();
requestAnimationFrame(idleLoop);