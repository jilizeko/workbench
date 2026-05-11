import {
  DEFAULT_PRISM_WEAVE_CONFIG,
  loadPrismWeaveConfig,
  savePrismWeaveConfig,
} from "./prism-weave.config.js";

let canvas;
let ctx;
let rafId;
let onResize;
let controlsRoot;
let controlsStyle;

let width = 0;
let height = 0;
let startTime = 0;

let bands = [];
let ghostBands = [];
let intersections = [];
let particles = [];

const CONFIG = loadPrismWeaveConfig();

const INTEGER_CONFIG_KEYS = new Set([
  "BAND_COUNT",
  "GHOST_BAND_COUNT",
  "WEAVE_STEPS",
  "CROSS_LINKS",
  "PARTICLE_COUNT",
]);

const CONFIG_RANGES = {
  BAND_COUNT: { min: 1, max: 240, step: 1 },
  GHOST_BAND_COUNT: { min: 0, max: 240, step: 1 },
  WEAVE_STEPS: { min: 4, max: 220, step: 1 },
  CROSS_LINKS: { min: 0, max: 160, step: 1 },
  BODY_WIDTH_RATIO: { min: 0.001, max: 0.05, step: 0.0005 },
  HIGHLIGHT_WIDTH_RATIO: { min: 0.0005, max: 0.03, step: 0.0005 },
  GLOW_WIDTH_RATIO: { min: 0.001, max: 0.1, step: 0.0005 },
  TRAIL_ALPHA: { min: 0, max: 0.4, step: 0.001 },
  ORBIT_ALPHA: { min: 0, max: 0.8, step: 0.001 },
  SPARK_ALPHA: { min: 0, max: 1, step: 0.001 },
  SPARK_RATE: { min: 0, max: 1, step: 0.001 },
  CORE_RADIUS_RATIO: { min: 0.02, max: 0.8, step: 0.001 },
  KNOT_RADIUS_RATIO: { min: 0.02, max: 0.6, step: 0.001 },
  WAVE_SCALE_RATIO: { min: 0.001, max: 0.2, step: 0.001 },
  WAVE_DRIFT_RATIO: { min: 0, max: 0.2, step: 0.001 },
  LANE_PULSE_RATIO: { min: 0, max: 0.1, step: 0.0005 },
  SHADOW_BLUR_RATIO: { min: 0, max: 0.08, step: 0.0005 },
  HUE_SPAN: { min: 0, max: 360, step: 1 },
  HUE_SHIFT_PER_SECOND: { min: 0, max: 80, step: 0.1 },
  FOCUS_PULL_RATIO: { min: 0, max: 0.4, step: 0.001 },
  EDGE_FADE_RATIO: { min: 0, max: 1, step: 0.001 },
  SHEAR_RATIO: { min: 0, max: 0.2, step: 0.001 },
  SWAY_RATIO: { min: 0, max: 0.2, step: 0.001 },
  KNOT_TILT_RATIO: { min: 0, max: 1.2, step: 0.001 },
  CORE_PULSE_RATIO: { min: 0, max: 0.8, step: 0.001 },
  PARTICLE_COUNT: { min: 0, max: 800, step: 1 },
  PARTICLE_SPEED: { min: 0, max: 4, step: 0.01 },
  BG_PULSE_STRENGTH: { min: 0, max: 0.5, step: 0.001 },
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

function rgbToHex({ r, g, b }) {
  const rr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, "0");
  const gg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, "0");
  const bb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

