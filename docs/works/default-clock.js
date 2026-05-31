import {
  DEFAULT_CLOCK_CONFIG,
  loadDefaultClockConfig,
  resetDefaultClockConfig,
  saveDefaultClockConfig,
} from "./default-clock.config.js";
import {
  CONTROL_HINTS,
  NUMBER_RANGES,
  PANEL_TREE,
  SELECT_OPTIONS,
} from "./default-clock/schema.js";


let cameraStage;
let cameraPlane;
let canvas;
let ctx;
let fxCanvas;
let fxCtx;
let fxScratchCanvas;
let fxScratchCtx;
let fxMapCanvas;
let fxMapCtx;
let rafId;
let onResize;
let onKeydown;
let controlsRoot;
let controlsStyle;
let width = 0;
let height = 0;

const CONFIG = loadDefaultClockConfig();
const TWO_PI = Math.PI * 2;

// v2 keys intentionally ignore the old tiny author panel width/group state.
const PANEL_WIDTH_KEY = "default-clock-panel-width-v2";
const PANEL_GROUPS_KEY = "default-clock-panel-groups-v2";
const PANEL_BOUNDS_KEY = "default-clock-panel-bounds-v2";

const COLOR_KEYS = new Set(Object.keys(DEFAULT_CLOCK_CONFIG).filter((key) => key.endsWith("_COLOR") || key.endsWith("_TINT") || key.startsWith("BG_")));
const BOOL_KEYS = new Set(Object.keys(DEFAULT_CLOCK_CONFIG).filter((key) => typeof DEFAULT_CLOCK_CONFIG[key] === "boolean"));
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function pad2(value) { return String(value).padStart(2, "0"); }
function hexToRgba(hex, alpha = 1) {
  const h = String(hex || "#ffffff").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}
function readJsonStore(key, fallback = {}) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function writeJsonStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function saveConfig() { saveDefaultClockConfig(CONFIG); }

