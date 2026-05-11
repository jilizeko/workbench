let canvas;
let ctx;
let rafId;
let onResize;

let width = 0;
let height = 0;
let startTime = 0;

let bands = [];
let intersections = [];

const CONFIG = {
  BG_TOP: "#05070b",
  BG_BOTTOM: "#110d16",
  BAND_COUNT: 6,
  WEAVE_STEPS: 56,
  CROSS_LINKS: 12,
  BODY_WIDTH_RATIO: 0.035,
  HIGHLIGHT_WIDTH_RATIO: 0.012,
  GLOW_WIDTH_RATIO: 0.06,
  TRAIL_ALPHA: 0.08,
  ORBIT_ALPHA: 0.11,
  SPARK_ALPHA: 0.22,
  SPARK_RATE: 0.08,
  CORE_RADIUS_RATIO: 0.175,
  KNOT_RADIUS_RATIO: 0.108,
  WAVE_SCALE_RATIO: 0.066,
  WAVE_DRIFT_RATIO: 0.022,
  LANE_PULSE_RATIO: 0.01,
  SHADOW_BLUR_RATIO: 0.013,
  HUE_SPAN: 186,
  HUE_SHIFT_PER_SECOND: 8,
  FOCUS_PULL_RATIO: 0.12,
  EDGE_FADE_RATIO: 0.14,
  SHEAR_RATIO: 0.095,
  SWAY_RATIO: 0.018,
  KNOT_TILT_RATIO: 0.34,
  CORE_PULSE_RATIO: 0.11,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
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

function mixHex(a, b, t, alpha = 1) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const r = Math.round(lerp(c1.r, c2.r, t));
  const g = Math.round(lerp(c1.g, c2.g, t));
  const bVal = Math.round(lerp(c1.b, c2.b, t));
  return `rgba(${r}, ${g}, ${bVal}, ${alpha})`;
}