function formatControlValue(key, value) {
  if (INTEGER_CONFIG_KEYS.has(key)) return String(Math.round(value));
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function getRangeMeta(key, value) {
  if (CONFIG_RANGES[key]) return CONFIG_RANGES[key];

  if (INTEGER_CONFIG_KEYS.has(key)) {
    return {
      min: Math.max(0, Math.floor(value * 0.25)),
      max: Math.max(2, Math.ceil(value * 3)),
      step: 1,
    };
  }

  if (value <= 1) return { min: 0, max: 1, step: 0.001 };
  if (value <= 10) return { min: 0, max: 10, step: 0.01 };
  return { min: 0, max: Math.max(20, value * 2), step: 0.1 };
}

function createControls() {
  if (controlsRoot) return;

  controlsStyle = document.createElement("style");
  controlsStyle.textContent = `
    .prism-weave-controls {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 30;
      width: min(280px, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow: auto;
      background: rgba(8, 9, 16, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(10px);
      padding: 7px;
      color: rgba(245, 247, 255, 0.92);
      font: 10px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      box-sizing: border-box;
    }
    .prism-weave-controls__title {
      margin: 0 0 6px;
      opacity: 0.88;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .prism-weave-controls__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin: 0 0 6px;
    }
    .prism-weave-controls__button {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(245, 247, 255, 0.92);
      border-radius: 5px;
      padding: 4px 6px;
      cursor: pointer;
      font: inherit;
      line-height: 1.15;
      text-align: center;
    }
    .prism-weave-controls__button:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .prism-weave-controls__status {
      margin: 0 0 6px;
      min-height: 12px;
      opacity: 0.78;
    }
    .prism-weave-controls__row {
      display: grid;
      grid-template-columns: 1fr 52px;
      gap: 4px;
      align-items: center;
      margin-bottom: 5px;
    }
    .prism-weave-controls__name {
      grid-column: 1 / -1;
      opacity: 0.84;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .prism-weave-controls__slider {
      width: 100%;
      margin: 0;
      height: 12px;
      accent-color: rgba(140, 222, 255, 0.95);
    }
    .prism-weave-controls__value {
      text-align: right;
      opacity: 0.94;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(controlsStyle);

  controlsRoot = document.createElement("aside");
  controlsRoot.className = "prism-weave-controls";

  const title = document.createElement("div");
  title.className = "prism-weave-controls__title";
  title.textContent = "Prism Weave Controls";
  controlsRoot.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "prism-weave-controls__actions";

  const resetButton = document.createElement("button");
  resetButton.className = "prism-weave-controls__button";
  resetButton.type = "button";
  resetButton.textContent = "Reset Defaults";

  const copyButton = document.createElement("button");
  copyButton.className = "prism-weave-controls__button";
  copyButton.type = "button";
  copyButton.textContent = "Copy JSON";

  actions.appendChild(resetButton);
  actions.appendChild(copyButton);
  controlsRoot.appendChild(actions);

  const status = document.createElement("div");
  status.className = "prism-weave-controls__status";
  controlsRoot.appendChild(status);

  const setStatus = (message) => {
    status.textContent = message;
    if (!message) return;
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 1400);
  };

  resetButton.addEventListener("click", () => {
    Object.assign(CONFIG, DEFAULT_PRISM_WEAVE_CONFIG);
    savePrismWeaveConfig(CONFIG);
    removeControls();
    createControls();
    if (canvas && ctx) buildBands();
  });

  copyButton.addEventListener("click", async () => {
    const payload = JSON.stringify(CONFIG, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setStatus("Copied current config");
    } catch {
      setStatus("Copy failed");
    }
  });

  Object.entries(CONFIG).forEach(([key, initialValue]) => {
    if (typeof initialValue !== "number" && typeof initialValue !== "string") return;

    if (typeof initialValue === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(initialValue)) {
      const colorContainer = document.createElement("div");
      colorContainer.className = "prism-weave-controls__row";

      const colorName = document.createElement("div");
      colorName.className = "prism-weave-controls__name";
      colorName.textContent = key;

      const colorValue = document.createElement("div");
      colorValue.className = "prism-weave-controls__value";
      colorValue.style.gridColumn = "1 / -1";
      colorValue.style.textAlign = "left";

      const rgb = hexToRgb(initialValue);
      const updateColorText = () => {
        const nextHex = rgbToHex(rgb);
        CONFIG[key] = nextHex;
        colorValue.textContent = `${nextHex}  (r:${rgb.r} g:${rgb.g} b:${rgb.b})`;
      };
      updateColorText();

      colorContainer.appendChild(colorName);
      colorContainer.appendChild(colorValue);
      controlsRoot.appendChild(colorContainer);

      ["r", "g", "b"].forEach((channel) => {
        const row = document.createElement("div");
        row.className = "prism-weave-controls__row";

        const name = document.createElement("div");
        name.className = "prism-weave-controls__name";
        name.textContent = `${key}_${channel.toUpperCase()}`;

        const slider = document.createElement("input");
        slider.className = "prism-weave-controls__slider";
        slider.type = "range";
        slider.min = "0";
        slider.max = "255";
        slider.step = "1";
        slider.value = String(rgb[channel]);

        const value = document.createElement("div");
        value.className = "prism-weave-controls__value";
        value.textContent = String(rgb[channel]);

        slider.addEventListener("input", () => {
          rgb[channel] = Number(slider.value);
          value.textContent = String(rgb[channel]);
          updateColorText();
          savePrismWeaveConfig(CONFIG);
          if (canvas && ctx) buildBands();
        });

        row.appendChild(name);
        row.appendChild(slider);
        row.appendChild(value);
        controlsRoot.appendChild(row);
      });

      return;
    }

    if (typeof initialValue !== "number") return;

    const row = document.createElement("div");
    row.className = "prism-weave-controls__row";

    const name = document.createElement("div");
    name.className = "prism-weave-controls__name";
    name.textContent = key;

    const slider = document.createElement("input");
    slider.className = "prism-weave-controls__slider";
    slider.type = "range";
    const range = getRangeMeta(key, initialValue);
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.step = String(range.step);
    slider.value = String(initialValue);

    const value = document.createElement("div");
    value.className = "prism-weave-controls__value";
    value.textContent = formatControlValue(key, initialValue);

    slider.addEventListener("input", () => {
      let next = Number(slider.value);
      if (INTEGER_CONFIG_KEYS.has(key)) next = Math.round(next);
      CONFIG[key] = next;
      value.textContent = formatControlValue(key, next);
      savePrismWeaveConfig(CONFIG);
      if (canvas && ctx) buildBands();
    });

    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(value);
    controlsRoot.appendChild(row);
  });

  document.body.appendChild(controlsRoot);
}

function removeControls() {
  if (controlsRoot && controlsRoot.parentElement) {
    controlsRoot.parentElement.removeChild(controlsRoot);
  }
  if (controlsStyle && controlsStyle.parentElement) {
    controlsStyle.parentElement.removeChild(controlsStyle);
  }
  controlsRoot = null;
  controlsStyle = null;
}

function buildBands() {
  bands = [];
  ghostBands = [];
  intersections = [];
  particles = [];

  const usableWidth = width * 0.92;
  const centerY = height * 0.5;
  const startX = (width - usableWidth) * 0.5;
  const bandGap = height * 0.72 / Math.max(1, CONFIG.BAND_COUNT - 1);

  for (let i = 0; i < CONFIG.BAND_COUNT; i += 1) {
    const t = CONFIG.BAND_COUNT === 1 ? 0.5 : i / (CONFIG.BAND_COUNT - 1);
    const offset = (i - (CONFIG.BAND_COUNT - 1) * 0.5) * bandGap;
    const depth = clamp(1 - Math.abs(t - 0.5) * 1.8, 0.34, 1);
    const sideBias = (t - 0.5) * 2;
    const isLead = i === Math.floor(CONFIG.BAND_COUNT / 2);

    bands.push({
      index: i,
      t,
      baseY: centerY + offset,
      baseX: startX,
      width: usableWidth,
      depth,
      emphasis: clamp(0.42 + depth * 0.48, 0.42, 0.95),
      sway: sideBias * 0.4,
      phase: hash01(i + 0.13, t + 0.31),
      isLead,
      speedMult: 0.7 + hash01(i + 1.1, t + 0.77) * 0.9,
      maxExcursion: bandGap * 0.9,
    });
  }

  const ghostGap = height * 0.86 / Math.max(1, CONFIG.GHOST_BAND_COUNT - 1);
  for (let i = 0; i < CONFIG.GHOST_BAND_COUNT; i += 1) {
    const t = CONFIG.GHOST_BAND_COUNT === 1 ? 0.5 : i / (CONFIG.GHOST_BAND_COUNT - 1);
    const offset = (i - (CONFIG.GHOST_BAND_COUNT - 1) * 0.5) * ghostGap;
    const depth = clamp(1 - Math.abs(t - 0.5) * 1.1, 0.45, 1);
    const sideBias = (t - 0.5) * 2;

    ghostBands.push({
      index: i,
      t,
      baseY: centerY + offset,
      baseX: startX,
      width: usableWidth,
      depth,
      sway: sideBias * 0.22,
      phase: hash01(i + 10.13, t + 5.31),
      speedMult: 0.45 + hash01(i + 2.8, t + 1.9) * 0.55,
      maxExcursion: ghostGap * 0.72,
      widthScale: 0.75 + hash01(i + 8.1, t + 3.2) * 0.75,
      alphaScale: 0.55 + hash01(i + 1.9, t + 6.7) * 0.6,
    });
  }

  for (let i = 0; i < CONFIG.CROSS_LINKS; i += 1) {
    const pairSeed = hash01(i + 0.4, 0.19);
    const leftBand = clamp(Math.floor(lerp(0, CONFIG.BAND_COUNT - 2, pairSeed)), 0, CONFIG.BAND_COUNT - 2);
    const pairFocus = 1 - Math.abs(((leftBand + 0.5) / (CONFIG.BAND_COUNT - 1)) - 0.5) * 2;
    const xT = clamp(0.1 + (i + 1) / (CONFIG.CROSS_LINKS + 2) * 0.8 + (hash01(i, pairSeed) - 0.5) * 0.04, 0.06, 0.94);
    intersections.push({
      leftBand,
      rightBand: leftBand + 1,
      xT: clamp(xT + (hash01(i, xT) - 0.5) * 0.05, 0.04, 0.96),
      twist: hash01(i + 0.7, xT + 0.2),
      focus: clamp(pairFocus, 0.05, 1),
      over: hash01(i + 2.3, pairSeed) > 0.5,
    });
  }

  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i += 1) {
    const bandIdx = Math.floor(hash01(i, 3.77) * CONFIG.BAND_COUNT);
    particles.push({
      bandIdx: clamp(bandIdx, 0, CONFIG.BAND_COUNT - 1),
      xT: hash01(i + 0.1, 7.13),
      speed: (0.4 + hash01(i + 5.5, 2.2) * 0.9) * CONFIG.PARTICLE_SPEED,
      size: 1.2 + hash01(i + 3.1, 0.88) * 2.2,
      phase: hash01(i + 8.8, 4.4) * Math.PI * 2,
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

function drawBackdrop(t, phases) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, CONFIG.BG_TOP);
  bg.addColorStop(1, CONFIG.BG_BOTTOM);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(6, 7, 12, ${CONFIG.TRAIL_ALPHA})`;
  ctx.fillRect(0, 0, width, height);

  // time-reactive bg pulse — deepens on the minute boundary
  const minutePulse = Math.pow(Math.sin(phases.minutePhase * Math.PI), 4);
  const secondPulse = Math.pow(Math.sin(phases.secondPhase * Math.PI), 6);
  const bgGlow = CONFIG.BG_PULSE_STRENGTH * (minutePulse * 0.6 + secondPulse * 0.4);
  const hueShift = 220 + phases.hourPhase * 80;
  if (bgGlow > 0.004) {
    const pulse = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
    pulse.addColorStop(0, `hsla(${hueShift}, 80%, 60%, ${bgGlow * 0.9})`);
    pulse.addColorStop(0.5, `hsla(${hueShift + 40}, 70%, 40%, ${bgGlow * 0.35})`);
    pulse.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pulse;
    ctx.fillRect(0, 0, width, height);
  }

  // vertical spectrum fog
  const fog = ctx.createLinearGradient(0, 0, 0, height);
  fog.addColorStop(0,    `hsla(200, 70%, 50%, 0.035)`);
  fog.addColorStop(0.35, `hsla(270, 60%, 45%, 0.025)`);
  fog.addColorStop(0.65, `hsla(320, 65%, 50%, 0.028)`);
  fog.addColorStop(1,    `hsla(180, 75%, 45%, 0.032)`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, width, height);

  const orb = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    Math.min(width, height) * CONFIG.CORE_RADIUS_RATIO * 0.15,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.58,
  );
  orb.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  orb.addColorStop(0.38, "rgba(40, 30, 72, 0.06)");
  orb.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, width, height);

  const edgeFade = ctx.createLinearGradient(0, 0, width, 0);
  edgeFade.addColorStop(0, `rgba(0, 0, 0, ${CONFIG.EDGE_FADE_RATIO})`);
  edgeFade.addColorStop(0.14, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.86, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(1, `rgba(0, 0, 0, ${CONFIG.EDGE_FADE_RATIO})`);
  ctx.fillStyle = edgeFade;
  ctx.fillRect(0, 0, width, height);
}

