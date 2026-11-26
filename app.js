import { ArUcoDetector } from './aruco.js';
import { SpaceARGame } from './game.js';

const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const demoBtnStart = document.getElementById('demoBtnStart');
const hud = document.getElementById('hud');
const controls = document.getElementById('controls');
const statusPill = document.getElementById('statusPill');

const scoreEl = document.getElementById('scoreVal');
const livesEl = document.getElementById('livesVal');
const waveEl = document.getElementById('waveVal');
const timeEl = document.getElementById('timeVal');

const gameOverModal = document.getElementById('gameOverModal');
const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl = document.getElementById('bestScore');
const retryBtn = document.getElementById('retryBtn');

const switchCamBtn = document.getElementById('switchCamBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const demoToggleBtn = document.getElementById('demoToggleBtn');
const restartBtn = document.getElementById('restartBtn');

const detector = new ArUcoDetector(320);
const game = new SpaceARGame();

let stream = null;
let facingMode = 'environment';
let running = false;
let demoMode = false;
let zeroAngle = 0;
let currentAngle = 0;
let touchU = null;
let keyTilt = 0;
let lastFrameTime = performance.now();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function startCamera(mode) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: mode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    video.style.transform = mode === 'user' ? 'scaleX(-1)' : 'none';
    await video.play();
    return true;
  } catch (err) {
    alert('Não foi possível acessar a câmera. Verifique a permissão ou use o Modo Demo.');
    return false;
  }
}

function getDemoQuad() {
  const w = canvas.width;
  const h = canvas.height;
  const bw = Math.min(w * 0.92, 540);
  const bh = Math.min(h * 0.66, 680);
  const cx = w * 0.5;
  const cy = h * 0.51;
  const hw = bw * 0.5;
  const hh = bh * 0.5;
  return {
    tl: { x: cx - hw, y: cy - hh },
    tr: { x: cx + hw, y: cy - hh },
    br: { x: cx + hw, y: cy + hh },
    bl: { x: cx - hw, y: cy + hh },
  };
}

function expandBoardToScreen(board) {
  const w = canvas.width;
  const h = canvas.height;
  const rawW = Math.hypot(board.tr.x - board.tl.x, board.tr.y - board.tl.y);
  const rawH = Math.hypot(board.bl.x - board.tl.x, board.bl.y - board.tl.y);

  // Mantém o jogo grande e legível na tela, preservando o centro e a inclinação da folha
  const targetW = Math.min(w * 0.92, Math.max(rawW * 1.65, w * 0.86));
  const targetH = Math.min(h * 0.66, Math.max(rawH * 1.65, h * 0.60));

  const rawCx = (board.tl.x + board.tr.x + board.br.x + board.bl.x) * 0.25;
  const rawCy = (board.tl.y + board.tr.y + board.br.y + board.bl.y) * 0.25;

  // Puxa suavemente em direção ao centro útil para não cortar o tabuleiro nas bordas
  const cx = Math.max(targetW * 0.45, Math.min(w - targetW * 0.45, rawCx * 0.35 + w * 0.5 * 0.65));
  const cy = Math.max(targetH * 0.48 + 56, Math.min(h - targetH * 0.48 - 64, rawCy * 0.35 + h * 0.51 * 0.65));

  const angle = Math.atan2(board.tr.y - board.tl.y, board.tr.x - board.tl.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = targetW * 0.5;
  const hh = targetH * 0.5;

  const rot = (dx, dy) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });

  return {
    tl: rot(-hw, -hh),
    tr: rot(hw, -hh),
    br: rot(hw, hh),
    bl: rot(-hw, hh),
  };
}

function normalizeAngle(rad) {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let boardQuad = null;
  let tiltInput = keyTilt;

  if (demoMode) {
    boardQuad = getDemoQuad();
    statusPill.textContent = 'Modo Demo (toque ou setas para mover)';
    statusPill.className = 'status-pill ok';
  } else if (video.readyState >= 2) {
    const res = detector.detect(video, canvas.width, canvas.height, facingMode === 'user');
    // Desenha contorno discreto nos marcadores detectados
    for (const m of res.markers) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      m.corners.forEach((c, idx) => (idx === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (res.found && res.board) {
      boardQuad = expandBoardToScreen(res.board);
      currentAngle = Math.atan2(
        boardQuad.tr.y - boardQuad.tl.y,
        boardQuad.tr.x - boardQuad.tl.x
      );
      const rel = normalizeAngle(currentAngle - zeroAngle);
      // Zona morta de ~3 graus, máximo em ~28 graus
      if (Math.abs(rel) > 0.05) {
        tiltInput += Math.max(-1, Math.min(1, rel / 0.48));
      }
      statusPill.textContent = `AR Ativo · ${res.markers.length}/4 marcadores`;
      statusPill.className = 'status-pill ok';
    } else {
      statusPill.textContent = `Aponte para a folha (${res.markers.length}/4 marcadores)`;
      statusPill.className = 'status-pill warn';
    }
  }

  if (boardQuad) {
    game.update(dt, tiltInput, touchU);
    game.render(ctx, boardQuad);
  }

  // Atualiza HUD
  scoreEl.textContent = game.score;
  livesEl.textContent = '❤️'.repeat(game.lives) || '💀';
  waveEl.textContent = game.wave;
  timeEl.textContent = `${game.elapsed.toFixed(1)}s`;

  if (game.gameOver && gameOverModal.classList.contains('hidden')) {
    finalScoreEl.textContent = game.score;
    bestScoreEl.textContent = game.bestScore;
    gameOverModal.classList.remove('hidden');
  }

  requestAnimationFrame(loop);
}

async function begin(useDemo) {
  demoMode = useDemo;
  if (!useDemo) {
    const ok = await startCamera(facingMode);
    if (!ok) return;
  }
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  controls.classList.remove('hidden');
  statusPill.classList.remove('hidden');
  demoToggleBtn.textContent = demoMode ? 'Usar Câmera' : 'Modo Demo';
  game.reset();
  running = true;
  lastFrameTime = performance.now();
  requestAnimationFrame(loop);
}

startBtn.addEventListener('click', () => begin(false));
demoBtnStart.addEventListener('click', () => begin(true));

switchCamBtn.addEventListener('click', async () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  if (!demoMode) await startCamera(facingMode);
});

calibrateBtn.addEventListener('click', () => {
  zeroAngle = currentAngle;
});

demoToggleBtn.addEventListener('click', async () => {
  demoMode = !demoMode;
  if (!demoMode && !stream) {
    const ok = await startCamera(facingMode);
    if (!ok) demoMode = true;
  }
  demoToggleBtn.textContent = demoMode ? 'Usar Câmera' : 'Modo Demo';
});

function restartGame() {
  game.reset();
  gameOverModal.classList.add('hidden');
}
restartBtn.addEventListener('click', restartGame);
retryBtn.addEventListener('click', restartGame);

// Controle por toque/arraste na tela (útil no Modo Demo ou apoio no celular)
canvas.addEventListener('pointerdown', (e) => {
  touchU = Math.max(0.08, Math.min(0.92, e.clientX / canvas.width));
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons > 0 || e.pointerType === 'touch') {
    touchU = Math.max(0.08, Math.min(0.92, e.clientX / canvas.width));
  }
});
canvas.addEventListener('pointerup', () => { touchU = null; });
canvas.addEventListener('pointercancel', () => { touchU = null; });

// Controle por teclado (PC)
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyTilt = -1;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyTilt = 1;
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) keyTilt = 0;
});
