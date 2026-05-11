let canvas;
let ctx;
let rafId;
let onResize;

let width = 0;
let height = 0;
let startTime = 0;

let columns = [];

const CONFIG = {
  GRID_X: 54,
  GRID_Y: 34,
  STRANDS: 18,
  POINTS_PER_STRAND: 170,
  BG_TOP: "#05070c",
  BG_BOTTOM: "#100d16",
  TRAIL_ALPHA: 0.12,
  GLOW_ALPHA: 0.28,
  BASE_LINE_WIDTH: 1.2,
  NODE_DENSITY: 0.11,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getTimePhases(date) {
  const h = date.getHours() % 24;
  const m = date.getMinutes() % 60;
  const s = date.getSeconds() % 60;

  const hourPhase = (h + m / 60) / 24;
  const minutePhase = (m + s / 60) / 60;
  const secondPhase = s / 60;

  return { hourPhase, minutePhase, secondPhase };
}

function hsl(h, s, l, a) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function buildColumns() {
  columns = [];
  const usableWidth = width * 0.92;
  const usableHeight = height * 0.86;
  const left = (width - usableWidth) * 0.5;
  const top = (height - usableHeight) * 0.5;

  for (let gx = 0; gx < CONFIG.GRID_X; gx += 1) {
    const tx = CONFIG.GRID_X === 1 ? 0 : gx / (CONFIG.GRID_X - 1);
    const x = left + tx * usableWidth;
    const column = [];

    for (let gy = 0; gy < CONFIG.GRID_Y; gy += 1) {
      const ty = CONFIG.GRID_Y === 1 ? 0 : gy / (CONFIG.GRID_Y - 1);
      const y = top + ty * usableHeight;
      column.push({
        x,
        y,
        seed: Math.random() * Math.PI * 2,
      });
    }

    columns.push(column);
  }
}

function resize() {
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  buildColumns();

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, CONFIG.BG_TOP);
  bg.addColorStop(1, CONFIG.BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawBackdrop() {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, hsl(214, 36, 7, 1));
  bg.addColorStop(1, hsl(286, 28, 8, 1));

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(12, 11, 18, ${CONFIG.TRAIL_ALPHA})`;
  ctx.fillRect(0, 0, width, height);
}

function strandPoint(index, i, t, phases) {
  const strandT = index / Math.max(1, CONFIG.STRANDS - 1);
  const tt = CONFIG.POINTS_PER_STRAND === 1 ? 0 : i / (CONFIG.POINTS_PER_STRAND - 1);
  const columnIndex = clamp(Math.round(tt * (columns.length - 1)), 0, columns.length - 1);
  const col = columns[columnIndex];
  const rowIndex = clamp(Math.floor(strandT * (col.length - 1)), 0, col.length - 1);
  const anchor = col[rowIndex];

  const wobbleAmp = lerp(width, height, 0.5) * (0.055 + phases.hourPhase * 0.06);
  const phaseA = t * (0.52 + phases.minutePhase * 0.75) + strandT * 10;
  const phaseB = t * (0.76 + phases.secondPhase * 1.7) + strandT * 7;

  const bend1 = Math.sin(tt * Math.PI * 2 + phaseA + anchor.seed) * wobbleAmp;
  const bend2 = Math.cos(tt * Math.PI * 4 + phaseB + anchor.seed * 0.7) * wobbleAmp * 0.6;
  // cross-strand vertical drift — lets strands wander into each other's bands
  const crossDrift = Math.sin(phaseA * 0.31 + anchor.seed * 1.7) * (height * 0.048);
  const drift = Math.sin(phaseB * 0.4 + tt * 9) * (height * 0.018);

  return {
    x: anchor.x + bend1,
    y: anchor.y + bend2 + drift + crossDrift,
    anchor,
  };
}

function drawStrand(index, t, phases) {
  const strandT = index / Math.max(1, CONFIG.STRANDS - 1);
  // full-spectrum hue: spread across 0–360 so all strands together read as a prism
  const hue = (strandT * 360 + t * 8 + Math.sin(t * 0.2 + strandT * 4.3) * 18) % 360;
  const sat = 72 + phases.minutePhase * 18;
  const light = 56 + Math.sin(t * 0.75 + strandT * 8) * 8;
  const alpha = 0.32 + phases.secondPhase * 0.32;

  // --- pass 1: continuous stroke (no beginPath inside the loop) ---
  ctx.beginPath();
  for (let i = 0; i < CONFIG.POINTS_PER_STRAND; i += 1) {
    const { x, y } = strandPoint(index, i, t, phases);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = hsl(hue, sat, light, alpha);
  ctx.lineWidth = CONFIG.BASE_LINE_WIDTH + Math.sin(strandT * 12 + t * 0.9) * 0.35;
  ctx.stroke();

  // --- pass 2: glow nodes using deterministic hash (no Math.random → no flicker) ---
  for (let i = 0; i < CONFIG.POINTS_PER_STRAND; i += 1) {
    const { x, y, anchor } = strandPoint(index, i, t, phases);
    // pseudo-random per-point, stable across frames
    const nodeHash = (Math.sin(anchor.seed * 127.1 + i * 311.7) * 0.5 + 0.5);
    if (nodeHash < CONFIG.NODE_DENSITY) {
      const glow = 1.1 + nodeHash * 2.2;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fillStyle = hsl(hue, sat, Math.min(92, light + 16), CONFIG.GLOW_ALPHA);
      ctx.fill();
    }
  }
}

function draw(time) {
  if (!ctx) return;
  const t = (time - startTime) * 0.001;
  const phases = getTimePhases(new Date());

  drawBackdrop();

  for (let i = 0; i < CONFIG.STRANDS; i += 1) {
    drawStrand(i, t, phases);
  }

  rafId = requestAnimationFrame(draw);
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  onResize = () => {
    resize();
  };

  window.addEventListener("resize", onResize);
  resize();
}

export function start() {
  startTime = performance.now();
  rafId = requestAnimationFrame(draw);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);

  canvas = null;
  ctx = null;
  rafId = null;
  onResize = null;
  columns = [];
}