function laneY(band, xT, t, phases) {
  const waveScale = height * CONFIG.WAVE_SCALE_RATIO;
  const drift = height * CONFIG.WAVE_DRIFT_RATIO;
  const pulse = height * CONFIG.LANE_PULSE_RATIO;
  const focus = 1 - smoothstep(0.05, 0.5, Math.abs(xT - 0.5) * 2);
  const sp = band.speedMult;

  const slow = Math.sin((xT * Math.PI * 2.1) + t * (0.62 + band.phase * 0.2) * sp + band.index * 0.58);
  const fast = Math.sin((xT * Math.PI * 4.8) - t * (0.84 + phases.secondPhase * 0.65) * sp + band.phase * 6.6);
  const macro = Math.sin((xT * Math.PI * 0.9) + t * 0.28 * sp + band.phase * 2.4);
  const shimmer = Math.cos((xT * Math.PI * 1.2) + t * 0.4 + phases.minutePhase * Math.PI * 2);
  const centerPull = (0.5 - xT) * height * CONFIG.FOCUS_PULL_RATIO * focus * (0.5 + band.depth * 0.8);
  const roleLift = Math.sin((xT - 0.5) * Math.PI * 4 + band.phase * 5 + t * 0.7) * height * 0.014;
  const directionalWave = Math.sin((xT * Math.PI * 2.0) + t * 0.5 * sp + band.sway) * height * CONFIG.SWAY_RATIO * band.depth;
  const raw = band.baseY
    + slow * waveScale * (0.55 + band.depth * 0.65)
    + macro * waveScale * 0.28
    + fast * drift * (0.75 + band.depth * 0.28)
    + shimmer * pulse * (0.45 + band.t * 0.4)
    + roleLift
    + directionalWave
    + centerPull;
  // hard-clamp each band to its allocated lane
  return clamp(raw, band.baseY - band.maxExcursion, band.baseY + band.maxExcursion);
}

