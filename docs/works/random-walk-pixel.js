let canvas;
let ctx;
let bufferCanvas;
let bufferCtx;
let rafId;
let width = 0;
let height = 0;
let viewWidth = 0;
let viewHeight = 0;
let dpr = 1;
let buffer = null;
let imageData = null;
let startTime = 0;
let ants = [];
let onResize = null;

const ANT_COUNT =10;
const SCALE = 1;
const STEPS_PER_FRAME = 10;   
const STEPS_MIN = 2;
const STEPS_MAX = 20;
const STEP_MODE = "fixed"; // "fixed" or "luma"
const FADE = 0.995;  
const WARMUP_THRESHOLD = 20/ 255;
const WARMUP_FRAMES = FADE < 1
  ? Math.ceil(Math.log(WARMUP_THRESHOLD) / Math.log(FADE))
  : 0;
const GAMMA = 1.9; // Adjust for brightness (lower is brighter)
const INV_GAMMA = .9 / GAMMA;
const START_MODE = "center" ; // "random" or "center"
const BLEND_MODE = "replace"; // "replace" or "add"
const MODE = 9;
const FIELD_BIAS_BASE = 0.5;
const FIELD_BIAS_AMP = .3;
const FIELD_BIAS_SPEED = .3;
const LISSA_A_BASE = 120;
const LISSA_A_AMP = 100.0;
const LISSA_A_SPEED = 0.3;
const LISSA_B_BASE = 1.1;
const LISSA_B_AMP = 10.0;
const LISSA_B_SPEED = 0.01;
const ROSE_K_BASE = 10.2;
const ROSE_K_AMP = 100.0;
const ROSE_K_SPEED = 1.1;
const WAVY_FREQ_BASE = 1.0135;
const WAVY_FREQ_AMP = 10.0;
const WAVY_FREQ_SPEED = 0.02;

let timeSeconds = 0;
let currentParams = {
  roseK: ROSE_K_BASE,
  lissaA: LISSA_A_BASE,
  lissaB: LISSA_B_BASE,
  wavyFreq: WAVY_FREQ_BASE,
  fieldBias: FIELD_BIAS_BASE,
};
const PALETTE = [
  // "#ffffff",
  "#0f1414",
  "#1c2323",
  "#283636",
  "#324848",
  "#406060",
  "#4f7474",
  "#6a8c86",
  "#8eaba0",
  "#b9c7b0",
  "#e5e1b8",
  "#f2e8c9",
  "#d9a77a",
  "#b97a52",
  "#8f5336",
  "#6b3a27",
  "#4d261c",
  "#331812",
  "#222020",
  "#3b3a33",
  "#57594b",
];

function hexToRgb01(hex) {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function pickAntColor() {
  return hexToRgb01(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
}

function colorLuma(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function stepsForColor(color) {
  const t = Math.max(0, Math.min(1, colorLuma(color)));
  return Math.round(STEPS_MIN + (STEPS_MAX - STEPS_MIN) * t);
}

function createAnts() {
  ants = [];
  for (let i = 0; i < ANT_COUNT; i += 1) {
    const color = pickAntColor();
    const x = START_MODE === "random" ? Math.random() * width : width * 0.5;
    const y = START_MODE === "random" ? Math.random() * height : height * 0.5;
    const steps = STEP_MODE === "luma" ? stepsForColor(color) : STEPS_PER_FRAME;
    ants.push({ x, y, color, steps, index: i });
  }
}

function resize() {
  if (!canvas) return;
  dpr = window.devicePixelRatio || 1;
  viewWidth = Math.max(1, canvas.clientWidth);
  viewHeight = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  width = Math.max(1, Math.floor(viewWidth / SCALE));
  height = Math.max(1, Math.floor(viewHeight / SCALE));
  bufferCanvas.width = width;
  bufferCanvas.height = height;
  imageData = bufferCtx.createImageData(width, height);
  buffer = new Float32Array(width * height * 3);
  createAnts();
}

function pickRandomStep() {
  return {
    dx: Math.floor(Math.random() * 3) - 1,
    dy: Math.floor(Math.random() * 3) - 1,
  };
}

function pickFieldStep(vecX, vecY) {
  const mag = Math.hypot(vecX, vecY);
  if (mag === 0) return pickRandomStep();
  let best = { dx: 0, dy: 0 };
  let bestDot = -Infinity;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const dot = dx * vecX + dy * vecY;
      if (dot > bestDot) {
        bestDot = dot;
        best = { dx, dy };
      }
    }
  }

  return best;
}

function fieldVector(ant) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = ant.x - cx;
  const ry = ant.y - cy;
  const angle = Math.atan2(ry, rx);
  const radius = Math.hypot(rx, ry) || 1;
  const even = ant.index % 2 === 0;

  switch (MODE) {
    case 1: {
      return { x: ry, y: -rx };
    }
    case 2: {
      return even ? { x: ry, y: -rx } : { x: -ry, y: rx };
    }
    case 3: {
      return { x: 0, y: 1 };
    }
    case 4: {
      return even ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }
    case 5: {
      return { x: 1, y: 0 };
    }
    case 6: {
      return even ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }
    case 7: {
      return { x: ry - 0.35 * rx, y: -rx - 0.35 * ry };
    }
    case 8: {
      return { x: ry + 0.35 * rx, y: -rx + 0.35 * ry };
    }
    case 9: {
      return {
        x: Math.sin(currentParams.lissaA * angle) * radius,
        y: Math.cos(currentParams.lissaB * angle) * radius,
      };
    }
    case 10: {
      const r = Math.cos(currentParams.roseK * angle);
      return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    }
    case 11: {
      return {
        x: Math.sin(ant.y * currentParams.wavyFreq),
        y: Math.cos(ant.x * currentParams.wavyFreq),
      };
    }
    default: {
      return { x: ry, y: -rx };
    }
  }
}