function resize() {
  const rect = cameraPlane.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  for (const targetCanvas of [canvas, fxCanvas]) {
    if (!targetCanvas) continue;
    targetCanvas.width = Math.floor(width * dpr);
    targetCanvas.height = Math.floor(height * dpr);
    targetCanvas.style.width = `${width}px`;
    targetCanvas.style.height = `${height}px`;
  }
  for (const targetCanvas of [fxScratchCanvas, fxMapCanvas]) {
    if (!targetCanvas) continue;
    targetCanvas.width = Math.floor(width * dpr);
    targetCanvas.height = Math.floor(height * dpr);
  }
  fxScratchCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxMapCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (cameraStage) cameraStage.style.perspectiveOrigin = "50% 50%";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function hashNoise(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
function gradient1D(seed) { return hashNoise(seed) < 0.5 ? -1 : 1; }
function perlin1D(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = gradient1D(i + seed * 101.13);
  const g1 = gradient1D(i + 1 + seed * 101.13);
  const n0 = g0 * f;
  const n1 = g1 * (f - 1);
  return (n0 + (n1 - n0) * smoothstep(f)) * 2;
}
function fbm3(x, seed) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    sum += perlin1D(x * freq, seed + octave * 17.31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? clamp(sum / norm, -1, 1) : 0;
}
function toDeg(rad) { return rad * 180 / Math.PI; }

function applyCamera3D(timeMs) {
  if (!cameraStage || !cameraPlane) return;
  cameraStage.style.perspective = `${Math.max(1, CONFIG.CAMERA_FOV)}px`;

  if (!CONFIG.SHOW_CAMERA_3D) {
    cameraPlane.style.transform = "none";
    return;
  }

  const t = timeMs / 1000;
  const posT = t * CONFIG.CAMERA_POSITION_WIGGLE_SPEED;
  const rotT = t * CONFIG.CAMERA_ROTATION_WIGGLE_SPEED;
  const posWiggle = CONFIG.CAMERA_POSITION_WIGGLE_ENABLED;
  const rotWiggle = CONFIG.CAMERA_ROTATION_WIGGLE_ENABLED;
  const camX = CONFIG.CAMERA_BASE_X + (posWiggle ? fbm3(posT, 1) * CONFIG.CAMERA_POSITION_WIGGLE_X : 0);
  const camY = CONFIG.CAMERA_BASE_Y + (posWiggle ? fbm3(posT, 2) * CONFIG.CAMERA_POSITION_WIGGLE_Y : 0);
  const camZ = Math.max(60, CONFIG.CAMERA_DISTANCE + CONFIG.CAMERA_BASE_Z + (posWiggle ? fbm3(posT, 3) * CONFIG.CAMERA_POSITION_WIGGLE_Z : 0));

  // Look-at target is always the plane anchor at world 0,0,0.
  const yaw = Math.atan2(camX, camZ);
  const pitch = -Math.atan2(camY, Math.hypot(camX, camZ));

  // Rotation wiggle is applied after the look-at solve, as an extra handheld offset.
  const wiggleRotX = rotWiggle ? fbm3(rotT, 11) * CONFIG.CAMERA_ROTATION_WIGGLE_X : 0;
  const wiggleRotY = rotWiggle ? fbm3(rotT, 12) * CONFIG.CAMERA_ROTATION_WIGGLE_Y : 0;
  const wiggleRotZ = rotWiggle ? fbm3(rotT, 13) * CONFIG.CAMERA_ROTATION_WIGGLE_Z : 0;
  const distanceScale = clamp(CONFIG.CAMERA_DISTANCE / camZ, 0.25, 4);

  cameraPlane.style.transform = [
    `translate3d(${-camX}px, ${camY}px, 0px)`,
    `rotateX(${toDeg(pitch) + wiggleRotX}deg)`,
    `rotateY(${-toDeg(yaw) + wiggleRotY}deg)`,
    `rotateZ(${wiggleRotZ}deg)`,
    `scale(${distanceScale})`,
  ].join(" ");
}

function getClockTime(now) {
  const ms = now.getMilliseconds();
  const seconds = now.getSeconds() + ms / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  return { ms, seconds, minutes, hours };
}

function drawBackground(trailAlpha) {
  ctx.globalCompositeOperation = "source-over";
  if (!CONFIG.SHOW_BACKGROUND) {
    ctx.fillStyle = "#000000";
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, CONFIG.BG_TOP);
  gradient.addColorStop(1, CONFIG.BG_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 1 - trailAlpha;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

function drawFaceRing(radius) {
  if (!CONFIG.SHOW_FACE_RING) return;
  ctx.save();
  ctx.strokeStyle = hexToRgba(CONFIG.FACE_RING_COLOR, CONFIG.FACE_RING_ALPHA);
  ctx.lineWidth = Math.max(1, radius * CONFIG.RING_WIDTH_RATIO);
  ctx.shadowColor = hexToRgba(CONFIG.FACE_GLOW_COLOR, CONFIG.FACE_GLOW_ALPHA);
  ctx.shadowBlur = radius * CONFIG.FACE_GLOW_RADIUS_RATIO;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
}

function drawTicks(radius) {
  if (!CONFIG.SHOW_TICKS) return;
  const tickCount = Math.max(0, Math.round(CONFIG.TICK_COUNT));
  if (tickCount === 0) return;
  const majorEvery = Math.max(1, Math.round(CONFIG.MAJOR_TICK_EVERY));
  for (let i = 0; i < tickCount; i += 1) {
    const angle = (i / tickCount) * TWO_PI - Math.PI / 2;
    const major = i % majorEvery === 0;
    const innerRatio = major ? CONFIG.MAJOR_TICK_INNER_RATIO : CONFIG.TICK_INNER_RATIO;
    const widthRatio = major ? CONFIG.MAJOR_TICK_WIDTH_RATIO : CONFIG.TICK_WIDTH_RATIO;
    ctx.strokeStyle = major ? hexToRgba(CONFIG.MAJOR_TICK_COLOR, CONFIG.MAJOR_TICK_ALPHA) : hexToRgba(CONFIG.TICK_COLOR, CONFIG.TICK_ALPHA);
    ctx.lineWidth = Math.max(1, radius * widthRatio);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius * innerRatio, Math.sin(angle) * radius * innerRatio);
    ctx.lineTo(Math.cos(angle) * radius * CONFIG.TICK_OUTER_RATIO, Math.sin(angle) * radius * CONFIG.TICK_OUTER_RATIO);
    ctx.stroke();
  }
}

function drawDigitRing(radius, minSide) {
  if (!CONFIG.SHOW_DIGITS) return;
  const digitRadius = radius * clamp(CONFIG.DIGIT_RADIUS_RATIO, 0.2, 1.5);
  const digitSize = Math.max(10, minSide * CONFIG.DIGIT_SIZE_RATIO);
  ctx.save();
  ctx.font = `700 ${digitSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hexToRgba(CONFIG.DIGIT_COLOR, CONFIG.DIGIT_ALPHA);
  ctx.shadowColor = hexToRgba(CONFIG.DIGIT_GLOW_COLOR, CONFIG.DIGIT_GLOW_ALPHA);
  ctx.shadowBlur = radius * CONFIG.DIGIT_GLOW_RADIUS_RATIO;
  for (let hour = 1; hour <= 12; hour += 1) {
    const angle = (hour / 12) * TWO_PI - Math.PI / 2;
    ctx.save();
    ctx.translate(Math.cos(angle) * digitRadius, Math.sin(angle) * digitRadius);
    if (CONFIG.DIGIT_ROTATION_MODE === "radial") ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(String(hour), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawSecondProgress(radius, seconds) {
  if (!CONFIG.SHOW_SECONDS) return;
  const progress = seconds / 60;
  const angle = progress * TWO_PI - Math.PI / 2;
  const dotTrackRadius = radius * CONFIG.SECOND_TRACK_RADIUS_RATIO;
  ctx.save();
  ctx.shadowColor = hexToRgba(CONFIG.SECOND_GLOW_COLOR, CONFIG.SECOND_GLOW_ALPHA);
  ctx.shadowBlur = radius * CONFIG.SECOND_GLOW_RADIUS_RATIO;
  if (CONFIG.SHOW_SECOND_PROGRESS) {
    const headAlpha = clamp(CONFIG.SECOND_PROGRESS_ALPHA, 0, 1);
    const tailAlpha = clamp(CONFIG.SECOND_PROGRESS_TAIL_ALPHA, 0, 1);
    const headWidth = Math.max(1, radius * CONFIG.SECOND_PROGRESS_WIDTH_RATIO);
    const tailWidth = Math.max(0.25, headWidth * clamp(CONFIG.SECOND_PROGRESS_TAIL_WIDTH_RATIO, 0.02, 1));
    const arcLength = clamp(CONFIG.SECOND_PROGRESS_LENGTH_DEG, 1, 360) * Math.PI / 180;
    const segments = Math.max(4, Math.ceil(CONFIG.SECOND_PROGRESS_LENGTH_DEG / 7));
    ctx.lineCap = "round";
    for (let i = 0; i < segments; i += 1) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const local1 = smoothstep(t1);
      const a0 = angle - arcLength + arcLength * t0;
      const a1 = angle - arcLength + arcLength * t1;
      const alpha = tailAlpha + (headAlpha - tailAlpha) * local1;
      ctx.strokeStyle = hexToRgba(CONFIG.SECOND_PROGRESS_COLOR, alpha);
      ctx.lineWidth = tailWidth + (headWidth - tailWidth) * local1;
      ctx.beginPath();
      ctx.arc(0, 0, dotTrackRadius, a0, a1);
      ctx.stroke();
    }
  }
  if (CONFIG.SHOW_SECOND_DOT) {
    const dotRadius = Math.max(2, radius * CONFIG.SECOND_DOT_RADIUS_RATIO);
    ctx.fillStyle = hexToRgba(CONFIG.SECOND_DOT_COLOR, CONFIG.SECOND_DOT_ALPHA);
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dotTrackRadius, Math.sin(angle) * dotTrackRadius, dotRadius, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawHand(angle, lengthRatio, widthRatio, color, alpha, radius) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = Math.max(1, radius * widthRatio);
  ctx.lineCap = "round";
  ctx.shadowColor = hexToRgba(color, CONFIG.HAND_GLOW_ALPHA);
  ctx.shadowBlur = radius * CONFIG.HAND_GLOW_RADIUS_RATIO;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle) * radius * lengthRatio, Math.sin(angle) * radius * lengthRatio);
  ctx.stroke();
  ctx.restore();
}

function drawAnalogHands(radius, clock) {
  if (!CONFIG.SHOW_ANALOG_HANDS) return;
  if (CONFIG.SHOW_HOUR_HAND) drawHand((clock.hours / 12) * TWO_PI - Math.PI / 2, CONFIG.HOUR_HAND_LENGTH_RATIO, CONFIG.HOUR_HAND_WIDTH_RATIO, CONFIG.HOUR_HAND_COLOR, CONFIG.HOUR_HAND_ALPHA, radius);
  if (CONFIG.SHOW_MINUTE_HAND) drawHand((clock.minutes / 60) * TWO_PI - Math.PI / 2, CONFIG.MINUTE_HAND_LENGTH_RATIO, CONFIG.MINUTE_HAND_WIDTH_RATIO, CONFIG.MINUTE_HAND_COLOR, CONFIG.MINUTE_HAND_ALPHA, radius);
  if (CONFIG.SHOW_SECOND_HAND) drawHand((clock.seconds / 60) * TWO_PI - Math.PI / 2, CONFIG.SECOND_HAND_LENGTH_RATIO, CONFIG.SECOND_HAND_WIDTH_RATIO, CONFIG.SECOND_HAND_COLOR, CONFIG.SECOND_HAND_ALPHA, radius);
  if (CONFIG.SHOW_HAND_PIVOT) {
    ctx.save();
    ctx.fillStyle = hexToRgba(CONFIG.HAND_PIVOT_COLOR, CONFIG.HAND_PIVOT_ALPHA);
    ctx.shadowColor = hexToRgba(CONFIG.HAND_PIVOT_COLOR, CONFIG.HAND_GLOW_ALPHA);
    ctx.shadowBlur = radius * CONFIG.HAND_GLOW_RADIUS_RATIO;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, radius * CONFIG.HAND_PIVOT_RADIUS_RATIO), 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}

function drawCenterTime(now, clock, minSide) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (CONFIG.SHOW_CENTER_TIME) {
    ctx.fillStyle = hexToRgba(CONFIG.CENTER_TIME_COLOR, CONFIG.CENTER_TIME_ALPHA);
    ctx.shadowColor = hexToRgba(CONFIG.CENTER_TIME_GLOW_COLOR, CONFIG.CENTER_TIME_GLOW_ALPHA);
    ctx.shadowBlur = minSide * CONFIG.CENTER_TIME_GLOW_SIZE_RATIO;
    ctx.font = `700 ${Math.max(16, minSide * CONFIG.CENTER_TIME_SIZE_RATIO)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`, 0, minSide * CONFIG.CENTER_TIME_Y_RATIO);
  }
  if (CONFIG.SHOW_SECONDS && CONFIG.SHOW_CENTER_SECONDS) {
    ctx.font = `500 ${Math.max(9, minSide * CONFIG.CENTER_SECONDS_SIZE_RATIO)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = hexToRgba(CONFIG.CENTER_SECONDS_COLOR, CONFIG.CENTER_SECONDS_ALPHA);
    ctx.shadowBlur = 0;
    ctx.fillText(`${pad2(Math.floor(clock.seconds))}.${Math.floor(clock.ms / 100)}`, 0, minSide * CONFIG.CENTER_SECONDS_Y_RATIO);
  }
  ctx.restore();
}

function draw(now = new Date()) {
  const minSide = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = minSide * clamp(CONFIG.FACE_RADIUS_RATIO * CONFIG.GLOBAL_SCALE, 0.02, 0.7);
  const trailAlpha = clamp(CONFIG.TRAIL_ALPHA, 0, 1);
  const clock = getClockTime(now);
  drawBackground(trailAlpha);
  ctx.save();
  ctx.translate(cx, cy);
  drawFaceRing(radius);
  drawTicks(radius);
  drawDigitRing(radius, minSide * CONFIG.GLOBAL_SCALE);
  drawSecondProgress(radius, clock.seconds);
  drawAnalogHands(radius, clock);
  drawCenterTime(now, clock, minSide * CONFIG.GLOBAL_SCALE);
  ctx.restore();
}

function setComposite(context, mode) {
  context.globalCompositeOperation = mode || "source-over";
  if (context.globalCompositeOperation !== mode) context.globalCompositeOperation = "source-over";
}

function applyBaseGrade() {
  if (!cameraPlane) return;
  if (!CONFIG.SHOW_FX_STACK || !CONFIG.FX_BASICS_ENABLED) {
    cameraPlane.style.filter = "none";
    return;
  }
  const black = clamp(CONFIG.FX_LEVELS_BLACK, 0, 0.95);
  const white = Math.max(black + 0.05, CONFIG.FX_LEVELS_WHITE);
  const levelRange = Math.max(0.05, white - black);
  const levelBrightness = 1 / levelRange;
  const levelContrast = 1 / Math.sqrt(levelRange);
  const brightness = clamp(CONFIG.FX_EXPOSURE * CONFIG.FX_BRIGHTNESS * levelBrightness * (1 - black * 0.55), 0, 5);
  const contrast = clamp(CONFIG.FX_CONTRAST * levelContrast, 0, 5);
  cameraPlane.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${clamp(CONFIG.FX_SATURATION, 0, 5)})`;
}

const SIMPLEX_GRAD_3D = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
function fastFloor(value) { return value >= 0 ? Math.floor(value) : Math.floor(value) - 1; }
function simplexHash3(i, j, k) {
  return Math.floor(hashNoise(i * 157.31 + j * 311.17 + k * 911.13) * 256) % 12;
}
function simplex3D(xin, yin, zin) {
  const f3 = 1 / 3;
  const g3 = 1 / 6;
  const s = (xin + yin + zin) * f3;
  const i = fastFloor(xin + s);
  const j = fastFloor(yin + s);
  const k = fastFloor(zin + s);
  const t = (i + j + k) * g3;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const z0 = zin - (k - t);

  let i1, j1, k1;
  let i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }

  const x1 = x0 - i1 + g3;
  const y1 = y0 - j1 + g3;
  const z1 = z0 - k1 + g3;
  const x2 = x0 - i2 + 2 * g3;
  const y2 = y0 - j2 + 2 * g3;
  const z2 = z0 - k2 + 2 * g3;
  const x3 = x0 - 1 + 3 * g3;
  const y3 = y0 - 1 + 3 * g3;
  const z3 = z0 - 1 + 3 * g3;

  const corner = (x, y, z, gi) => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    const g = SIMPLEX_GRAD_3D[gi];
    t *= t;
    return t * t * (g[0] * x + g[1] * y + g[2] * z);
  };
  const n0 = corner(x0, y0, z0, simplexHash3(i, j, k));
  const n1 = corner(x1, y1, z1, simplexHash3(i + i1, j + j1, k + k1));
  const n2 = corner(x2, y2, z2, simplexHash3(i + i2, j + j2, k + k2));
  const n3 = corner(x3, y3, z3, simplexHash3(i + 1, j + 1, k + 1));
  return clamp(32 * (n0 + n1 + n2 + n3), -1, 1);
}
function fractalSimplex3D(x, y, z, octaves, lacunarity, gain) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += simplex3D(x * freq, y * freq, z * freq + octave * 17.31) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? clamp(sum / norm, -1, 1) : 0;
}
function simplex01(x, y, z, octaves, lacunarity, gain) {
  return clamp(fractalSimplex3D(x, y, z, octaves, lacunarity, gain) * 0.5 + 0.5, 0, 1);
}

function hash2(ix, iy, salt = 0) {
  return hashNoise(ix * 127.1 + iy * 311.7 + salt * 74.7);
}
function createDisplacementMapGenerator(workWidth, workHeight, timeMs, quality) {
  const mapType = CONFIG.FX_DISTORTION_MAP_TYPE || "simplex";
  const mapScale = Math.max(0.4, CONFIG.FX_DISTORTION_SCALE);
  const octaves = Math.max(1, Math.round(CONFIG.FX_DISTORTION_OCTAVES));
  const z = timeMs * clamp(CONFIG.FX_DISTORTION_SPEED, NUMBER_RANGES.FX_DISTORTION_SPEED.min, NUMBER_RANGES.FX_DISTORTION_SPEED.max);
  const lacunarity = CONFIG.FX_DISTORTION_LACUNARITY;
  const gain = CONFIG.FX_DISTORTION_GAIN;
  const safeW = Math.max(1, workWidth - 1);
  const safeH = Math.max(1, workHeight - 1);
  const cx = safeW / 2;
  const cy = safeH / 2;
  const maxR = Math.max(1, Math.hypot(cx, cy));

  if (mapType === "lens") {
    return (x, y) => {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = clamp(Math.hypot(dx, dy), 0, 1.6);
      const ripple = 0.84 + 0.16 * Math.sin((r * 9.5 / mapScale) + z * 28);
      const strength = clamp(r * r * ripple, 0, 1.8);
      return { x: dx * strength, y: dy * strength };
    };
  }

  if (mapType === "voronoi") {
    const cellSize = Math.max(8, 30 * mapScale * quality);
    return (x, y) => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      let bestDist = Infinity;
      let secondDist = Infinity;
      let bestX = 0;
      let bestY = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const cellX = gx + ox;
          const cellY = gy + oy;
          const px = (cellX + hash2(cellX, cellY, 1)) * cellSize;
          const py = (cellY + hash2(cellX, cellY, 2)) * cellSize;
          const dx = x - px;
          const dy = y - py;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            secondDist = bestDist;
            bestDist = dist;
            bestX = dx;
            bestY = dy;
          } else if (dist < secondDist) {
            secondDist = dist;
          }
        }
      }
      const edge = clamp((Math.sqrt(secondDist) - Math.sqrt(bestDist)) / cellSize, 0, 1);
      const invDist = 1 / Math.max(1, Math.hypot(bestX, bestY));
      const ridge = 1 - edge;
      return { x: bestX * invDist * ridge, y: bestY * invDist * ridge };
    };
  }

  return (x, y) => {
    const nx = x / (96 * mapScale * quality);
    const ny = y / (96 * mapScale * quality);
    return {
      x: fractalSimplex3D(nx, ny, z, octaves, lacunarity, gain),
      y: fractalSimplex3D(nx + 37.2, ny - 19.1, z + 11.7, octaves, lacunarity, gain),
    };
  };
}

function drawFractalNoise(timeMs) {
  if (!CONFIG.FX_NOISE_ENABLED || CONFIG.FX_NOISE_OPACITY <= 0) return;
  const step = Math.max(1, Math.round(CONFIG.FX_NOISE_SCALE));
  const octaves = Math.max(1, Math.round(CONFIG.FX_NOISE_OCTAVES));
  const speed = clamp(CONFIG.FX_NOISE_SPEED, NUMBER_RANGES.FX_NOISE_SPEED.min, NUMBER_RANGES.FX_NOISE_SPEED.max);
  const z = timeMs * speed;
  const noiseMin = clamp(Math.min(CONFIG.FX_NOISE_MIN, CONFIG.FX_NOISE_MAX), 0, 1);
  const noiseMax = clamp(Math.max(CONFIG.FX_NOISE_MIN, CONFIG.FX_NOISE_MAX), 0, 1);
  const remapNoise = (value) => noiseMin + (noiseMax - noiseMin) * clamp(value, 0, 1);
  fxCtx.save();
  fxCtx.globalAlpha = clamp(CONFIG.FX_NOISE_OPACITY, 0, 1);
  setComposite(fxCtx, CONFIG.FX_NOISE_BLEND_MODE);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const n = simplex01(x / 96, y / 96, z, octaves, CONFIG.FX_NOISE_LACUNARITY, CONFIG.FX_NOISE_GAIN);
      const v = remapNoise((n - 0.5) * CONFIG.FX_NOISE_CONTRAST + 0.5);
      if (CONFIG.FX_NOISE_MONOCHROME) {
        const c = Math.round(v * 255);
        fxCtx.fillStyle = `rgb(${c},${c},${c})`;
      } else {
        const r = Math.round(v * 255);
        const g = Math.round(remapNoise((simplex01(x / 110, y / 110, z + 7.7, octaves, CONFIG.FX_NOISE_LACUNARITY, CONFIG.FX_NOISE_GAIN) - 0.5) * CONFIG.FX_NOISE_CONTRAST + 0.5) * 255);
        const b = Math.round(remapNoise((simplex01(x / 120, y / 120, z + 13.3, octaves, CONFIG.FX_NOISE_LACUNARITY, CONFIG.FX_NOISE_GAIN) - 0.5) * CONFIG.FX_NOISE_CONTRAST + 0.5) * 255);
        fxCtx.fillStyle = `rgb(${r},${g},${b})`;
      }
      fxCtx.fillRect(x, y, step, step);
    }
  }
  fxCtx.restore();
}

function drawDistortion(timeMs) {
  if (!CONFIG.FX_DISTORTION_ENABLED || CONFIG.FX_DISTORTION_AMPLITUDE <= 0 || !fxScratchCtx || !fxMapCtx) return;
  const sourceWidth = fxCanvas.width;
  const sourceHeight = fxCanvas.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const quality = clamp(CONFIG.FX_DISTORTION_QUALITY ?? 0.35, 0.15, 1);
  const workWidth = Math.max(24, Math.round(sourceWidth * quality));
  const workHeight = Math.max(24, Math.round(sourceHeight * quality));
  if (fxMapCanvas.width !== workWidth || fxMapCanvas.height !== workHeight) {
    fxMapCanvas.width = workWidth;
    fxMapCanvas.height = workHeight;
  }

  fxMapCtx.save();
  fxMapCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxMapCtx.clearRect(0, 0, workWidth, workHeight);
  fxMapCtx.imageSmoothingEnabled = true;
  fxMapCtx.drawImage(fxCanvas, 0, 0, workWidth, workHeight);
  fxMapCtx.restore();

  const source = fxMapCtx.getImageData(0, 0, workWidth, workHeight);
  const output = fxMapCtx.createImageData(workWidth, workHeight);
  const src = source.data;
  const dst = output.data;
  const amp = CONFIG.FX_DISTORTION_AMPLITUDE * quality;
  const sampleDisplacementMap = createDisplacementMapGenerator(workWidth, workHeight, timeMs, quality);
  for (let y = 0; y < workHeight; y += 1) {
    for (let x = 0; x < workWidth; x += 1) {
      const vector = sampleDisplacementMap(x, y);
      const sx = clamp(Math.round(x + vector.x * amp), 0, workWidth - 1);
      const sy = clamp(Math.round(y + vector.y * amp), 0, workHeight - 1);
      const si = (sy * workWidth + sx) * 4;
      const di = (y * workWidth + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  fxMapCtx.putImageData(output, 0, 0);
  fxCtx.save();
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCtx.globalAlpha = 1;
  fxCtx.globalCompositeOperation = "source-over";
  fxCtx.filter = "none";
  fxCtx.imageSmoothingEnabled = true;
  fxCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  fxCtx.drawImage(fxMapCanvas, 0, 0, sourceWidth, sourceHeight);
  fxCtx.restore();
  fxCtx.setTransform(ctx.getTransform());
}

function drawRadialBlurFrom(sourceCanvas, maxBlur, opacity) {
  if (maxBlur <= 0 || opacity <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(width, height) / 2;
  const bands = 5;
  fxCtx.save();
  fxCtx.globalCompositeOperation = "source-over";
  fxCtx.globalAlpha = opacity;
  for (let band = 1; band <= bands; band += 1) {
    const outer = maxR * (band / bands);
    const inner = maxR * ((band - 1) / bands);
    const blur = maxBlur * (band / bands) ** 1.7;
    fxCtx.save();
    fxCtx.beginPath();
    fxCtx.arc(cx, cy, outer, 0, TWO_PI);
    fxCtx.arc(cx, cy, inner, 0, TWO_PI, true);
    fxCtx.clip("evenodd");
    fxCtx.filter = `blur(${blur}px)`;
    fxCtx.drawImage(sourceCanvas, 0, 0, width, height);
    fxCtx.restore();
  }
  fxCtx.restore();
  fxCtx.filter = "none";
}

function drawTintedScaledChannel(sourceCanvas, scale, dx, dy, filter) {
  const drawW = width * scale;
  const drawH = height * scale;
  const drawX = (width - drawW) / 2 + dx;
  const drawY = (height - drawH) / 2 + dy;
  fxCtx.filter = filter;
  fxCtx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
}

function drawAberration(timeMs) {
  if (!CONFIG.FX_ABERRATION_ENABLED || CONFIG.FX_ABERRATION_OPACITY <= 0 || !fxScratchCtx) return;
  const amount = CONFIG.FX_ABERRATION_OFFSET;
  const maxR = Math.max(1, Math.hypot(width, height) / 2);
  const angle = (CONFIG.FX_ABERRATION_ANGLE + (CONFIG.FX_ABERRATION_ROTATE_WITH_TIME ? timeMs * 0.001 * CONFIG.FX_ABERRATION_SPEED * 360 : 0)) * Math.PI / 180;
  const driftX = Math.cos(angle) * amount * 0.12;
  const driftY = Math.sin(angle) * amount * 0.12;
  const redScale = 1 + amount / maxR;
  const blueScale = Math.max(0.985, 1 - amount * 0.55 / maxR);

  fxScratchCtx.save();
  fxScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxScratchCtx.clearRect(0, 0, fxScratchCanvas.width, fxScratchCanvas.height);
  fxScratchCtx.drawImage(fxCanvas, 0, 0);
  fxScratchCtx.restore();

  drawRadialBlurFrom(fxScratchCanvas, CONFIG.FX_ABERRATION_EDGE_BLUR, clamp(CONFIG.FX_ABERRATION_OPACITY, 0, 1) * 0.65);

  fxCtx.save();
  fxCtx.globalAlpha = clamp(CONFIG.FX_ABERRATION_OPACITY, 0, 1);
  setComposite(fxCtx, CONFIG.FX_ABERRATION_BLEND_MODE);
  drawTintedScaledChannel(fxScratchCanvas, redScale, driftX, driftY, "sepia(1) saturate(9) hue-rotate(-48deg)");
  drawTintedScaledChannel(fxScratchCanvas, blueScale, -driftX * 0.35, -driftY * 0.35, "sepia(1) saturate(9) hue-rotate(155deg)");
  fxCtx.restore();
  fxCtx.filter = "none";
}

function makeHalationMask() {
  if (!fxMapCtx) return;
  const maskWidth = fxCanvas?.width || canvas.width;
  const maskHeight = fxCanvas?.height || canvas.height;
  if (fxMapCanvas.width !== maskWidth || fxMapCanvas.height !== maskHeight) {
    fxMapCanvas.width = maskWidth;
    fxMapCanvas.height = maskHeight;
  }
  fxMapCtx.save();
  fxMapCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxMapCtx.clearRect(0, 0, maskWidth, maskHeight);
  fxMapCtx.drawImage(canvas, 0, 0, maskWidth, maskHeight);
  const image = fxMapCtx.getImageData(0, 0, maskWidth, maskHeight);
  const data = image.data;
  const threshold = clamp(CONFIG.FX_HALATION_THRESHOLD / 3, 0, 0.98);
  const softness = 0.22;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    const mask = clamp((luma - threshold) / softness, 0, 1);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.round(mask * data[i + 3]);
  }
  fxMapCtx.putImageData(image, 0, 0);
  fxMapCtx.restore();
}

function drawHalation() {
  if (!CONFIG.FX_HALATION_ENABLED || CONFIG.FX_HALATION_OPACITY <= 0 || !fxScratchCtx || !fxMapCtx) return;
  makeHalationMask();
  fxScratchCtx.save();
  fxScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxScratchCtx.clearRect(0, 0, fxScratchCanvas.width, fxScratchCanvas.height);
  fxScratchCtx.filter = `blur(${CONFIG.FX_HALATION_RADIUS}px)`;
  fxScratchCtx.drawImage(fxMapCanvas, 0, 0);
  fxScratchCtx.filter = "none";
  fxScratchCtx.globalCompositeOperation = "source-atop";
  fxScratchCtx.fillStyle = CONFIG.FX_HALATION_TINT;
  fxScratchCtx.fillRect(0, 0, fxScratchCanvas.width, fxScratchCanvas.height);
  fxScratchCtx.restore();

  fxCtx.save();
  fxCtx.globalAlpha = clamp(CONFIG.FX_HALATION_OPACITY, 0, 1);
  setComposite(fxCtx, CONFIG.FX_HALATION_BLEND_MODE);
  fxCtx.drawImage(fxScratchCanvas, 0, 0, width, height);
  fxCtx.restore();
}

function drawLensEffects() {
  if (!CONFIG.FX_LENS_ENABLED) return;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(width, height) / 2;
  if (CONFIG.FX_LENS_GLOW_OPACITY > 0) {
    const glow = fxCtx.createRadialGradient(cx, cy, 0, cx, cy, maxR * CONFIG.FX_LENS_GLOW_RADIUS);
    glow.addColorStop(0, hexToRgba(CONFIG.FX_LENS_GLOW_COLOR, CONFIG.FX_LENS_GLOW_OPACITY));
    glow.addColorStop(1, hexToRgba(CONFIG.FX_LENS_GLOW_COLOR, 0));
    fxCtx.save();
    fxCtx.globalCompositeOperation = "screen";
    fxCtx.fillStyle = glow;
    fxCtx.fillRect(0, 0, width, height);
    fxCtx.restore();
  }
  if (CONFIG.FX_VIGNETTE_OPACITY > 0) {
    const inner = maxR * CONFIG.FX_VIGNETTE_RADIUS;
    const outer = inner + maxR * CONFIG.FX_VIGNETTE_SOFTNESS;
    const vignette = fxCtx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${clamp(CONFIG.FX_VIGNETTE_OPACITY, 0, 1)})`);
    fxCtx.save();
    setComposite(fxCtx, CONFIG.FX_LENS_BLEND_MODE);
    fxCtx.fillStyle = vignette;
    fxCtx.fillRect(0, 0, width, height);
    fxCtx.restore();
  }
}

function renderFxStack(timeMs) {
  applyBaseGrade();
  if (!fxCtx || !fxCanvas) return;
  fxCtx.save();
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxCtx.restore();
  fxCtx.setTransform(ctx.getTransform());
  if (!CONFIG.SHOW_FX_STACK) {
    fxCanvas.style.display = "none";
    canvas.style.opacity = "1";
    return;
  }
  fxCanvas.style.display = "block";
  canvas.style.opacity = "0";
  fxCtx.save();
  fxCtx.globalAlpha = 1;
  fxCtx.globalCompositeOperation = "source-over";
  fxCtx.filter = "none";
  fxCtx.drawImage(canvas, 0, 0, width, height);
  fxCtx.restore();
  drawHalation();
  drawAberration(timeMs);
  drawDistortion(timeMs);
  drawFractalNoise(timeMs);
  drawLensEffects();
  fxCtx.globalAlpha = 1;
  fxCtx.globalCompositeOperation = "source-over";
  fxCtx.filter = "none";
}

function createPanelStyle() {
  controlsStyle = document.createElement("style");
  controlsStyle.textContent = `
    #dc-panel {
      --dc-canvas: #070b12; --dc-canvas-soft: #101827; --dc-hairline: #243247;
      --dc-ink: #edf6ff; --dc-body: #c7d7eb; --dc-mute: #8fa4bf;
      --dc-primary: #eaf4ff; --dc-on-primary: #07101b;
    }
    #dc-panel {
      position: fixed; top: 9px; right: 9px; z-index: 9999;
      background: var(--dc-canvas); border: 1px solid var(--dc-hairline); border-radius: 6px;
      color: var(--dc-body); font-family: Inter, "Inter Fallback", system-ui, -apple-system, sans-serif;
      font-size: 12px; line-height: 1.2; width: 264px; max-height: 78vh; overflow-y: auto;
      padding: 5px; box-shadow: 0 12px 42px rgba(0,0,0,.32);
    }
    #dc-panel > summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--dc-ink); user-select: none; margin-bottom: 4px; padding: 2px; }
    #dc-panel .meta, #dc-panel .panel-width-row { display:flex; align-items:center; justify-content:space-between; gap:6px; margin:2px 2px 5px; color:var(--dc-mute); font-size:11px; font-family:"DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #dc-panel .group { border:1px solid var(--dc-hairline); border-radius:6px; margin:4px 0; background:var(--dc-canvas-soft); padding:2px 4px 4px; }
    #dc-panel .group.nested { margin-left:8px; }
    #dc-panel .group > summary { cursor:pointer; user-select:none; color:var(--dc-ink); font-size:12px; font-weight:600; text-transform:uppercase; padding:3px 0; }
    #dc-panel .group.nested > summary { font-size:11px; color:var(--dc-body); }
    #dc-panel label { display:flex; justify-content:space-between; align-items:center; gap:4px; margin:3px 0; }
    #dc-panel .name { flex:1; color:var(--dc-body); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.15; }
    #dc-panel input[type=range] { flex:0 0 84px; max-width:84px; accent-color:var(--dc-primary); height:15px; appearance:none; background:transparent; }
    #dc-panel input[type=range]::-webkit-slider-runnable-track { height:3px; background:var(--dc-hairline); border-radius:999px; }
    #dc-panel input[type=range]::-webkit-slider-thumb { appearance:none; margin-top:-5px; width:13px; height:13px; border-radius:999px; border:1px solid var(--dc-primary); background:var(--dc-primary); }
    #dc-panel input[type=range]::-moz-range-track { height:3px; background:var(--dc-hairline); border:0; border-radius:999px; }
    #dc-panel input[type=range]::-moz-range-thumb { width:13px; height:13px; border-radius:999px; border:1px solid var(--dc-primary); background:var(--dc-primary); }
    #dc-panel input[type=checkbox] { accent-color:var(--dc-primary); width:14px; height:14px; }
    #dc-panel input[type=color] { width:30px; min-width:30px; height:21px; padding:0; border:1px solid var(--dc-hairline); border-radius:4px; background:var(--dc-canvas-soft); }
    #dc-panel .bound-input, #dc-panel .panel-width-input, #dc-panel .color-text, #dc-panel select { color:var(--dc-ink); background:var(--dc-canvas-soft); border:1px solid var(--dc-hairline); border-radius:4px; font-family:"DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px; line-height:1.2; padding:2px 3px; box-sizing:border-box; }
    #dc-panel .bound-input { width:54px; min-width:54px; text-align:right; color:var(--dc-mute); }
    #dc-panel .panel-width-input { width:78px; min-width:78px; text-align:right; }
    #dc-panel .color-text { width:81px; min-width:81px; }
    #dc-panel .live-val { min-width:54px; text-align:right; color:var(--dc-mute); font-family:"DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px; line-height:1.2; }
    #dc-panel select { width:114px; min-width:114px; }
    #dc-panel .actions { display:flex; gap:4px; margin-top:5px; flex-wrap:wrap; }
    #dc-panel button { flex:1; min-width:0; padding:4px 5px; min-height:27px; background:var(--dc-canvas-soft); border:1px solid var(--dc-hairline); border-radius:4px; color:var(--dc-ink); font-family:Inter, "Inter Fallback", system-ui, -apple-system, sans-serif; font-size:12px; font-weight:600; line-height:1.1; cursor:pointer; }
    #dc-panel button:hover { background:var(--dc-primary); color:var(--dc-on-primary); border-color:var(--dc-primary); }
  `;
  document.head.appendChild(controlsStyle);
}

function formatControlValue(key, value) {
  const range = NUMBER_RANGES[key];
  if (range?.integer) return String(Math.round(value));
  if (Math.abs(value) < 0.01) return Number(value).toFixed(4);
  if (Math.abs(value) < 1) return Number(value).toFixed(3);
  return Number(value).toFixed(2);
}
function labelFor(key) { return key.toLowerCase().replace(/_/g, " "); }

function createNumberControl(key, boundsStore, saveBoundsStore) {
  const range = NUMBER_RANGES[key];
  const label = document.createElement("label");
  const nameSpan = Object.assign(document.createElement("span"), { className: "name", textContent: labelFor(key), title: CONTROL_HINTS[key] || "" });
  const minInput = Object.assign(document.createElement("input"), { type: "text", className: "bound-input" });
  const maxInput = Object.assign(document.createElement("input"), { type: "text", className: "bound-input" });
  const input = Object.assign(document.createElement("input"), { type: "range", min: "0", max: "1", step: "0.001" });
  const liveVal = Object.assign(document.createElement("span"), { className: "live-val" });
  let minBound = range.min;
  let maxBound = range.max;
  const savedBounds = boundsStore[key];
  if (savedBounds && Number.isFinite(savedBounds.min) && Number.isFinite(savedBounds.max) && savedBounds.max > savedBounds.min) { minBound = savedBounds.min; maxBound = savedBounds.max; }
  const toT = (value) => clamp((value - minBound) / Math.max(0.0000001, maxBound - minBound), 0, 1);
  const fromT = (t) => minBound + (maxBound - minBound) * t;
  const refresh = () => { minInput.value = formatControlValue(key, minBound); maxInput.value = formatControlValue(key, maxBound); liveVal.textContent = formatControlValue(key, CONFIG[key]); input.value = String(toT(CONFIG[key])); };
  const setFromNumeric = (raw) => { if (!Number.isFinite(raw)) return; CONFIG[key] = range.integer ? Math.round(raw) : raw; liveVal.textContent = formatControlValue(key, CONFIG[key]); input.value = String(toT(CONFIG[key])); saveConfig(); };
  input.addEventListener("input", () => { const t = clamp(Number.parseFloat(input.value), 0, 1); setFromNumeric(fromT(Number.isFinite(t) ? t : 0)); });
  const applyBounds = () => {
    const parsedMin = Number.parseFloat(minInput.value.replace(",", "."));
    const parsedMax = Number.parseFloat(maxInput.value.replace(",", "."));
    if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMax <= parsedMin) { refresh(); return; }
    minBound = parsedMin; maxBound = parsedMax; boundsStore[key] = { min: minBound, max: maxBound }; saveBoundsStore(); refresh();
  };
  for (const el of [minInput, maxInput]) {
    el.addEventListener("keydown", (event) => { if (event.key === "Enter") { applyBounds(); el.blur(); } });
    el.addEventListener("blur", applyBounds);
  }
  refresh();
  label.append(nameSpan, minInput, input, maxInput, liveVal);
  return label;
}

