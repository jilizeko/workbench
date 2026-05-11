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
  GLOW_ALPHA: 0.22,
  BASE_LINE_WIDTH: 1.1,
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

function drawStrand(index, t, phases) {
  const strandT = index / Math.max(1, CONFIG.STRANDS - 1);
  const hue = 190 + strandT * 160 + Math.sin(t * 0.2 + strandT * 4.3) * 12;
  const sat = 70 + phases.minutePhase * 20;
  const light = 56 + Math.sin(t * 0.75 + strandT * 8) * 8;
  const alpha = 0.26 + phases.secondPhase * 0.36;

  const wobbleAmp = lerp(width, height, 0.5) * (0.018 + phases.hourPhase * 0.022);
  const phaseA = t * (0.42 + phases.minutePhase * 0.75) + strandT * 10;
  const phaseB = t * (0.66 + phases.secondPhase * 1.7) + strandT * 7;

  ctx.beginPath();

  for (let i = 0; i < CONFIG.POINTS_PER_STRAND; i += 1) {
    const tt = CONFIG.POINTS_PER_STRAND === 1 ? 0 : i / (CONFIG.POINTS_PER_STRAND - 1);
    const columnIndex = clamp(Math.round(tt * (columns.length - 1)), 0, columns.length - 1);
    const col = columns[columnIndex];
    const rowIndex = clamp(Math.floor(strandT * (col.length - 1)), 0, col.length - 1);
    const anchor = col[rowIndex];

    const bend1 = Math.sin(tt * Math.PI * 2 + phaseA + anchor.seed) * wobbleAmp;
    const bend2 = Math.cos(tt * Math.PI * 4 + phaseB + anchor.seed * 0.7) * wobbleAmp * 0.5;
    const drift = Math.sin(phaseB * 0.4 + tt * 9) * (height * 0.012);

    const x = anchor.x + bend1;
    const y = anchor.y + bend2 + drift;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    if (Math.random() < CONFIG.NODE_DENSITY) {
      const glow = 1.2 + Math.random() * 1.8;
      ctx.fillStyle = hsl(hue, sat, Math.min(90, light + 12), CONFIG.GLOW_ALPHA);
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  ctx.strokeStyle = hsl(hue, sat, light, alpha);
  ctx.lineWidth = CONFIG.BASE_LINE_WIDTH + Math.sin(strandT * 12 + t * 0.9) * 0.35;
  ctx.stroke();
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