function step(ant) {
  const vec = fieldVector(ant);
  const { dx, dy } = Math.random() < currentParams.fieldBias
    ? pickFieldStep(vec.x, vec.y)
    : pickRandomStep();

  ant.x += dx;
  ant.y += dy;

  if (ant.x < 0) ant.x += width;
  if (ant.x >= width) ant.x -= width;
  if (ant.y < 0) ant.y += height;
  if (ant.y >= height) ant.y -= height;
}

function simulateFrame() {
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] *= FADE;
  }

  for (let a = 0; a < ants.length; a += 1) {
    const ant = ants[a];
    const stepCount = STEP_MODE === "luma" ? ant.steps : STEPS_PER_FRAME;
    for (let i = 0; i < stepCount; i += 1) {
      step(ant);

      const px = Math.floor(ant.x);
      const py = Math.floor(ant.y);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        const index = (py * width + px) * 3;
        if (BLEND_MODE === "replace") {
          buffer[index] = ant.color[0];
          buffer[index + 1] = ant.color[1];
          buffer[index + 2] = ant.color[2];
        } else {
          buffer[index] = Math.min(1, buffer[index] + ant.color[0]);
          buffer[index + 1] = Math.min(1, buffer[index + 1] + ant.color[1]);
          buffer[index + 2] = Math.min(1, buffer[index + 2] + ant.color[2]);
        }
      }
    }
  }
}

function updateParams(t) {
  const roseK = ROSE_K_BASE + ROSE_K_AMP * Math.sin(t * ROSE_K_SPEED);
  const lissaA = LISSA_A_BASE + LISSA_A_AMP * Math.sin(t * LISSA_A_SPEED);
  const lissaB = LISSA_B_BASE + LISSA_B_AMP * Math.sin(t * LISSA_B_SPEED);
  const wavyFreq = WAVY_FREQ_BASE + WAVY_FREQ_AMP * Math.sin(t * WAVY_FREQ_SPEED);
  const fieldBias = Math.max(
    0,
    Math.min(1, FIELD_BIAS_BASE + FIELD_BIAS_AMP * Math.sin(t * FIELD_BIAS_SPEED))
  );
  currentParams = { roseK, lissaA, lissaB, wavyFreq, fieldBias };
}

function renderFrame() {
  const data = imageData.data;
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const b = i * 3;
    const r = Math.pow(Math.max(0, Math.min(1, buffer[b])), INV_GAMMA);
    const g = Math.pow(Math.max(0, Math.min(1, buffer[b + 1])), INV_GAMMA);
    const bch = Math.pow(Math.max(0, Math.min(1, buffer[b + 2])), INV_GAMMA);
    data[o] = Math.round(r * 255);
    data[o + 1] = Math.round(g * 255);
    data[o + 2] = Math.round(bch * 255);
    data[o + 3] = 255;
  }

  bufferCtx.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bufferCanvas, 0, 0, width, height, 0, 0, viewWidth, viewHeight);
}

function draw(time) {
  // const elapsed = (time - startTime) * 0.001;
  // if (elapsed < 0) return;
  timeSeconds = (time - startTime) * 0.001;
  updateParams(timeSeconds);

  simulateFrame();
  renderFrame();

  rafId = requestAnimationFrame(draw);
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  bufferCanvas = document.createElement("canvas");
  bufferCtx = bufferCanvas.getContext("2d");
  container.appendChild(canvas);

  onResize = () => {
    resize();
  };

  window.addEventListener("resize", onResize);
  resize();
}

export function start() {
  startTime = performance.now();
  timeSeconds = 0;
  updateParams(timeSeconds);
  for (let i = 0; i < WARMUP_FRAMES; i += 1) {
    simulateFrame();
  }
  renderFrame();
  rafId = requestAnimationFrame(draw);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);

  canvas = null;
  ctx = null;
  bufferCanvas = null;
  bufferCtx = null;
  rafId = null;
  onResize = null;
  buffer = null;
  imageData = null;
  ants = [];
}