function createColorControl(key) {
  const label = document.createElement("label");
  const nameSpan = Object.assign(document.createElement("span"), { className: "name", textContent: labelFor(key), title: CONTROL_HINTS[key] || "" });
  const colorInput = Object.assign(document.createElement("input"), { type: "color", value: CONFIG[key] });
  const textInput = Object.assign(document.createElement("input"), { type: "text", className: "color-text", value: CONFIG[key] });
  const applyColor = (value) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) { textInput.value = CONFIG[key]; colorInput.value = CONFIG[key]; return; }
    CONFIG[key] = value; textInput.value = value; colorInput.value = value; saveConfig();
  };
  colorInput.addEventListener("input", () => applyColor(colorInput.value));
  textInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { applyColor(textInput.value.trim()); textInput.blur(); } });
  textInput.addEventListener("blur", () => applyColor(textInput.value.trim()));
  label.append(nameSpan, colorInput, textInput);
  return label;
}

function createBoolControl(key) {
  const label = document.createElement("label");
  const nameSpan = Object.assign(document.createElement("span"), { className: "name", textContent: labelFor(key), title: CONTROL_HINTS[key] || "" });
  const input = Object.assign(document.createElement("input"), { type: "checkbox", checked: !!CONFIG[key] });
  input.addEventListener("change", () => { CONFIG[key] = input.checked; saveConfig(); });
  label.append(nameSpan, input);
  return label;
}

