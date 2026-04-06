let canvas;
let ctx;
let rafId;
let width = 0;
let height = 0;
let onResize = null;
let maskCanvas;
let maskCtx;
let maskData = null;
let circles = [];
let noiseGrid = null;
let noiseCols = 0;
let noiseRows = 0;
let radiusScale = 1;
let lastTimeKey = "";
let lastMaskUpdate = 0;
let startTime = 0;

const CONFIG = {
  SHOW_HOURS: true,
  SHOW_MINUTES: true,
  SHOW_SECONDS: true,
  MAX_COVERAGE: 0.8,
  FONT_FAMILY: "Bebas Neue",
  FONT_WEIGHT: "400",
  LINE_HEIGHT: 0.92,
  TICK_MS: 1000,
  LAYERS: 6,
  CIRCLES_PER_LAYER: 16050,
  RADIUS_MEAN: 4,
  RADIUS_JITTER: 2,
  RADIUS_POWER: 4.2,
  RADIUS_ANIM_SPEED: 0.01,
  RADIUS_CANVAS_BASE: 900,
  COLOR_MODE: "gradient",
  GRADIENT_A: "#f25c54",
  GRADIENT_B: "#0b1320",
  PALETTE: ["#f25c54", "#f0b67f", "#d6d1b1", "#c7efcf", "#eef5db"],
  BASE_ALPHA: 0.85,
  BG: "#111111",
  WIGGLE_AMPLITUDE: 0.001,
  WIGGLE_FREQUENCY: 0.2,
  WIGGLE_DISTANCE: 1000,
  LAYER_SPREAD: 0.005,
  NOISE_ENABLED: true,
  NOISE_SPEED: .016,
  NOISE_SCALE: 10,
  NOISE_THRESHOLD: 0.985,
};

function pad2(value) {
  return value.toString().padStart(2, "0");
}

function getTimeParts(date) {
  const parts = [];
  if (CONFIG.SHOW_HOURS) parts.push(pad2(date.getHours()));
  if (CONFIG.SHOW_MINUTES) parts.push(pad2(date.getMinutes()));
  if (CONFIG.SHOW_SECONDS) parts.push(pad2(date.getSeconds()));
  return parts;
}

function getTimeKey(date) {
  return getTimeParts(date).join(":");
}

function isPortrait() {
  return height > width * 1.05;
}