function hash01(a, b, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function buildBands() {
  bands = [];
  intersections = [];

  const usableWidth = width * 0.9;
  const centerY = height * 0.5;
  const startX = (width - usableWidth) * 0.5;
  const bandGap = height * 0.48 / Math.max(1, CONFIG.BAND_COUNT - 1);

  for (let i = 0; i < CONFIG.BAND_COUNT; i += 1) {
    const t = CONFIG.BAND_COUNT === 1 ? 0.5 : i / (CONFIG.BAND_COUNT - 1);
    const offset = (i - (CONFIG.BAND_COUNT - 1) * 0.5) * bandGap;
    const depth = clamp(1 - Math.abs(t - 0.5) * 1.9, 0.18, 1);
    const sideBias = (t - 0.5) * 2;

    bands.push({
      index: i,
      t,
      baseY: centerY + offset,
      baseX: startX,
      width: usableWidth,
      depth,
      emphasis: clamp(0.45 + depth * 0.65, 0.45, 1.06),
      sway: sideBias * 0.6,
      phase: hash01(i + 0.13, t + 0.31),
    });
  }

  for (let i = 0; i < CONFIG.CROSS_LINKS; i += 1) {
    const pairSeed = hash01(i + 0.4, 0.19);
    const leftBand = clamp(Math.floor(lerp(1, CONFIG.BAND_COUNT - 2, pairSeed)), 0, CONFIG.BAND_COUNT - 2);
    const pairFocus = 1 - Math.abs(((leftBand + 0.5) / (CONFIG.BAND_COUNT - 1)) - 0.5) * 2;
    const xT = clamp(0.15 + (i + 1) / (CONFIG.CROSS_LINKS + 2) * 0.7 + (hash01(i, pairSeed) - 0.5) * 0.028, 0.08, 0.92);
    intersections.push({
      leftBand,
      rightBand: leftBand + 1,
      xT: clamp(xT + (hash01(i, xT) - 0.5) * 0.04, 0.04, 0.96),
      twist: hash01(i + 0.7, xT + 0.2),
      focus: clamp(pairFocus, 0.05, 1),
    });
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

  buildBands();

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, CONFIG.BG_TOP);
  bg.addColorStop(1, CONFIG.BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawBackdrop() {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, CONFIG.BG_TOP);
  bg.addColorStop(1, CONFIG.BG_BOTTOM);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(8, 9, 14, ${CONFIG.TRAIL_ALPHA})`;
  ctx.fillRect(0, 0, width, height);

  const orb = ctx.createRadialGradient(
    width * 0.5,
    height * 0.52,
    Math.min(width, height) * CONFIG.CORE_RADIUS_RATIO * 0.25,
    width * 0.5,
    height * 0.52,
    Math.max(width, height) * 0.55,
  );
  orb.addColorStop(0, "rgba(255, 255, 255, 0.04)");
  orb.addColorStop(0.42, "rgba(40, 36, 68, 0.05)");
  orb.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, width, height);

  const edgeFade = ctx.createLinearGradient(0, 0, width, 0);
  edgeFade.addColorStop(0, `rgba(0, 0, 0, ${CONFIG.EDGE_FADE_RATIO})`);
  edgeFade.addColorStop(0.16, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.84, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(1, `rgba(0, 0, 0, ${CONFIG.EDGE_FADE_RATIO})`);
  ctx.fillStyle = edgeFade;
  ctx.fillRect(0, 0, width, height);
}

function laneY(band, xT, t, phases) {
  const waveScale = height * CONFIG.WAVE_SCALE_RATIO;
  const drift = height * CONFIG.WAVE_DRIFT_RATIO;
  const pulse = height * CONFIG.LANE_PULSE_RATIO;
  const focus = 1 - smoothstep(0.05, 0.5, Math.abs(xT - 0.5) * 2);

  const slow = Math.sin((xT * Math.PI * 2.1) + t * (0.62 + band.phase * 0.2) + band.index * 0.58);
  const fast = Math.sin((xT * Math.PI * 4.8) - t * (0.84 + phases.secondPhase * 0.65) + band.phase * 6.6);
  const shimmer = Math.cos((xT * Math.PI * 1.2) + t * 0.4 + phases.minutePhase * Math.PI * 2);
  const centerPull = (0.5 - xT) * height * CONFIG.FOCUS_PULL_RATIO * focus * (0.45 + band.depth * 0.75);
  const roleLift = Math.sin((xT - 0.5) * Math.PI * 4 + band.phase * 5 + t * 0.7) * height * 0.01;
  const directionalWave = Math.sin((xT * Math.PI * 1.4) + t * 0.5 + band.sway) * height * CONFIG.SWAY_RATIO * band.depth;
  const asymmetry = (xT - 0.5) * height * CONFIG.SHEAR_RATIO * (0.35 + band.depth) * (0.5 + phases.hourPhase * 0.5);

  return band.baseY
    + slow * waveScale * (0.5 + band.depth * 0.7)
    + fast * drift * (0.8 + band.depth * 0.28)
    + shimmer * pulse * (0.45 + band.t * 0.4)
    + roleLift
    + directionalWave
    + asymmetry
    + centerPull;
}

function drawCore(t, phases) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const outerRadius = Math.min(width, height) * (CONFIG.CORE_RADIUS_RATIO + phases.hourPhase * 0.02);
  const innerRadius = outerRadius * (CONFIG.KNOT_RADIUS_RATIO / CONFIG.CORE_RADIUS_RATIO);
  const knotTilt = CONFIG.KNOT_TILT_RATIO + Math.sin(t * 0.7) * 0.06;
  const pulse = 1 + Math.sin(t * 2.1 + phases.minutePhase * Math.PI * 2) * CONFIG.CORE_PULSE_RATIO;

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const halo = ctx.createRadialGradient(cx, cy, innerRadius * 0.2, cx, cy, outerRadius * 2.3);
  halo.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  halo.addColorStop(0.18, "rgba(130, 244, 255, 0.08)");
  halo.addColorStop(0.45, "rgba(255, 162, 210, 0.05)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(cx, cy, outerRadius * 2.3 * pulse, outerRadius * 2.0, knotTilt, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 255, 255, ${CONFIG.ORBIT_ALPHA})`;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0024);
  ctx.beginPath();
  ctx.ellipse(cx, cy, outerRadius * 1.22 * pulse, outerRadius * 0.72, -0.46 + phases.minutePhase * 0.22 + knotTilt * 0.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(103, 232, 249, ${CONFIG.ORBIT_ALPHA * 1.1})`;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0018);
  ctx.beginPath();
  ctx.ellipse(cx, cy, innerRadius * 1.08 * pulse, innerRadius * 0.62, 0.42 + t * 0.06 - knotTilt * 0.3, Math.PI * 0.04, Math.PI * 1.96);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, 0.2)`;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0012);
  ctx.beginPath();
  ctx.ellipse(cx, cy, innerRadius * 1.02, innerRadius * 0.88, knotTilt * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawBandBody(band, t, phases) {
  const points = [];
  const hueBase = (186 + band.t * CONFIG.HUE_SPAN + t * CONFIG.HUE_SHIFT_PER_SECOND) % 360;
  const bodyWidth = Math.max(1.4, Math.min(width, height) * CONFIG.BODY_WIDTH_RATIO * band.emphasis);
  const highlightWidth = Math.max(0.7, bodyWidth * CONFIG.HIGHLIGHT_WIDTH_RATIO * 24);
  const glowWidth = Math.max(2.8, Math.min(width, height) * CONFIG.GLOW_WIDTH_RATIO * (0.48 + band.depth * 0.55));
  const alpha = 0.2 + band.depth * 0.34 + phases.secondPhase * 0.05;
  const shadowBlur = Math.max(3, Math.min(width, height) * CONFIG.SHADOW_BLUR_RATIO);
  const laneShade = band.t < 0.5 ? 0.08 : -0.04;

  for (let i = 0; i <= CONFIG.WEAVE_STEPS; i += 1) {
    const xT = i / CONFIG.WEAVE_STEPS;
    const xShear = (xT - 0.5) * Math.min(width, height) * CONFIG.SHEAR_RATIO * (band.depth * 0.35);
    const x = band.baseX + xT * band.width + xShear;
    const y = laneY(band, xT, t, phases);
    points.push({ x, y, xT, shade: laneShade + (0.5 - xT) * 0.03 });
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = shadowBlur;
  ctx.shadowColor = mixHex("#64f1ff", "#ff95c8", band.t, 0.14);

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = mixHex("#5ddff7", "#d3ffb2", band.t * 0.9 + phases.hourPhase * 0.1, alpha * 0.6);
  ctx.lineWidth = bodyWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = mixHex("#a7fff2", "#ffd3ef", band.t * 0.8 + phases.minutePhase * 0.2, alpha * 0.9);
  ctx.lineWidth = bodyWidth * 0.72;
  ctx.stroke();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = `hsla(${hueBase}, 78%, ${56 + band.depth * 7}%, ${0.1 + band.depth * 0.16})`;
  ctx.lineWidth = highlightWidth;
  ctx.stroke();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + band.depth * 0.06})`;
  ctx.lineWidth = glowWidth;
  ctx.globalCompositeOperation = "screen";
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  return points;
}

function drawCrossLinks(t, phases) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  intersections.forEach((link, index) => {
    const a = bands[link.leftBand];
    const b = bands[link.rightBand];
    const xT = link.xT;
    const x = a.baseX + xT * a.width;
    const yA = laneY(a, xT, t, phases);
    const yB = laneY(b, xT, t, phases);
    const bridge = lerp(yA, yB, 0.5);
    const span = Math.abs(yB - yA);
    const depthMix = lerp(a.depth, b.depth, 0.5);
    const focus = link.focus;
    const waviness = Math.sin(t * 1.35 + link.twist * Math.PI * 3.6 + index * 0.3);
    const lift = span * (0.18 + link.twist * 0.14) * waviness;
    const alpha = (0.1 + depthMix * 0.08) * (0.45 + focus * 0.8);
    const linkWidth = Math.max(0.85, Math.min(width, height) * 0.0029 * (0.8 + depthMix * 0.5));

    ctx.shadowBlur = Math.max(2, Math.min(width, height) * 0.006 * focus);
    ctx.shadowColor = mixHex("#a9fbff", "#ffaad8", link.twist, alpha * 0.5);
    ctx.strokeStyle = mixHex("#a9fbff", "#ff8ec0", link.twist * 0.9 + focus * 0.1, alpha);
    ctx.lineWidth = linkWidth;
    ctx.beginPath();
    ctx.moveTo(x - 10, bridge - lift * 0.08);
    ctx.quadraticCurveTo(x, bridge + lift * 0.62, x + 10, bridge - lift * 0.08);
    ctx.stroke();

    if (hash01(index, xT, t) < CONFIG.SPARK_RATE * (0.5 + focus)) {
      const sparkSize = Math.max(0.9, linkWidth * 1.2);
      ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.SPARK_ALPHA * (0.35 + depthMix * 0.4)})`;
      ctx.beginPath();
      ctx.arc(x, bridge + lift * 0.08, sparkSize, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.restore();
}

function drawOrbit(t, phases) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * (CONFIG.CORE_RADIUS_RATIO + phases.hourPhase * 0.03);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255, 255, 255, ${CONFIG.ORBIT_ALPHA})`;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0025);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI * 0.15, Math.PI * (1.4 + phases.minutePhase * 0.55) - Math.PI * 0.15);
  ctx.stroke();

  ctx.strokeStyle = `rgba(102, 240, 255, ${CONFIG.ORBIT_ALPHA * 1.2})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, Math.PI * 0.35 + t * 0.22, Math.PI * 1.2 + t * 0.22);
  ctx.stroke();
  ctx.restore();
}

function draw(time) {
  if (!ctx) return;
  const t = (time - startTime) * 0.001;
  const phases = getTimePhases(new Date());

  drawBackdrop();

  drawCore(t, phases);

  const orderedBands = [...bands].sort((a, b) => a.depth - b.depth || a.index - b.index);
  for (let i = 0; i < orderedBands.length; i += 1) {
    drawBandBody(orderedBands[i], t, phases);
  }

  drawCrossLinks(t, phases);

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
  bands = [];
  intersections = [];
}