function createSelectControl(key) {
  const label = document.createElement("label");
  const nameSpan = Object.assign(document.createElement("span"), { className: "name", textContent: labelFor(key), title: CONTROL_HINTS[key] || "" });
  const select = document.createElement("select");
  for (const option of SELECT_OPTIONS[key] || []) select.appendChild(Object.assign(document.createElement("option"), { value: option, textContent: option, selected: CONFIG[key] === option }));
  select.addEventListener("change", () => { CONFIG[key] = select.value; saveConfig(); });
  label.append(nameSpan, select);
  return label;
}

function shouldShowPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("ui") === "0") return false;
  return true;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.closest("#dc-panel") || target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button";
}

function togglePanel() {
  if (controlsRoot) {
    destroyPanel();
    return;
  }

  buildPanel();
}

function handleGlobalKeydown(event) {
  if (event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  togglePanel();
}

function appendControlsForGroup(group, groupDef, boundsStore, saveBoundsStore) {
  for (const key of groupDef.boolKeys || []) if (BOOL_KEYS.has(key)) group.appendChild(createBoolControl(key));
  for (const key of groupDef.colorKeys || []) if (COLOR_KEYS.has(key)) group.appendChild(createColorControl(key));
  for (const key of groupDef.keys || []) if (typeof CONFIG[key] === "number" && NUMBER_RANGES[key]) group.appendChild(createNumberControl(key, boundsStore, saveBoundsStore));
  for (const key of groupDef.selectKeys || []) if (SELECT_OPTIONS[key]) group.appendChild(createSelectControl(key));
}

function createGroup(groupDef, depth, groupOpenStore, saveGroupOpenStore, boundsStore, saveBoundsStore, defaultOpenGroups) {
  const group = document.createElement("details");
  group.className = depth > 0 ? "group nested" : "group";
  const storeKey = `${depth}:${groupDef.title}`;
  const savedOpen = groupOpenStore[storeKey];
  group.open = typeof savedOpen === "boolean" ? savedOpen : defaultOpenGroups.has(groupDef.title);
  group.innerHTML = `<summary>${groupDef.title}</summary>`;
  group.addEventListener("toggle", () => { groupOpenStore[storeKey] = group.open; saveGroupOpenStore(); });
  appendControlsForGroup(group, groupDef, boundsStore, saveBoundsStore);
  for (const child of groupDef.children || []) group.appendChild(createGroup(child, depth + 1, groupOpenStore, saveGroupOpenStore, boundsStore, saveBoundsStore, defaultOpenGroups));
  return group;
}

function buildPanel() {
  if (!shouldShowPanel()) return;
  createPanelStyle();
  controlsRoot = document.createElement("details");
  controlsRoot.id = "dc-panel";
  controlsRoot.open = true;
  controlsRoot.innerHTML = `<summary>default-clock</summary>`;
  controlsRoot.appendChild(Object.assign(document.createElement("div"), { className: "meta", textContent: "Space toggles panel · layered raster clock object" }));

  const savedWidthRaw = localStorage.getItem(PANEL_WIDTH_KEY);
  const savedWidth = savedWidthRaw ? Number(savedWidthRaw) : 0;
  let currentPanelWidth = Number.isFinite(savedWidth) && savedWidth >= 200 && savedWidth <= 780 ? savedWidth : 264;
  controlsRoot.style.width = `${currentPanelWidth}px`;
  const widthRow = Object.assign(document.createElement("div"), { className: "panel-width-row" });
  const widthLabel = Object.assign(document.createElement("span"), { textContent: "panel width" });
  const widthInput = Object.assign(document.createElement("input"), { type: "text", className: "panel-width-input", value: String(Math.round(currentPanelWidth)) });
  const applyPanelWidth = () => {
    const raw = Number.parseFloat(widthInput.value.replace(",", "."));
    if (!Number.isFinite(raw)) { widthInput.value = String(Math.round(currentPanelWidth)); return; }
    currentPanelWidth = Math.min(780, Math.max(200, Math.round(raw)));
    controlsRoot.style.width = `${currentPanelWidth}px`;
    widthInput.value = String(currentPanelWidth);
    try { localStorage.setItem(PANEL_WIDTH_KEY, String(currentPanelWidth)); } catch {}
  };
  widthInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { applyPanelWidth(); widthInput.blur(); } });
  widthInput.addEventListener("blur", applyPanelWidth);
  widthRow.append(widthLabel, widthInput);
  controlsRoot.appendChild(widthRow);

  const boundsStore = readJsonStore(PANEL_BOUNDS_KEY, {});
  const saveBoundsStore = () => writeJsonStore(PANEL_BOUNDS_KEY, boundsStore);
  const groupOpenStore = readJsonStore(PANEL_GROUPS_KEY, {});
  const saveGroupOpenStore = () => writeJsonStore(PANEL_GROUPS_KEY, groupOpenStore);
  const defaultOpenGroups = new Set(["scene object", "3D camera object", "post FX stack", "base grade / levels", "fractal noise", "distortion / displacement", "clock body object", "dial object", "time readout object", "motion object", "analog hands object"]);
  for (const groupDef of PANEL_TREE) controlsRoot.appendChild(createGroup(groupDef, 0, groupOpenStore, saveGroupOpenStore, boundsStore, saveBoundsStore, defaultOpenGroups));

  const actions = Object.assign(document.createElement("div"), { className: "actions" });
  const btnReset = Object.assign(document.createElement("button"), { textContent: "Reset Defaults" });
  btnReset.addEventListener("click", () => { Object.assign(CONFIG, resetDefaultClockConfig()); destroyPanel(); buildPanel(); });
  const btnCopy = Object.assign(document.createElement("button"), { textContent: "Copy JSON" });
  btnCopy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2)); } catch {} });
  actions.append(btnReset, btnCopy);
  controlsRoot.appendChild(actions);
  document.body.appendChild(controlsRoot);
}