function computeFontSize(lines) {
  const maxWidth = width * CONFIG.MAX_COVERAGE;
  const maxHeight = height * CONFIG.MAX_COVERAGE;
  let low = 10;
  let high = Math.max(12, Math.min(width, height) * 2);
  let best = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    maskCtx.font = `${CONFIG.FONT_WEIGHT} ${mid}px "${CONFIG.FONT_FAMILY}", sans-serif`;
    let lineWidth = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const metrics = maskCtx.measureText(lines[i]);
      lineWidth = Math.max(lineWidth, metrics.width);
    }

    const totalHeight = mid * CONFIG.LINE_HEIGHT * lines.length;
    if (lineWidth <= maxWidth && totalHeight <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function renderMask(date) {
  if (!maskCtx) return;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "black";
  maskCtx.fillRect(0, 0, width, height);

  const parts = getTimeParts(date);
  const portrait = isPortrait();
  const lines = portrait ? parts : [parts.join(":")];
  const fontSize = computeFontSize(lines);
  const lineHeight = fontSize * CONFIG.LINE_HEIGHT;

  maskCtx.font = `${CONFIG.FONT_WEIGHT} ${fontSize}px "${CONFIG.FONT_FAMILY}", sans-serif`;
  maskCtx.textAlign = "center";
  maskCtx.textBaseline = "middle";
  maskCtx.fillStyle = "white";

  if (portrait) {
    const totalHeight = lineHeight * lines.length;
    const startY = height * 0.5 - totalHeight * 0.5 + lineHeight * 0.5;
    for (let i = 0; i < lines.length; i += 1) {
      const y = startY + i * lineHeight;
      maskCtx.fillText(lines[i], width * 0.5, y);
    }
  } else {
    maskCtx.fillText(lines[0], width * 0.5, height * 0.5);
  }

  maskData = maskCtx.getImageData(0, 0, width, height);
}

function sampleMask(x, y, t) {
  if (!maskData) return false;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return false;
  const index = (iy * width + ix) * 4;
  const baseOn = maskData.data[index] > 10;
  if (!CONFIG.NOISE_ENABLED) return baseOn;
  const noiseValue = noiseAt(x, y, t || 0);
  return baseOn || noiseValue > CONFIG.NOISE_THRESHOLD;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const intValue = parseInt(value, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorFromGradient(t) {
  const a = hexToRgb(CONFIG.GRADIENT_A);
  const b = hexToRgb(CONFIG.GRADIENT_B);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bVal = Math.round(lerp(a.b, b.b, t));
  return `rgba(${r}, ${g}, ${bVal}, ${CONFIG.BASE_ALPHA})`;
}

function pickColor() {
  if (CONFIG.COLOR_MODE === "palette") {
    const pick = CONFIG.PALETTE[Math.floor(Math.random() * CONFIG.PALETTE.length)];
    const rgb = hexToRgb(pick);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${CONFIG.BASE_ALPHA})`;
  }

  return colorFromGradient(Math.random());
}

function randomBaseRadius() {
  const min = Math.max(1, CONFIG.RADIUS_MEAN - CONFIG.RADIUS_JITTER);
  const max = Math.max(min + 0.1, CONFIG.RADIUS_MEAN + CONFIG.RADIUS_JITTER);
  const t = Math.pow(Math.random(), CONFIG.RADIUS_POWER);
  return (min + (max - min) * t) * radiusScale;
}

function buildCircles() {
  circles = [];
  const totalLayers = Math.max(1, CONFIG.LAYERS);
  const perLayer = Math.max(1, CONFIG.CIRCLES_PER_LAYER);

  for (let layer = 0; layer < totalLayers; layer += 1) {
    const z = totalLayers === 1 ? 0 : layer / (totalLayers - 1);
    for (let i = 0; i < perLayer; i += 1) {
      const baseRadius = randomBaseRadius();
      const x = Math.random() * width;
      const y = Math.random() * height;
      const inMask = sampleMask(x, y, 0);
      circles.push({
        x,
        y,
        z,
        baseRadius,
        radius: 0,
        targetRadius: 0,
        inMask,
        color: pickColor(),
      });
    }
  }
}

function refreshCircleStyle(circle) {
  circle.baseRadius = randomBaseRadius();
  circle.color = pickColor();
}

function buildNoiseField() {
  if (!CONFIG.NOISE_ENABLED) {
    noiseGrid = null;
    return;
  }

  const scale = Math.max(8, CONFIG.NOISE_SCALE);
  noiseCols = Math.max(2, Math.ceil(width / scale) + 1);
  noiseRows = Math.max(2, Math.ceil(height / scale) + 1);
  noiseGrid = new Float32Array(noiseCols * noiseRows);

  for (let i = 0; i < noiseGrid.length; i += 1) {
    noiseGrid[i] = Math.random();
  }
}

function noiseAt(x, y, t) {
  if (!noiseGrid) return 0;
  const scale = Math.max(8, CONFIG.NOISE_SCALE);
  const nx = x / scale + t * CONFIG.NOISE_SPEED;
  const ny = y / scale + t * CONFIG.NOISE_SPEED * 0.7;
  const x0 = Math.floor(nx);
  const y0 = Math.floor(ny);
  const tx = nx - x0;
  const ty = ny - y0;

  const ix0 = ((x0 % noiseCols) + noiseCols) % noiseCols;
  const iy0 = ((y0 % noiseRows) + noiseRows) % noiseRows;
  const ix1 = (ix0 + 1) % noiseCols;
  const iy1 = (iy0 + 1) % noiseRows;

  const v00 = noiseGrid[iy0 * noiseCols + ix0];
  const v10 = noiseGrid[iy0 * noiseCols + ix1];
  const v01 = noiseGrid[iy1 * noiseCols + ix0];
  const v11 = noiseGrid[iy1 * noiseCols + ix1];

  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const ixA = lerp(v00, v10, sx);
  const ixB = lerp(v01, v11, sx);
  return lerp(ixA, ixB, sy);
}

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  radiusScale = Math.max(0.4, Math.min(2.2, Math.min(width, height) / CONFIG.RADIUS_CANVAS_BASE));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  maskCanvas.width = width;
  maskCanvas.height = height;

  renderMask(new Date());
  buildCircles();
  buildNoiseField();
}

function draw(time) {
  const t = (time - startTime) * 0.001;
  ctx.fillStyle = CONFIG.BG;
  ctx.fillRect(0, 0, width, height);

  if (time - lastMaskUpdate >= CONFIG.TICK_MS) {
    const now = new Date();
    const timeKey = getTimeKey(now);
    lastMaskUpdate = time;

    if (timeKey !== lastTimeKey) {
      lastTimeKey = timeKey;
      renderMask(now);
    }
  }

  const wiggleAngle = Math.sin(t * CONFIG.WIGGLE_FREQUENCY * Math.PI * 2) * CONFIG.WIGGLE_AMPLITUDE;
  const wiggleX = Math.sin(t * CONFIG.WIGGLE_FREQUENCY * 1.3) * CONFIG.WIGGLE_DISTANCE;
  const wiggleY = Math.cos(t * CONFIG.WIGGLE_FREQUENCY * 1.1) * CONFIG.WIGGLE_DISTANCE;
  const cx = width * 0.5 + wiggleX;
  const cy = height * 0.5 + wiggleY;
  const cosA = Math.cos(wiggleAngle);
  const sinA = Math.sin(wiggleAngle);

  for (let i = 0; i < circles.length; i += 1) {
    const circle = circles[i];
    circle.inMask = sampleMask(circle.x, circle.y, t);
    circle.targetRadius = circle.inMask ? circle.baseRadius : 0;
    circle.radius += (circle.targetRadius - circle.radius) * CONFIG.RADIUS_ANIM_SPEED;
    if (!circle.inMask && circle.radius <= 0.05) refreshCircleStyle(circle);
    if (circle.radius <= 0.05) continue;

    const depth = (circle.z - 0.5) * 2;
    const scale = 1 + depth * CONFIG.LAYER_SPREAD;
    const dx = (circle.x - cx) * scale;
    const dy = (circle.y - cy) * scale;
    const rx = dx * cosA - dy * sinA + cx;
    const ry = dx * sinA + dy * cosA + cy;

    ctx.fillStyle = circle.color;
    ctx.beginPath();
    ctx.arc(rx, ry, circle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  rafId = requestAnimationFrame(draw);
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  maskCanvas = document.createElement("canvas");
  maskCtx = maskCanvas.getContext("2d");

  onResize = () => {
    resize();
  };

  window.addEventListener("resize", onResize);
  resize();
}

export function start() {
  startTime = performance.now();
  lastMaskUpdate = startTime - CONFIG.TICK_MS;
  lastTimeKey = getTimeKey(new Date());
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
  maskCanvas = null;
  maskCtx = null;
  maskData = null;
  noiseGrid = null;
  noiseCols = 0;
  noiseRows = 0;
  circles = [];
}