function laneYGhost(band, xT, t, phases) {
  const macro = Math.sin((xT * Math.PI * 1.35) + t * (0.24 + phases.hourPhase * 0.12) * band.speedMult + band.phase * 2.2);
  const soft = Math.cos((xT * Math.PI * 2.4) - t * (0.32 + phases.minutePhase * 0.3) * band.speedMult + band.phase * 5.4);
  const sway = Math.sin((xT * Math.PI * 2) + t * 0.22 + band.sway);
  const amp = height * 0.075 * band.depth;
  const raw = band.baseY + macro * amp * 0.72 + soft * amp * 0.38 + sway * height * 0.018;
  return clamp(raw, band.baseY - band.maxExcursion, band.baseY + band.maxExcursion);
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

function drawBandBody(band, t, phases, clipAbove, clipBelow) {
  const points = [];
  // full-spectrum: each band occupies its own hue region, all 7 together span 0-360
  const hueBase = (band.t * 360 + t * CONFIG.HUE_SHIFT_PER_SECOND) % 360;
  const bodyWidth = Math.max(1.6, Math.min(width, height) * CONFIG.BODY_WIDTH_RATIO * band.emphasis);
  const highlightWidth = Math.max(0.8, bodyWidth * 0.28);
  const glowWidth = Math.max(3.5, Math.min(width, height) * CONFIG.GLOW_WIDTH_RATIO * (0.5 + band.depth * 0.6));
  const alpha = 0.24 + band.depth * 0.38 + (band.isLead ? 0.16 : 0);
  const shadowBlur = Math.max(4, Math.min(width, height) * CONFIG.SHADOW_BLUR_RATIO * (band.isLead ? 1.8 : 1));

  for (let i = 0; i <= CONFIG.WEAVE_STEPS; i += 1) {
    const xT = i / CONFIG.WEAVE_STEPS;
    const xShear = (xT - 0.5) * Math.min(width, height) * CONFIG.SHEAR_RATIO * (band.depth * 0.4);
    const x = band.baseX + xT * band.width + xShear;
    const y = laneY(band, xT, t, phases);
    points.push({ x, y, xT });
  }

  ctx.save();

  // weave clipping disabled — bands overlap naturally, each full visible
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = shadowBlur;
  ctx.shadowColor = `hsla(${hueBase + 20}, 90%, 70%, 0.18)`;

  // base wide stroke
  ctx.beginPath();
  points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = `hsla(${hueBase}, 80%, 48%, ${alpha * 0.55})`;
  ctx.lineWidth = bodyWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // bright core
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `hsla(${hueBase + 15}, 92%, 72%, ${alpha})`;
  ctx.lineWidth = bodyWidth * 0.48;
  ctx.stroke();

  // specular highlight
  ctx.beginPath();
  points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = `hsla(${hueBase + 30}, 95%, 88%, ${0.08 + band.depth * 0.12})`;
  ctx.lineWidth = highlightWidth;
  ctx.stroke();

  // bloom glow
  ctx.beginPath();
  points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = `hsla(${hueBase}, 85%, 65%, ${0.06 + band.depth * 0.08})`;
  ctx.lineWidth = glowWidth;
  ctx.globalCompositeOperation = "screen";
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  // lead band gets an extra bright spine
  if (band.isLead) {
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = `rgba(255, 255, 255, 0.22)`;
    ctx.lineWidth = Math.max(0.7, bodyWidth * 0.18);
    ctx.globalCompositeOperation = "screen";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
  return points;
}

function drawGhostWaves(t, phases) {
  const minDim = Math.min(width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  ghostBands.forEach((band) => {
    const points = [];
    const hue = (band.t * 300 + 35 + t * (CONFIG.HUE_SHIFT_PER_SECOND * 0.35)) % 360;
    const waveWidth = Math.max(16, minDim * 0.052 * band.widthScale);
    const alpha = (0.03 + band.depth * 0.035) * band.alphaScale;

    for (let i = 0; i <= CONFIG.WEAVE_STEPS; i += 1) {
      const xT = i / CONFIG.WEAVE_STEPS;
      const x = band.baseX + xT * band.width;
      const y = laneYGhost(band, xT, t, phases);
      points.push({ x, y });
    }

    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = `hsla(${hue}, 80%, 68%, ${alpha})`;
    ctx.lineWidth = waveWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = `hsla(${hue + 28}, 78%, 82%, ${alpha * 0.55})`;
    ctx.lineWidth = waveWidth * 0.42;
    ctx.stroke();
  });

  ctx.restore();
}

function drawParticles(t, phases) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  particles.forEach((p) => {
    const band = bands[p.bandIdx];
    if (!band) return;

    // advance
    p.xT = (p.xT + p.speed * 0.006) % 1;

    const xT = p.xT;
    const xShear = (xT - 0.5) * Math.min(width, height) * CONFIG.SHEAR_RATIO * (band.depth * 0.4);
    const x = band.baseX + xT * band.width + xShear;
    const y = laneY(band, xT, t, phases);
    const hue = (band.t * 360 + t * CONFIG.HUE_SHIFT_PER_SECOND + p.phase * 30) % 360;
    const flicker = 0.55 + 0.45 * Math.sin(t * 6.4 + p.phase);
    const brightness = 0.5 + band.depth * 0.35;

    const grd = ctx.createRadialGradient(x, y, 0, x, y, p.size * 2.4);
    grd.addColorStop(0, `hsla(${hue}, 90%, 88%, ${0.7 * flicker * brightness})`);
    grd.addColorStop(0.4, `hsla(${hue}, 80%, 70%, ${0.3 * flicker * brightness})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, p.size * 2.4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawCrossLinks(t, phases) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  intersections.forEach((link, index) => {
    const a = bands[link.leftBand];
    const b = bands[link.rightBand];
    const xT = link.xT;
    const xShearA = (xT - 0.5) * Math.min(width, height) * CONFIG.SHEAR_RATIO * (a.depth * 0.4);
    const xShearB = (xT - 0.5) * Math.min(width, height) * CONFIG.SHEAR_RATIO * (b.depth * 0.4);
    const xA = a.baseX + xT * a.width + xShearA;
    const xB = b.baseX + xT * b.width + xShearB;
    const x = (xA + xB) * 0.5;
    const yA = laneY(a, xT, t, phases);
    const yB = laneY(b, xT, t, phases);
    const bridge = lerp(yA, yB, 0.5);
    const span = Math.abs(yB - yA);
    const depthMix = lerp(a.depth, b.depth, 0.5);
    const focus = link.focus;
    const waviness = Math.sin(t * 1.35 + link.twist * Math.PI * 3.6 + index * 0.3);
    const lift = span * (0.22 + link.twist * 0.16) * waviness;
    const alpha = (0.14 + depthMix * 0.1) * (0.5 + focus * 0.85);
    const linkWidth = Math.max(0.9, Math.min(width, height) * 0.0034 * (0.9 + depthMix * 0.55));
    const hueA = (a.t * 360 + t * CONFIG.HUE_SHIFT_PER_SECOND) % 360;
    const hueB = (b.t * 360 + t * CONFIG.HUE_SHIFT_PER_SECOND) % 360;
    const hueMid = (hueA + hueB) * 0.5;

    ctx.shadowBlur = Math.max(3, Math.min(width, height) * 0.008 * focus);
    ctx.shadowColor = `hsla(${hueMid}, 90%, 75%, ${alpha * 0.6})`;
    ctx.strokeStyle = `hsla(${hueMid + 12}, 88%, 70%, ${alpha})`;
    ctx.lineWidth = linkWidth;
    ctx.beginPath();
    ctx.moveTo(x - 12, bridge - lift * 0.1);
    ctx.quadraticCurveTo(x, bridge + lift * 0.68, x + 12, bridge - lift * 0.1);
    ctx.stroke();

    // always draw a tight centre dot at the stitch point
    const dotAlpha = alpha * (0.6 + depthMix * 0.5);
    ctx.fillStyle = `hsla(${hueMid}, 95%, 85%, ${dotAlpha})`;
    ctx.beginPath();
    ctx.arc(x, bridge + lift * 0.1, Math.max(1, linkWidth * 1.4), 0, Math.PI * 2);
    ctx.fill();
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

  drawBackdrop(t, phases);
  drawGhostWaves(t, phases);

  drawCore(t, phases);

  // paint bands back-to-front; middle bands (deepest) paint on top
  const orderedBands = [...bands].sort((a, b) => a.depth - b.depth || a.index - b.index);
  orderedBands.forEach((band, i) => {
    const above = i > 0 ? orderedBands[i - 1] : null;
    const below = i < orderedBands.length - 1 ? orderedBands[i + 1] : null;
    drawBandBody(band, t, phases, above, below);
  });

  drawCrossLinks(t, phases);

  drawParticles(t, phases);

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
  createControls();
}

export function start() {
  startTime = performance.now();
  rafId = requestAnimationFrame(draw);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  removeControls();
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);

  canvas = null;
  ctx = null;
  rafId = null;
  onResize = null;
  bands = [];
  ghostBands = [];
  intersections = [];
  particles = [];
}