function destroyPanel() {
  if (controlsRoot?.parentElement) controlsRoot.parentElement.removeChild(controlsRoot);
  if (controlsStyle?.parentElement) controlsStyle.parentElement.removeChild(controlsStyle);
  controlsRoot = null;
  controlsStyle = null;
}

function frame(timeMs = performance.now()) {
  applyCamera3D(timeMs);
  draw(new Date());
  renderFxStack(timeMs);
  rafId = requestAnimationFrame(frame);
}

export function init({ container }) {
  cameraStage = document.createElement("div");
  cameraStage.className = "dc-camera-stage";
  Object.assign(cameraStage.style, {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    overflow: "visible",
    perspectiveOrigin: "50% 50%",
    transformStyle: "preserve-3d",
  });

  cameraPlane = document.createElement("div");
  cameraPlane.className = "dc-camera-plane";
  Object.assign(cameraPlane.style, {
    position: "relative",
    width: "100%",
    height: "100%",
    transformOrigin: "50% 50%",
    transformStyle: "preserve-3d",
    willChange: "transform, filter",
    backfaceVisibility: "hidden",
  });

  canvas = document.createElement("canvas");
  canvas.className = "art-canvas dc-base-canvas";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    zIndex: "0",
    pointerEvents: "none",
  });
  fxCanvas = document.createElement("canvas");
  fxCanvas.className = "art-canvas dc-fx-canvas";
  fxCanvas.dataset.captureTarget = "true";
  Object.assign(fxCanvas.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    pointerEvents: "none",
  });
  cameraPlane.append(canvas, fxCanvas);
  cameraStage.appendChild(cameraPlane);
  container.appendChild(cameraStage);
  ctx = canvas.getContext("2d");
  fxCtx = fxCanvas.getContext("2d");
  fxScratchCanvas = document.createElement("canvas");
  fxScratchCtx = fxScratchCanvas.getContext("2d");
  fxMapCanvas = document.createElement("canvas");
  fxMapCtx = fxMapCanvas.getContext("2d");
  onResize = resize;
  onKeydown = handleGlobalKeydown;
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeydown);
  resize();
  buildPanel();
}

export function start() { if (rafId) cancelAnimationFrame(rafId); frame(); }

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (onKeydown) window.removeEventListener("keydown", onKeydown);
  destroyPanel();
  rafId = null;
  onResize = null;
  onKeydown = null;
  canvas?.remove();
  fxCanvas?.remove();
  cameraPlane?.remove();
  cameraStage?.remove();
  canvas = null;
  fxCanvas = null;
  fxScratchCanvas = null;
  fxMapCanvas = null;
  cameraPlane = null;
  cameraStage = null;
  ctx = null;
  fxCtx = null;
  fxScratchCtx = null;
  fxMapCtx = null;
}
