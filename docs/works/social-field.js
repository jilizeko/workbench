import {
  DEFAULT_SOCIAL_FIELD_CONFIG,
  loadSocialFieldConfig,
  saveSocialFieldConfig,
} from "./social-field.config.js";

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED STATE: CPU + GPU modes with automatic selection
// ─────────────────────────────────────────────────────────────────────────────

let canvas, ctx, ctx2d;
let gpuContext, device, format;
let rafId, onResize, onPointerDown;
let controlsRoot, controlsStyle, modeLabel;
let width = 0, height = 0, dpr = 1;
let lastTime = 0;

// CPU mode state
let agents = [];
let relationships = new Map();
let nextId = 0;
let decayAccumulator = 0;

// GPU mode state
let useGpu = false;
let setupPromise = null;
let alive = false;
let clearPipeline, buildPipeline, simulatePipeline, renderPipeline;
let decayPipeline;
let connectionPipeline;
let computeBindGroups = [];
let renderBindGroups = [];
let connectionBindGroups = [];
let agentBuffers = [];
let traitsBuffer;
let simUniformBuffer, renderUniformBuffer;
let connectionUniformBuffer;
let cellCountsBuffer, cellAgentsBuffer;
let relationKeysBuffer, relationValuesBuffer;
let activeIndex = 0;
let gpuAgents = [];
let cleanupFns = [];
let gpuRebuildInFlight = null;
let gpuAgentCount = 0;
let relationTableSize = 0;
let gpuConnectionsBroken = false;
let gpuDecayStep = 0;
let gpuDecayStart = 0;
let gpuDecayCount = 0;
let relationDecayCursor = 0;
let lastFrameMs = 0;
let frameDecayMs = 0, frameClearMs = 0, frameBuildMs = 0, frameSimMs = 0, frameRenderMs = 0;
let fpsSmoothed = 60;

// GPU constants
const GRID_MAX_CELLS = 16384;
const GRID_MAX_CELL_CAPACITY = 64;
const REL_TABLE_MIN_SIZE = 4096;
const REL_TABLE_MAX_SIZE = 1 << 21;
const RELATION_VALUE_SCALE = 1024;
const MAX_GPU_CONNECTION_PAIRS = 120000;

// Unified config
const CONFIG = loadSocialFieldConfig();

const CONTROL_HINTS = {
  ASPECT_FORCE_SCALE: "Global multiplier for all aspect-based social forces.",
  ASPECT_REPEL_THRESHOLD: "Legacy shared threshold. Prefer per-aspect A/B/C/D thresholds below.",
  ASPECT_A_THRESHOLD: "Dead zone for aspect A signed similarity (higher = fewer interactions).",
  ASPECT_B_THRESHOLD: "Dead zone for aspect B signed similarity (higher = fewer interactions).",
  ASPECT_C_THRESHOLD: "Dead zone for aspect C signed similarity (higher = fewer interactions).",
  ASPECT_D_THRESHOLD: "Dead zone for aspect D signed similarity (higher = fewer interactions).",
  ASPECT_A_STRENGTH: "Weight of aspect A in the signed pair force.",
  ASPECT_B_STRENGTH: "Weight of aspect B in the pairwise force.",
  ASPECT_C_STRENGTH: "Weight of aspect C in the pairwise force.",
  ASPECT_D_STRENGTH: "Weight of aspect D in the pairwise force.",
  AGENT_RADIUS_MIN: "Minimum agent radius (pixels). Supports fractional values < 1.",
  AGENT_RADIUS_MAX: "Maximum agent radius (pixels). Aspect D interpolates between min and max.",
  CONNECTION_MIN_RELATION_NORM: "Show only links above this normalized relationship threshold (0..1).",
};

// UI configuration
const PANEL_WIDTH_KEY = "social-field-panel-width";
const PANEL_BOUNDS_KEY = "social-field-panel-bounds";
const PRESETS_KEY = "social-field-presets";
const PRESET_SCHEMA_VERSION = 2;

const INTEGER_CONFIG_KEYS = new Set([
  "INITIAL_AGENT_COUNT", "VISION_RADIUS", "MAX_RELATIONSHIP",
  "GLOW_INTENSITY", "DECAY_BATCH_INTERVAL", "AGENTS_TO_ADD_PER_CLICK",
]);
const BOOL_CONFIG_KEYS = new Set(["SHOW_CONNECTIONS", "SHOW_VISION", "ENABLE_SHADOWS", "ENABLE_ASPECTS"]);

const CONFIG_RANGES = {
  INITIAL_AGENT_COUNT:      { min: 1,   max: 120,  step: 1     },
  VISION_RADIUS:            { min: 20,  max: 500,  step: 1     },
  FRICTION:                 { min: 0.80,max: 0.999,step: 0.001 },
  SPEED_LIMIT:              { min: 0.1, max: 20,   step: 0.1   },
  DEFAULT_FRIENDLINESS:     { min: 0,   max: 5,    step: 0.01  },
  FRIENDLINESS_VARIANCE:    { min: 0,   max: 3,    step: 0.01  },
  DEFAULT_BASE_BOUNDARY:    { min: 5,   max: 300,  step: 1     },
  BOUNDARY_VARIANCE:        { min: 0,   max: 100,  step: 1     },
  DEFAULT_BOUNDARY_AMPLITUDE:{ min: 0,  max: 100,  step: 1     },
  MAX_RELATIONSHIP:         { min: 10,  max: 1000, step: 1     },
  RELATIONSHIP_TICK_RATE:   { min: 0,   max: 30,   step: 0.1   },
  RELATIONSHIP_DECAY:       { min: 0,   max: 10,   step: 0.01  },
  HARD_REPULSION:           { min: 0,   max: 40,   step: 0.1   },
  SOFT_REPULSION_SCALE:     { min: 0,   max: 30,   step: 0.1   },
  ATTRACTION_SCALE:         { min: 0,   max: 5,    step: 0.01  },
  ASPECT_FORCE_SCALE:       { min: 0,   max: 8,    step: 0.01  },
  ASPECT_REPEL_THRESHOLD:   { min: 0.05,max: 0.95, step: 0.01  },
  ASPECT_A_THRESHOLD:       { min: 0.00,max: 0.95, step: 0.01  },
  ASPECT_B_THRESHOLD:       { min: 0.00,max: 0.95, step: 0.01  },
  ASPECT_C_THRESHOLD:       { min: 0.00,max: 0.95, step: 0.01  },
  ASPECT_D_THRESHOLD:       { min: 0.00,max: 0.95, step: 0.01  },
  ASPECT_A_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_B_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_C_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_D_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  BOUNDARY_REDUCTION_MAX:   { min: 0,   max: 1,    step: 0.01  },
  BOUNDARY_CURVE:           { min: 0.1, max: 6,    step: 0.1   },
  AGENT_RADIUS_MIN:         { min: 0.05,max: 40,   step: 0.01  },
  AGENT_RADIUS_MAX:         { min: 0.05,max: 40,   step: 0.01  },
  GLOW_INTENSITY:           { min: 0,   max: 60,   step: 1     },
  CONNECTION_ALPHA_MAX:     { min: 0,   max: 1,    step: 0.01  },
  CONNECTION_MIN_RELATION_NORM: { min: 0, max: 1, step: 0.01 },
  DECAY_BATCH_INTERVAL:     { min: 1,   max: 60,   step: 1     },
  AGENTS_TO_ADD_PER_CLICK:   { min: 1,   max: 50,   step: 1     },
};

const PANEL_GROUPS = [
  {
    title: "world",
    keys: ["AGENTS_TO_ADD_PER_CLICK", "INITIAL_AGENT_COUNT", "VISION_RADIUS", "FRICTION", "SPEED_LIMIT"],
  },
  {
    title: "agent",
    keys: [
      "DEFAULT_FRIENDLINESS",
      "FRIENDLINESS_VARIANCE",
      "DEFAULT_BASE_BOUNDARY",
      "BOUNDARY_VARIANCE",
      "DEFAULT_BOUNDARY_AMPLITUDE",
    ],
  },
  {
    title: "relationship",
    keys: [
      "MAX_RELATIONSHIP",
      "RELATIONSHIP_TICK_RATE",
      "RELATIONSHIP_DECAY",
      "BOUNDARY_REDUCTION_MAX",
      "BOUNDARY_CURVE",
    ],
  },
  {
    title: "forces",
    keys: ["ATTRACTION_SCALE", "SOFT_REPULSION_SCALE", "HARD_REPULSION"],
  },
  {
    title: "aspects",
    keys: [
      "ASPECT_FORCE_SCALE",
      "ASPECT_A_THRESHOLD",
      "ASPECT_B_THRESHOLD",
      "ASPECT_C_THRESHOLD",
      "ASPECT_D_THRESHOLD",
      "ASPECT_A_STRENGTH",
      "ASPECT_B_STRENGTH",
      "ASPECT_C_STRENGTH",
      "ASPECT_D_STRENGTH",
    ],
  },
  {
    title: "render",
    keys: ["AGENT_RADIUS_MIN", "AGENT_RADIUS_MAX", "CONNECTION_ALPHA_MAX", "CONNECTION_MIN_RELATION_NORM"],
  },
  {
    title: "toggles",
    boolKeys: ["SHOW_CONNECTIONS", "SHOW_VISION"],
  },
];

// ─── CPU: relationship helpers ───────────────────────────────────────────────
function relKey(id1, id2) {
  return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
}
function getRel(id1, id2) {
  return relationships.get(relKey(id1, id2)) || 0;
}
function addRel(id1, id2, delta) {
  const k = relKey(id1, id2);
  const v = (relationships.get(k) || 0) + delta;
  relationships.set(k, Math.max(0, Math.min(CONFIG.MAX_RELATIONSHIP, v)));
}

// ─── CPU: agent factory ──────────────────────────────────────────────────────
function createAgent(x, y) {
  const fv = CONFIG.FRIENDLINESS_VARIANCE;
  const bv = CONFIG.BOUNDARY_VARIANCE;
  const aspectA = Math.random();
  const aspectD = Math.random();
  return {
    id: nextId++,
    x, y,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    friendliness: Math.max(0, CONFIG.DEFAULT_FRIENDLINESS + (Math.random() - 0.5) * 2 * fv),
    baseBoundary: Math.max(5, CONFIG.DEFAULT_BASE_BOUNDARY + (Math.random() - 0.5) * 2 * bv),
    boundaryAmplitude: Math.max(0, CONFIG.DEFAULT_BOUNDARY_AMPLITUDE),
    scale: aspectD,
    aspectA,
    aspectB: Math.random(),
    aspectC: Math.random(),
    aspectD,
  };
}

// ─── CPU: presets ────────────────────────────────────────────────────────────
function sanitizeConfigSnapshot(rawConfig) {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SOCIAL_FIELD_CONFIG)) {
    if (rawConfig && key in rawConfig) clean[key] = rawConfig[key];
  }
  return clean;
}

function readPresetStore() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) {
      return { version: PRESET_SCHEMA_VERSION, presets: {} };
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === PRESET_SCHEMA_VERSION && parsed.presets && typeof parsed.presets === "object") {
      return parsed;
    }

    // Backward compatibility: old format was { [name]: configObject }
    const migratedPresets = {};
    if (parsed && typeof parsed === "object") {
      for (const [name, value] of Object.entries(parsed)) {
        migratedPresets[name] = {
          config: sanitizeConfigSnapshot(value),
          ui: {},
          meta: { migrated: true }
        };
      }
    }

    const migratedStore = { version: PRESET_SCHEMA_VERSION, presets: migratedPresets };
    localStorage.setItem(PRESETS_KEY, JSON.stringify(migratedStore));
    return migratedStore;
  } catch (_) {
    return { version: PRESET_SCHEMA_VERSION, presets: {} };
  }
}

function getPresets() {
  return readPresetStore().presets;
}

function savePreset(name, config, uiState = {}) {
  try {
    const store = readPresetStore();
    store.presets[name] = {
      config: sanitizeConfigSnapshot(config),
      ui: {
        panelWidth: Number.isFinite(uiState.panelWidth) ? uiState.panelWidth : undefined,
        bounds: uiState.bounds && typeof uiState.bounds === "object" ? uiState.bounds : undefined,
      },
      meta: { updatedAt: Date.now() }
    };
    localStorage.setItem(PRESETS_KEY, JSON.stringify(store));
  } catch (_) {}
}

function loadPreset(name) {
  const presets = getPresets();
  const p = presets[name];
  if (!p) return false;

  const configSnapshot = (p.config && typeof p.config === "object") ? p.config : p;
  Object.assign(CONFIG, sanitizeConfigSnapshot(configSnapshot));
  saveSocialFieldConfig(CONFIG);

  const ui = p.ui && typeof p.ui === "object" ? p.ui : null;
  if (ui) {
    try {
      if (Number.isFinite(ui.panelWidth)) {
        localStorage.setItem(PANEL_WIDTH_KEY, String(Math.min(520, Math.max(120, Math.round(ui.panelWidth)))));
      }
      if (ui.bounds && typeof ui.bounds === "object") {
        localStorage.setItem(PANEL_BOUNDS_KEY, JSON.stringify(ui.bounds));
      }
    } catch (_) {}
  }

  return true;
}

function deletePreset(name) {
  try {
    const store = readPresetStore();
    delete store.presets[name];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(store));
  } catch (_) {}
}

// ─── CPU: spatial grid ───────────────────────────────────────────────────────
function wrapDelta(delta, size) {
  if (size <= 0) return delta;
  if (delta > size * 0.5) return delta - size;
  if (delta < -size * 0.5) return delta + size;
  return delta;
}

function buildGrid() {
  const cellSize = Math.max(1, CONFIG.VISION_RADIUS);
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const grid = new Map();
  for (const a of agents) {
    const cx = ((Math.floor(a.x / cellSize) % cols) + cols) % cols;
    const cy = ((Math.floor(a.y / cellSize) % rows) + rows) % rows;
    const k = `${cx},${cy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(a);
  }
  return { grid, cellSize, cols, rows };
}

function getNeighbors(grid, cellSize, cols, rows, x, y) {
  const cx = ((Math.floor(x / cellSize) % cols) + cols) % cols;
  const cy = ((Math.floor(y / cellSize) % rows) + rows) % rows;
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = (cx + dx + cols) % cols;
      const ny = (cy + dy + rows) % rows;
      const bucket = grid.get(`${nx},${ny}`);
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

// ─── CPU: physics simulation ─────────────────────────────────────────────────
function simulateCpu(dt) {
  if (agents.length === 0) return;

  const { grid, cellSize, cols, rows } = buildGrid();
  const vr  = CONFIG.VISION_RADIUS;
  const vr2 = vr * vr;
  const seenPairs = new Set();

  const accX = new Float64Array(agents.length);
  const accY = new Float64Array(agents.length);

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const neighbors = getNeighbors(grid, cellSize, cols, rows, a.x, a.y);

    for (const b of neighbors) {
      if (b.id === a.id) continue;

      const dx = wrapDelta(b.x - a.x, width);
      const dy = wrapDelta(b.y - a.y, height);
      const d2 = dx * dx + dy * dy;
      if (d2 >= vr2 || d2 < 0.0001) continue;

      const d  = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;

      const pairKey = relKey(a.id, b.id);
      const nearFactor = Math.max(0, 1 - d / Math.max(1, vr));
      const relationTickWeight = nearFactor * nearFactor;
      if (relationTickWeight > 0.001 && !seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        addRel(a.id, b.id, CONFIG.RELATIONSHIP_TICK_RATE * dt * relationTickWeight);
      }

      const rel = getRel(a.id, b.id);
      const relNorm = Math.min(1, rel / Math.max(1, CONFIG.MAX_RELATIONSHIP));
      const relAttractionCurve = relNorm * relNorm;
      const relMultiplier = 1 + relAttractionCurve * 2;
      const reduction = Math.pow(relNorm, CONFIG.BOUNDARY_CURVE) * CONFIG.BOUNDARY_REDUCTION_MAX;
      const hardScale = Math.max(0.05, CONFIG.HARD_REPULSION / 4);
      const softScale = Math.max(0.05, CONFIG.SOFT_REPULSION_SCALE / 5);
      const aRadius = getAgentRadiusFromAspectPx(a.aspectD);
      const bRadius = getAgentRadiusFromAspectPx(b.aspectD);

      // Signed channel contribution: +1 means matching aspect, -1 means opposite.
      // Threshold creates a dead zone around 0 to suppress weak signals.
      const channelForce = (diff, threshold) => {
        const similarity = 1 - diff;
        const signed = similarity * 2 - 1;
        const t = Math.max(0, Math.min(0.95, threshold));
        const mag = Math.max(0, Math.abs(signed) - t) / Math.max(0.0001, 1 - t);
        return Math.sign(signed) * mag;
      };

      let aspectSigned = 0;
      let aspectWeight = 0;
      const aspectsActive = CONFIG.ENABLE_ASPECTS || (
        CONFIG.ASPECT_FORCE_SCALE > 0 && (
          CONFIG.ASPECT_A_STRENGTH > 0 ||
          CONFIG.ASPECT_B_STRENGTH > 0 ||
          CONFIG.ASPECT_C_STRENGTH > 0 ||
          CONFIG.ASPECT_D_STRENGTH > 0
        )
      );
      if (aspectsActive) {
        const channels = [
          [Math.abs(a.aspectA - b.aspectA), CONFIG.ASPECT_A_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD, CONFIG.ASPECT_A_STRENGTH],
          [Math.abs(a.aspectB - b.aspectB), CONFIG.ASPECT_B_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD, CONFIG.ASPECT_B_STRENGTH],
          [Math.abs(a.aspectC - b.aspectC), CONFIG.ASPECT_C_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD, CONFIG.ASPECT_C_STRENGTH],
          [Math.abs(a.aspectD - b.aspectD), CONFIG.ASPECT_D_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD, CONFIG.ASPECT_D_STRENGTH],
        ];
        for (const [diff, threshold, strength] of channels) {
          if (strength <= 0) continue;
          aspectSigned += channelForce(diff, threshold) * strength;
          aspectWeight += strength;
        }
      }

      const aspectNorm = aspectWeight > 0 ? (aspectSigned / aspectWeight) : 0;
      // New repulsion logic: overlap = dist - (r1+r2)*hardRepulsion
      const overlapDist = d - (aRadius + bRadius) * CONFIG.HARD_REPULSION;
      let repulsionK = 0;
      if (overlapDist < 0) {
        // Agents are penetrating; calculate repulsion strength
        repulsionK = -Math.min(1, Math.abs(overlapDist) / Math.max(0.0001, CONFIG.SOFT_REPULSION_SCALE));
      }
      
      const pairScalar = Math.max(-1, Math.min(1, aspectNorm * CONFIG.ASPECT_FORCE_SCALE + repulsionK));
      const distanceFalloff = 0.25 + 0.75 * Math.max(0, 1 - d / Math.max(1, vr));
      let force = pairScalar * relMultiplier * CONFIG.ATTRACTION_SCALE * distanceFalloff;

      accX[i] += force * nx;
      accY[i] += force * ny;
    }
  }

  if (CONFIG.RELATIONSHIP_DECAY > 0) {
    decayAccumulator += dt;
    if (decayAccumulator >= (CONFIG.DECAY_BATCH_INTERVAL / 60)) {
      const decay = CONFIG.RELATIONSHIP_DECAY * decayAccumulator;
      const toDelete = [];
      for (const [k, v] of relationships) {
        const nv = v - decay;
        if (nv <= 0) toDelete.push(k);
        else relationships.set(k, nv);
      }
      for (const k of toDelete) relationships.delete(k);

      const maxRelEntries = Math.max(1024, agents.length * 64);
      if (relationships.size > maxRelEntries) {
        const overflow = relationships.size - maxRelEntries;
        const weakest = [...relationships.entries()]
          .sort((a, b) => a[1] - b[1])
          .slice(0, overflow);
        for (const [k] of weakest) relationships.delete(k);
      }

      decayAccumulator = 0;
    }
  }

  const sl = CONFIG.SPEED_LIMIT;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    a.vx = (a.vx + accX[i] * dt) * CONFIG.FRICTION;
    a.vy = (a.vy + accY[i] * dt) * CONFIG.FRICTION;

    const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (spd > sl) { a.vx = (a.vx / spd) * sl; a.vy = (a.vy / spd) * sl; }

    a.x += a.vx;
    a.y += a.vy;

    a.x = ((a.x % w) + w) % w;
    a.y = ((a.y % h) + h) % h;
  }
}

// ─── CPU: render ────────────────────────────────────────────────────────────
function drawCpu() {
  if (!ensureCpuContext()) return;

  ctx.fillStyle = "#08080e";
  ctx.fillRect(0, 0, width, height);

  const vr  = CONFIG.VISION_RADIUS;
  const vr2 = vr * vr;

  if (CONFIG.SHOW_VISION) {
    ctx.lineWidth   = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (const a of agents) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, vr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (CONFIG.SHOW_CONNECTIONS) {
    ctx.lineWidth = 1;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      for (let j = i + 1; j < agents.length; j++) {
        const b = agents[j];
        const dx = wrapDelta(b.x - a.x, width);
        const dy = wrapDelta(b.y - a.y, height);
        if (dx * dx + dy * dy >= vr2) continue;

        const rel = getRel(a.id, b.id);
        const relNorm = rel / Math.max(0.0001, CONFIG.MAX_RELATIONSHIP);
        const minRel = Math.min(0.999, Math.max(0, CONFIG.CONNECTION_MIN_RELATION_NORM || 0));
        if (relNorm < minRel) continue;
        const alpha = ((relNorm - minRel) / Math.max(0.0001, 1 - minRel)) * CONFIG.CONNECTION_ALPHA_MAX;
        if (alpha < 0.01) continue;

        const t = relNorm;
        const hue = 220 + t * 110;
        ctx.strokeStyle = `hsla(${hue},75%,65%,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + dx, a.y + dy);
        ctx.stroke();
      }
    }
  }

  const radiusRange = getAgentRadiusRangePx();
  const rLo = radiusRange.min;
  const rHi = radiusRange.max;
  for (const a of agents) {
    const tSize = Math.min(1, Math.max(0, Number(a.aspectD) || 0));
    const r = rLo + (rHi - rLo) * tSize;
    const maxF  = Math.max(0.001, CONFIG.DEFAULT_FRIENDLINESS * 2);
    const fNorm = Math.min(1, a.friendliness / maxF);
    const baseLightness = 40 + fNorm * 35;
    const brightnessFactor = 0.65 + 0.7 * a.aspectC;
    const lightness = Math.max(18, Math.min(92, baseLightness * brightnessFactor));

    const hue = a.aspectA * 360;
    const color = `hsl(${hue.toFixed(1)},75%,${lightness.toFixed(1)}%)`;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function replaceCanvasNode() {
  if (!canvas?.parentElement) return false;

  const oldCanvas = canvas;
  const newCanvas = document.createElement("canvas");
  newCanvas.className = oldCanvas.className;
  oldCanvas.parentElement.replaceChild(newCanvas, oldCanvas);

  if (onPointerDown) {
    oldCanvas.removeEventListener("pointerdown", onPointerDown);
    newCanvas.addEventListener("pointerdown", onPointerDown);
  }

  canvas = newCanvas;
  ctx = null;
  gpuContext = null;
  resize();
  return true;
}

function ensureCpuContext() {
  if (ctx) return true;
  if (!canvas) return false;

  let nextCtx = canvas.getContext("2d");
  if (!nextCtx) {
    // Если canvas уже связан с другим типом контекста, пересоздаем узел и пробуем снова.
    if (!replaceCanvasNode()) return false;
    nextCtx = canvas.getContext("2d");
  }

  if (!nextCtx) {
    console.error("Не удалось получить 2D контекст для CPU режима");
    return false;
  }

  ctx = nextCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

async function rebuildGpuForAgentCount() {
  if (!useGpu) return;
  if (gpuRebuildInFlight) {
    await gpuRebuildInFlight;
    return;
  }

  gpuRebuildInFlight = (async () => {
    releaseGpu();
    const ok = await initGpu();
    if (!ok) {
      ensureCpuContext();
      if (modeLabel) modeLabel.textContent = "mode: cpu";
      return;
    }
    if (modeLabel) modeLabel.textContent = "mode: webgpu";
  })();

  try {
    await gpuRebuildInFlight;
  } finally {
    gpuRebuildInFlight = null;
  }
}

// ─── GPU: helper functions ───────────────────────────────────────────────────
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hexToRgba(hex) {
  const h = (hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [1, 1, 1, 1];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

function computeGridSize() {
  const radius = Math.max(0.01, CONFIG.VISION_RADIUS / Math.max(1, width));
  let gx = Math.max(1, Math.ceil(1 / radius));
  let gy = gx;
  while (gx * gy > GRID_MAX_CELLS && gx > 1 && gy > 1) {
    gx -= 1;
    gy -= 1;
  }
  return { gx, gy, count: gx * gy };
}

function getConfiguredAgentCount() {
  const raw = Number(CONFIG.INITIAL_AGENT_COUNT);
  if (!Number.isFinite(raw)) {
    const fallback = Math.max(1, Math.floor(DEFAULT_SOCIAL_FIELD_CONFIG.INITIAL_AGENT_COUNT || 24));
    CONFIG.INITIAL_AGENT_COUNT = fallback;
    return fallback;
  }
  const clamped = Math.max(1, Math.min(200000, Math.floor(raw)));
  CONFIG.INITIAL_AGENT_COUNT = clamped;
  return clamped;
}

function getAgentRadiusRangePx() {
  const rMin = Math.max(0.05, Number(CONFIG.AGENT_RADIUS_MIN) || 0.35);
  const rMaxRaw = Math.max(0.05, Number(CONFIG.AGENT_RADIUS_MAX) || 7);
  return { min: Math.min(rMin, rMaxRaw), max: Math.max(rMin, rMaxRaw) };
}

function getAgentRadiusFromAspectPx(aspectD) {
  const range = getAgentRadiusRangePx();
  const t = Math.min(1, Math.max(0, Number(aspectD) || 0));
  return range.min + (range.max - range.min) * t;
}

function nextPowerOfTwo(v) {
  let n = 1;
  while (n < v) n <<= 1;
  return n;
}

function computeRelationTableSize(count) {
  const target = Math.max(REL_TABLE_MIN_SIZE, count * 64);
  return Math.min(REL_TABLE_MAX_SIZE, nextPowerOfTwo(target));
}

function computeRelationProbeCount(count) {
  const expectedActive = Math.max(1, count * 24);
  const load = expectedActive / Math.max(1, relationTableSize);
  if (load < 0.20) return 8;
  if (load < 0.35) return 12;
  if (load < 0.50) return 16;
  return 24;
}

// ─── GPU: compute shader ─────────────────────────────────────────────────────
function getComputeShader() {
  return `
struct AgentState {
  pos : vec2<f32>,
  vel : vec2<f32>,
}

struct AgentTraits {
  params : vec4<f32>,
  aspects : vec4<f32>,
  visual : vec4<f32>,
}

struct SimParams {
  dt : f32,
  count : u32,
  gridX : u32,
  gridY : u32,
  interactionRadius : f32,
  personalSpace : f32,
  attraction : f32,
  repulsion : f32,
  speedLimit : f32,
  damping : f32,
  globalJitter : f32,
  pointSize : f32,
  sampleCount : u32,
  maxCellCap : u32,
  maxNeighbors : u32,
  clearCellCount : u32,

  aspectForceScale : f32,
  aspectAThreshold : f32,
  aspectAStrength : f32,
  aspectBStrength : f32,

  aspectBThreshold : f32,
  aspectCThreshold : f32,
  aspectDThreshold : f32,
  aspectCStrength : f32,
  aspectDStrength : f32,
  hardRepulsion : f32,
  softRepulsion : f32,

   relationshipTickRate : f32,
   relationshipDecayAmount : f32,
   maxRelationship : f32,
   boundaryReductionMax : f32,

   boundaryCurve : f32,
   relationValueScale : f32,
   relationTableMask : u32,
   relationProbeCount : u32,
   decayStart : u32,
   decayCount : u32,
}

@group(0) @binding(0) var<storage, read> srcAgents : array<AgentState>;
@group(0) @binding(1) var<storage, read_write> dstAgents : array<AgentState>;
@group(0) @binding(2) var<storage, read> traits : array<AgentTraits>;
@group(0) @binding(3) var<storage, read_write> cellCounts : array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellAgents : array<u32>;
@group(0) @binding(5) var<uniform> params : SimParams;
@group(0) @binding(6) var<storage, read_write> relKeys : array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> relValues : array<atomic<u32>>;

fn hash32(v : u32) -> u32 {
  var x = v * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return (x >> 22u) ^ x;
}

fn hashPair(a : u32, b : u32) -> u32 {
  let lo = min(a, b);
  let hi = max(a, b);
  return hash32((lo * 73856093u) ^ (hi * 19349663u));
}

fn wrapDelta(d : f32) -> f32 {
  if (d > 0.5) { return d - 1.0; }
  if (d < -0.5) { return d + 1.0; }
  return d;
}

fn wrapCoord(v : i32, m : i32) -> i32 {
  let r = v % m;
  return select(r + m, r, r >= 0);
}

fn channelForce(diff : f32, threshold : f32) -> f32 {
  let similarity = 1.0 - diff;
  let signed = similarity * 2.0 - 1.0;
  let t = clamp(threshold, 0.0, 0.95);
  let mag = max(0.0, abs(signed) - t) / max(0.0001, 1.0 - t);
  return sign(signed) * mag;
}

fn cellIndexFromPos(pos : vec2<f32>) -> u32 {
  let gx = max(1u, params.gridX);
  let gy = max(1u, params.gridY);
  let fx = clamp(pos.x, 0.0, 0.999999);
  let fy = clamp(pos.y, 0.0, 0.999999);
  let cx = min(u32(floor(fx * f32(gx))), gx - 1u);
  let cy = min(u32(floor(fy * f32(gy))), gy - 1u);
  return cy * gx + cx;
}

fn getOrCreateRelSlot(pairHash : u32) -> i32 {
  let key = pairHash + 1u;
  let mask = params.relationTableMask;
  var idx = pairHash & mask;

  for (var step : u32 = 0u; step < params.relationProbeCount; step = step + 1u) {
    let cur = atomicLoad(&relKeys[idx]);
    if (cur == key) { return i32(idx); }

    if (cur == 0u) {
      let cas = atomicCompareExchangeWeak(&relKeys[idx], 0u, key);
      if (cas.old_value == 0u || cas.old_value == key) {
        return i32(idx);
      }
    }

    idx = (idx + 1u) & mask;
  }

  return -1;
}

fn findRelSlot(pairHash : u32) -> i32 {
  let key = pairHash + 1u;
  let mask = params.relationTableMask;
  var idx = pairHash & mask;

  for (var step : u32 = 0u; step < params.relationProbeCount; step = step + 1u) {
    let cur = atomicLoad(&relKeys[idx]);
    if (cur == key) { return i32(idx); }
    if (cur == 0u) { return -1; }
    idx = (idx + 1u) & mask;
  }

  return -1;
}

fn readRelationship(slot : i32) -> f32 {
  if (slot < 0) { return 0.0; }
  let raw = atomicLoad(&relValues[u32(slot)]);
  return f32(raw) / max(1.0, params.relationValueScale);
}

@compute @workgroup_size(128)
fn decayRelations(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= params.decayCount) { return; }
  let i = params.decayStart + gid.x;
  if (i > params.relationTableMask) { return; }

  let key = atomicLoad(&relKeys[i]);
  if (key == 0u) { return; }

  let decayStep = u32(round(max(0.0, params.relationshipDecayAmount) * max(1.0, params.relationValueScale)));
  if (decayStep == 0u) { return; }

  let v = atomicLoad(&relValues[i]);
  if (v <= decayStep) {
    atomicStore(&relValues[i], 0u);
    atomicStore(&relKeys[i], 0u);
  } else {
    atomicStore(&relValues[i], v - decayStep);
  }
}

@compute @workgroup_size(128)
fn clearCells(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= params.clearCellCount) { return; }
  atomicStore(&cellCounts[i], 0u);
}

@compute @workgroup_size(128)
fn buildGrid(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) { return; }

  let idx = cellIndexFromPos(srcAgents[i].pos);
  let slot = atomicAdd(&cellCounts[idx], 1u);
  if (slot < params.maxCellCap) {
    cellAgents[idx * params.maxCellCap + slot] = i;
  }
}

@compute @workgroup_size(128)
fn simulate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) { return; }

  let selfState = srcAgents[i];
  let selfTraits = traits[i];
  var force = vec2<f32>(0.0, 0.0);

  let radius = max(params.interactionRadius, 0.0001);
  let gx = max(1u, params.gridX);
  let gy = max(1u, params.gridY);
  let gxI = i32(gx);
  let gyI = i32(gy);

  let cell = cellIndexFromPos(selfState.pos);
  let cx = i32(cell % gx);
  let cy = i32(cell / gx);

  var seen : u32 = 0u;

  for (var oy = -1; oy <= 1; oy = oy + 1) {
    for (var ox = -1; ox <= 1; ox = ox + 1) {
      if (seen >= params.maxNeighbors) {
        continue;
      }

      let nx = u32(wrapCoord(cx + ox, gxI));
      let ny = u32(wrapCoord(cy + oy, gyI));
      let nCell = ny * gx + nx;
      let rawCount = atomicLoad(&cellCounts[nCell]);
      let bucketCount = min(rawCount, params.maxCellCap);

      for (var k : u32 = 0u; k < bucketCount; k = k + 1u) {
        if (seen >= params.maxNeighbors) {
          break;
        }

        let j = cellAgents[nCell * params.maxCellCap + k];
        if (j == i) { continue; }

        let other = srcAgents[j];
        let delta = vec2<f32>(
          wrapDelta(other.pos.x - selfState.pos.x),
          wrapDelta(other.pos.y - selfState.pos.y)
        );
        let dist = length(delta);
        if (dist <= 0.00001 || dist >= radius) { continue; }

        let pairHash = hashPair(i, j);
        var relSlot = findRelSlot(pairHash);
        let nearFactor = max(0.0, 1.0 - dist / radius);
        let relationTickWeight = nearFactor * nearFactor;
        if (relationTickWeight > 0.001 && i < j) {
          if (relSlot < 0) {
            relSlot = getOrCreateRelSlot(pairHash);
          }
          if (relSlot >= 0) {
            let tickInc = u32(round(max(0.0, params.relationshipTickRate * params.dt * relationTickWeight) * max(1.0, params.relationValueScale)));
            if (tickInc > 0u) {
              let _prevRel = atomicAdd(&relValues[u32(relSlot)], tickInc);
            }
          }
        }

        let otherTraits = traits[j];
        let dir = delta / dist;
        let rel = min(params.maxRelationship, readRelationship(relSlot));
        let relNorm = clamp(rel / max(0.0001, params.maxRelationship), 0.0, 1.0);
        let relAttractionCurve = relNorm * relNorm;
        let relMultiplier = 1.0 + relAttractionCurve * 2.0;
        let reduction = pow(relNorm, max(0.0001, params.boundaryCurve)) * params.boundaryReductionMax;
        let hardScale = max(0.05, params.hardRepulsion / 4.0);
        let softScale = max(0.05, params.softRepulsion / 5.0);
        let selfRenderRadius = params.personalSpace + (params.pointSize - params.personalSpace) * clamp(selfTraits.visual.x, 0.0, 1.0);
        let otherRenderRadius = params.personalSpace + (params.pointSize - params.personalSpace) * clamp(otherTraits.visual.x, 0.0, 1.0);
        let distFalloff = max(0.0, 1.0 - dist / radius);

        var pairForce = 0.0;
        let aspectsActive = params.aspectForceScale > 0.0 && (params.aspectAStrength + params.aspectBStrength + params.aspectCStrength + params.aspectDStrength) > 0.0;

        if (aspectsActive) {
          let dA = abs(selfTraits.aspects.x - otherTraits.aspects.x);
          let dB = abs(selfTraits.aspects.y - otherTraits.aspects.y);
          let dC = abs(selfTraits.aspects.z - otherTraits.aspects.z);
          let dD = abs(selfTraits.aspects.w - otherTraits.aspects.w);

          let cA = channelForce(dA, params.aspectAThreshold) * params.aspectAStrength;
          let cB = channelForce(dB, params.aspectBThreshold) * params.aspectBStrength;
          let cC = channelForce(dC, params.aspectCThreshold) * params.aspectCStrength;
          let cD = channelForce(dD, params.aspectDThreshold) * params.aspectDStrength;

          let w = max(0.0001, params.aspectAStrength + params.aspectBStrength + params.aspectCStrength + params.aspectDStrength);
          let aspectNorm = (cA + cB + cC + cD) / w;
          pairForce = clamp(aspectNorm * params.aspectForceScale, -1.0, 1.0);
        }

        var distanceSigned = 0.0;
        // New repulsion logic: overlap = dist - (r1+r2)*hardRepulsion
        let overlapDist = dist - (selfRenderRadius + otherRenderRadius) * params.hardRepulsion;
        if (overlapDist < 0.0) {
          // Agents are penetrating; calculate repulsion strength
          distanceSigned = -min(1.0, abs(overlapDist) / max(0.0001, params.softRepulsion));
        }

        let pairScalar = clamp(pairForce + distanceSigned, -1.0, 1.0);
        let distGain = 0.25 + 0.75 * distFalloff;
        pairForce = pairScalar * relMultiplier * params.attraction * distGain;

        force += dir * pairForce;

        seen = seen + 1u;
      }
    }
  }

  let n0 = f32(hash32(i * 92821u + params.count) & 1023u) / 1023.0;
  let n1 = f32(hash32(i * 13331u + params.gridX) & 1023u) / 1023.0;
  force += vec2<f32>(n0 - 0.5, n1 - 0.5) * params.globalJitter * selfTraits.params.w;

  var vel = (selfState.vel + force * params.dt) * params.damping;
  let speed = length(vel);
  if (speed > params.speedLimit) {
    vel = vel / speed * params.speedLimit;
  }

  var pos = selfState.pos + vel * params.dt;
  pos = fract(pos + vec2<f32>(1.0, 1.0));

  dstAgents[i] = AgentState(pos, vel);
}
`;
}

// ─── GPU: render shader ──────────────────────────────────────────────────────
function getRenderShader() {
  return `
struct AgentState {
  pos : vec2<f32>,
  vel : vec2<f32>,
}

struct AgentTraits {
  params : vec4<f32>,
  aspects : vec4<f32>,
  visual : vec4<f32>,
}

struct RenderParams {
  pointSizeMin : f32,
  pointSizeMax : f32,
  invWidth : f32,
  invHeight : f32,
  color : vec4<f32>,
}

struct VsOut {
  @builtin(position) position : vec4<f32>,
  @location(0) localUv : vec2<f32>,
  @location(1) color : vec3<f32>,
}

@group(0) @binding(0) var<storage, read> agents : array<AgentState>;
@group(0) @binding(1) var<uniform> rp : RenderParams;
@group(0) @binding(2) var<storage, read> traits : array<AgentTraits>;

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VsOut {
  let offsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );

  let state = agents[instanceIndex];
  let tr = traits[instanceIndex];
  let center = vec2<f32>(state.pos.x * 2.0 - 1.0, 1.0 - state.pos.y * 2.0);
  let tSize = clamp(tr.visual.x, 0.0, 1.0);
  let radius = rp.pointSizeMin + (rp.pointSizeMax - rp.pointSizeMin) * tSize;
  let px = radius * 2.0 * rp.invWidth;
  let py = radius * 2.0 * rp.invHeight;
  let offset = offsets[vertexIndex] * vec2<f32>(px, py);

  // Aspect A -> R, Aspect B -> G, Aspect C -> B
  let color = vec3<f32>(
    clamp(tr.aspects.x, 0.0, 1.0),
    clamp(tr.aspects.y, 0.0, 1.0),
    clamp(tr.aspects.z, 0.0, 1.0)
  );

  var out : VsOut;
  out.position = vec4<f32>(center + offset, 0.0, 1.0);
  out.localUv = offsets[vertexIndex];
  out.color = color;
  return out;
}

@fragment
fn fsMain(in : VsOut) -> @location(0) vec4<f32> {
  let r = length(in.localUv);
  if (r > 1.0) { discard; }
  // Simple sharp circle, no glow or blur
  return vec4<f32>(in.color, 1.0);
}
`;
}

function getConnectionShader() {
  return `
struct AgentState {
  pos : vec2<f32>,
  vel : vec2<f32>,
}

struct ConnectionParams {
  invWidth : f32,
  invHeight : f32,
  visionRadius : f32,
  maxRelationship : f32,
  alphaMax : f32,
  relationValueScale : f32,
  relationTableMask : u32,
  relationProbeCount : u32,
  agentCount : u32,
  pairOffset : u32,
  minRelNorm : f32,
  pairStride : u32,
}

struct VsOut {
  @builtin(position) position : vec4<f32>,
  @location(0) alpha : f32,
}

@group(0) @binding(0) var<storage, read> agents : array<AgentState>;
@group(0) @binding(1) var<uniform> cp : ConnectionParams;
@group(0) @binding(2) var<storage, read> relKeys : array<u32>;
@group(0) @binding(3) var<storage, read> relValues : array<u32>;

fn hash32(v : u32) -> u32 {
  var x = v * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return (x >> 22u) ^ x;
}

fn hashPair(a : u32, b : u32) -> u32 {
  let lo = min(a, b);
  let hi = max(a, b);
  return hash32((lo * 73856093u) ^ (hi * 19349663u));
}

fn wrapDelta(d : f32) -> f32 {
  if (d > 0.5) { return d - 1.0; }
  if (d < -0.5) { return d + 1.0; }
  return d;
}

fn pairFromIndex(k : u32, n : u32) -> vec2<u32> {
  let nf = f32(n);
  let b = 2.0 * nf - 1.0;
  let disc = max(0.0, b * b - 8.0 * f32(k));
  let i = u32(floor((b - sqrt(disc)) * 0.5));
  let start = (i * (2u * n - i - 1u)) / 2u;
  let j = i + 1u + (k - start);
  return vec2<u32>(i, j);
}

fn findRelSlot(pairHash : u32) -> i32 {
  let key = pairHash + 1u;
  var idx = pairHash & cp.relationTableMask;
  for (var step : u32 = 0u; step < cp.relationProbeCount; step = step + 1u) {
    let cur = relKeys[idx];
    if (cur == key) { return i32(idx); }
    if (cur == 0u) { return -1; }
    idx = (idx + 1u) & cp.relationTableMask;
  }
  return -1;
}

fn shortestWrappedDelta(a : vec2<f32>, b : vec2<f32>) -> vec2<f32> {
  let dx = wrapDelta(b.x - a.x);
  let dy = wrapDelta(b.y - a.y);
  return vec2<f32>(dx, dy);
}

fn torusLineEndpoint(a : vec2<f32>, delta : vec2<f32>, useWrapped : bool) -> vec2<f32> {
  if (useWrapped) {
    return a + delta;
  }
  return a;
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VsOut {
  let n = cp.agentCount;
  let totalPairs = (n * (n - 1u)) / 2u;
  let stride = max(1u, cp.pairStride);
  let k = select((instanceIndex * stride + cp.pairOffset) % max(1u, totalPairs), instanceIndex, totalPairs <= 1u);
  let pair = pairFromIndex(k, n);
  let a = agents[pair.x];
  let b = agents[pair.y];

  let delta = shortestWrappedDelta(a.pos, b.pos);
  let dist = length(delta);

  var out : VsOut;
  if (dist <= 0.00001 || dist >= cp.visionRadius) {
    out.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  let pairHash = hashPair(pair.x, pair.y);
  let slot = findRelSlot(pairHash);
  var rel = 0.0;
  if (slot >= 0) {
    rel = f32(relValues[u32(slot)]) / max(1.0, cp.relationValueScale);
  }

  let relNorm = rel / max(0.0001, cp.maxRelationship);
  if (relNorm < cp.minRelNorm) {
    out.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  let alpha = clamp(((relNorm - cp.minRelNorm) / max(0.0001, 1.0 - cp.minRelNorm)) * cp.alphaMax, 0.0, cp.alphaMax);

  let endpoint = torusLineEndpoint(a.pos, delta, vertexIndex == 1u);
  let ndc = vec2<f32>(endpoint.x * 2.0 - 1.0, 1.0 - endpoint.y * 2.0);
  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.alpha = alpha;
  return out;
}

@fragment
fn fsMain(in : VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.92, 0.90, 0.85, in.alpha);
}
`;
}

// ─── GPU: write uniforms ─────────────────────────────────────────────────────
function writeSimUniforms(dt) {
  const grid = computeGridSize();
  const count = Math.max(1, gpuAgentCount || getConfiguredAgentCount());
  const radiusRange = getAgentRadiusRangePx();
  const radiusMinNorm = radiusRange.min / Math.max(1, width);
  const radiusMaxNorm = radiusRange.max / Math.max(1, width);
  const data = new ArrayBuffer(192);
  const f32 = new Float32Array(data);
  const u32 = new Uint32Array(data);

  let decayAmount = 0;
  gpuDecayStart = 0;
  gpuDecayCount = 0;
  if (CONFIG.RELATIONSHIP_DECAY > 0) {
    decayAccumulator += dt;
    const batchSec = CONFIG.DECAY_BATCH_INTERVAL / 60;
    if (decayAccumulator >= batchSec) {
      decayAmount = CONFIG.RELATIONSHIP_DECAY * decayAccumulator;
      decayAccumulator = 0;

      const chunkSize = Math.max(4096, Math.floor(relationTableSize / 16));
      gpuDecayCount = Math.min(Math.max(1, relationTableSize), chunkSize);
      gpuDecayStart = relationDecayCursor;

      const sweepFactor = relationTableSize / Math.max(1, gpuDecayCount);
      decayAmount *= sweepFactor;

      relationDecayCursor += gpuDecayCount;
      if (relationDecayCursor >= relationTableSize) relationDecayCursor = 0;
    }
  }
  gpuDecayStep = Math.max(0, Math.round(decayAmount * RELATION_VALUE_SCALE));

  f32[0] = dt;
  u32[1] = count;
  u32[2] = grid.gx;
  u32[3] = grid.gy;

  f32[4] = CONFIG.VISION_RADIUS / Math.max(1, width);
  f32[5] = radiusMinNorm;
  f32[6] = CONFIG.ATTRACTION_SCALE;
  f32[7] = CONFIG.SOFT_REPULSION_SCALE;

  f32[8] = CONFIG.SPEED_LIMIT / Math.max(1, width);
  f32[9] = CONFIG.FRICTION;
  f32[10] = 0.001;
  f32[11] = radiusMaxNorm;

  u32[12] = 4;
  u32[13] = GRID_MAX_CELL_CAPACITY;
  const maxNeighborsLimit = count > 40000 ? 48 : (count > 30000 ? 64 : (count > 20000 ? 96 : 192));
  u32[14] = maxNeighborsLimit;
  u32[15] = grid.count;

  const aspectsEnabled = CONFIG.ENABLE_ASPECTS || (
    CONFIG.ASPECT_FORCE_SCALE > 0 && (
      CONFIG.ASPECT_A_STRENGTH > 0 ||
      CONFIG.ASPECT_B_STRENGTH > 0 ||
      CONFIG.ASPECT_C_STRENGTH > 0 ||
      CONFIG.ASPECT_D_STRENGTH > 0
    )
  );
  f32[16] = aspectsEnabled ? CONFIG.ASPECT_FORCE_SCALE : 0;
  f32[17] = CONFIG.ASPECT_A_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD;
  f32[18] = CONFIG.ASPECT_A_STRENGTH;
  f32[19] = CONFIG.ASPECT_B_STRENGTH;
  f32[20] = CONFIG.ASPECT_B_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD;
  f32[21] = CONFIG.ASPECT_C_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD;
  f32[22] = CONFIG.ASPECT_D_THRESHOLD ?? CONFIG.ASPECT_REPEL_THRESHOLD;
  f32[23] = CONFIG.ASPECT_C_STRENGTH;
  f32[24] = CONFIG.ASPECT_D_STRENGTH;
  f32[25] = CONFIG.HARD_REPULSION;
  f32[26] = CONFIG.SOFT_REPULSION_SCALE;

  f32[27] = CONFIG.RELATIONSHIP_TICK_RATE;
  f32[28] = decayAmount;
  f32[29] = CONFIG.MAX_RELATIONSHIP;
  f32[30] = CONFIG.BOUNDARY_REDUCTION_MAX;

  f32[31] = CONFIG.BOUNDARY_CURVE;
  f32[32] = RELATION_VALUE_SCALE;
  u32[33] = Math.max(1, relationTableSize) - 1;
  u32[34] = computeRelationProbeCount(count);
  u32[35] = gpuDecayStart >>> 0;
  u32[36] = gpuDecayCount >>> 0;

  device.queue.writeBuffer(simUniformBuffer, 0, data);
}

function writeRenderUniforms() {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const color = hexToRgba("#f7f5f0");
  const pointSizeMin = Math.max(0.05, Number(CONFIG.AGENT_RADIUS_MIN) || 0.35);
  const pointSizeMaxRaw = Math.max(0.05, Number(CONFIG.AGENT_RADIUS_MAX) || 7);
  const pointSizeLo = Math.min(pointSizeMin, pointSizeMaxRaw);
  const pointSizeHi = Math.max(pointSizeMin, pointSizeMaxRaw);
  const data = new Float32Array([
    pointSizeLo * (window.devicePixelRatio || 1),
    pointSizeHi * (window.devicePixelRatio || 1),
    1 / w,
    1 / h,
    color[0], color[1], color[2], 1
  ]);
  device.queue.writeBuffer(renderUniformBuffer, 0, data);
}

function writeConnectionUniforms(count, pairOffset, pairStride) {
  const data = new ArrayBuffer(64);
  const f32 = new Float32Array(data);
  const u32 = new Uint32Array(data);

  f32[0] = 1 / Math.max(1, canvas.width);
  f32[1] = 1 / Math.max(1, canvas.height);
  f32[2] = CONFIG.VISION_RADIUS / Math.max(1, width);
  f32[3] = Math.max(0.0001, CONFIG.MAX_RELATIONSHIP);
  f32[4] = CONFIG.CONNECTION_ALPHA_MAX;
  f32[5] = RELATION_VALUE_SCALE;
  u32[6] = Math.max(1, relationTableSize) - 1;
  u32[7] = computeRelationProbeCount(count);
  u32[8] = count;
  u32[9] = pairOffset >>> 0;
  f32[10] = Math.min(0.999, Math.max(0, CONFIG.CONNECTION_MIN_RELATION_NORM || 0));
  u32[11] = Math.max(1, pairStride >>> 0);

  device.queue.writeBuffer(connectionUniformBuffer, 0, data);
}

// ─── GPU: initialization ─────────────────────────────────────────────────────
async function initGpu() {
  if (!navigator.gpu) {
    console.log("WebGPU не доступен на этом браузере");
    return false;
  }

  // Проверим canvas перед GPU инициализацией
  console.log("Canvas статус:", {
    inDOM: canvas && canvas.parentElement !== null,
    width: canvas?.width,
    height: canvas?.height,
    clientWidth: canvas?.clientWidth,
    clientHeight: canvas?.clientHeight
  });

  if (!canvas || !canvas.parentElement) {
    console.error("Canvas не в DOM");
    return false;
  }

  if (canvas.width === 0 || canvas.height === 0) {
    console.error("Canvas имеет размер 0x0, вызываю resize()");
    resize();
  }

  console.log("Инициализирую WebGPU...");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    console.log("Адаптер GPU не найден");
    return false;
  }

  try {
    device = await adapter.requestDevice();
    console.log("GPU device создан");
  } catch (e) {
    console.error("Ошибка создания GPU device:", e);
    return false;
  }

  // Убедимся что canvas готов
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    console.error("Canvas не инициализирован", { canvas, width: canvas?.width, height: canvas?.height });
    return false;
  }

  gpuContext = canvas.getContext("webgpu", {
    antialias: false
  });

  if (!gpuContext) {
    // Canvas мог быть уже захвачен 2D-контекстом; пробуем через пересоздание.
    if (replaceCanvasNode()) {
      gpuContext = canvas.getContext("webgpu", {
        antialias: false
      });
    }
  }
  
  if (!gpuContext) {
    console.error("WebGPU контекст недоступен (возможно браузер не поддерживает или требуется флаг)");
    console.log("Canvas info:", { width: canvas.width, height: canvas.height, inDOM: canvas.parentElement !== null });
    return false;
  }

  console.log("WebGPU контекст получен успешно");
  format = navigator.gpu.getPreferredCanvasFormat();
  console.log("Canvas format:", format);
  gpuContext.configure({ device, format, alphaMode: "premultiplied" });

  const count = getConfiguredAgentCount();
  gpuAgentCount = count;
  const stateStride = 16;
  const traitsStride = 48;
  relationTableSize = computeRelationTableSize(count);

  const states = new Float32Array(count * 4);
  const traits = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    states[i * 4 + 0] = Math.random();
    states[i * 4 + 1] = Math.random();
    states[i * 4 + 2] = (Math.random() - 0.5) * 0.001;
    states[i * 4 + 3] = (Math.random() - 0.5) * 0.001;

    const friendlyBase = CONFIG.DEFAULT_FRIENDLINESS;
    const friendlyVar = CONFIG.FRIENDLINESS_VARIANCE;
    const aspectA = Math.random();
    traits[i * 12 + 0] = Math.max(0, friendlyBase + (Math.random() - 0.5) * 2 * friendlyVar);

    const boundaryBase = CONFIG.DEFAULT_BASE_BOUNDARY / Math.max(1, width);
    const boundaryVar = CONFIG.BOUNDARY_VARIANCE / Math.max(1, width);
    traits[i * 12 + 1] = Math.max(0.0001, boundaryBase + (Math.random() - 0.5) * 2 * boundaryVar);

    traits[i * 12 + 2] = Math.max(0, CONFIG.DEFAULT_BOUNDARY_AMPLITUDE / Math.max(1, width));
    traits[i * 12 + 3] = 0.7 + Math.random() * 0.6;

    traits[i * 12 + 4] = aspectA;
    traits[i * 12 + 5] = Math.random();
    traits[i * 12 + 6] = Math.random();
    const aspectD = Math.random();
    traits[i * 12 + 7] = aspectD;

    traits[i * 12 + 8] = aspectD;  // visual.x = size based on aspect D
    traits[i * 12 + 9] = 0;
    traits[i * 12 + 10] = 0;
    traits[i * 12 + 11] = 0;
  }

  agentBuffers = [
    device.createBuffer({ size: count * stateStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }),
    device.createBuffer({ size: count * stateStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  ];

  traitsBuffer = device.createBuffer({ size: count * traitsStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  simUniformBuffer = device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  renderUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  connectionUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  cellCountsBuffer = device.createBuffer({
    size: GRID_MAX_CELLS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  cellAgentsBuffer = device.createBuffer({
    size: GRID_MAX_CELLS * GRID_MAX_CELL_CAPACITY * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  relationKeysBuffer = device.createBuffer({
    size: relationTableSize * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  relationValuesBuffer = device.createBuffer({
    size: relationTableSize * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  device.queue.writeBuffer(agentBuffers[0], 0, states);
  device.queue.writeBuffer(agentBuffers[1], 0, states);
  device.queue.writeBuffer(traitsBuffer, 0, traits);

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  });

  const computePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [computeBindGroupLayout]
  });

  try {
    const computeModule = device.createShaderModule({ code: getComputeShader() });
    const renderModule = device.createShaderModule({ code: getRenderShader() });
    const connectionModule = device.createShaderModule({ code: getConnectionShader() });

    decayPipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "decayRelations" }
    });

    clearPipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "clearCells" }
    });

    buildPipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "buildGrid" }
    });

    simulatePipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "simulate" }
    });

    renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vsMain" },
      fragment: {
        module: renderModule,
        entryPoint: "fsMain",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
          }
        }]
      },
      primitive: { topology: "triangle-list" }
    });

    connectionPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: connectionModule, entryPoint: "vsMain" },
      fragment: {
        module: connectionModule,
        entryPoint: "fsMain",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
          }
        }]
      },
      primitive: { topology: "line-list" }
    });
  } catch (e) {
    console.error("GPU shader compilation failed:", e);
    if (device && device.queue) {
      const errors = await device.popErrorScope?.();
      if (errors) console.error("GPU errors:", errors);
    }
    releaseGpu();
    return false;
  }

  computeBindGroups = [
    device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[0] } },
        { binding: 1, resource: { buffer: agentBuffers[1] } },
        { binding: 2, resource: { buffer: traitsBuffer } },
        { binding: 3, resource: { buffer: cellCountsBuffer } },
        { binding: 4, resource: { buffer: cellAgentsBuffer } },
        { binding: 5, resource: { buffer: simUniformBuffer } },
        { binding: 6, resource: { buffer: relationKeysBuffer } },
        { binding: 7, resource: { buffer: relationValuesBuffer } }
      ]
    }),
    device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[1] } },
        { binding: 1, resource: { buffer: agentBuffers[0] } },
        { binding: 2, resource: { buffer: traitsBuffer } },
        { binding: 3, resource: { buffer: cellCountsBuffer } },
        { binding: 4, resource: { buffer: cellAgentsBuffer } },
        { binding: 5, resource: { buffer: simUniformBuffer } },
        { binding: 6, resource: { buffer: relationKeysBuffer } },
        { binding: 7, resource: { buffer: relationValuesBuffer } }
      ]
    })
  ];

  renderBindGroups = [
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[0] } },
        { binding: 1, resource: { buffer: renderUniformBuffer } },
        { binding: 2, resource: { buffer: traitsBuffer } }
      ]
    }),
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[1] } },
        { binding: 1, resource: { buffer: renderUniformBuffer } },
        { binding: 2, resource: { buffer: traitsBuffer } }
      ]
    })
  ];

  connectionBindGroups = [
    device.createBindGroup({
      layout: connectionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[0] } },
        { binding: 1, resource: { buffer: connectionUniformBuffer } },
        { binding: 2, resource: { buffer: relationKeysBuffer } },
        { binding: 3, resource: { buffer: relationValuesBuffer } }
      ]
    }),
    device.createBindGroup({
      layout: connectionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[1] } },
        { binding: 1, resource: { buffer: connectionUniformBuffer } },
        { binding: 2, resource: { buffer: relationKeysBuffer } },
        { binding: 3, resource: { buffer: relationValuesBuffer } }
      ]
    })
  ];

  activeIndex = 0;
  useGpu = true;
  console.log("✅ WebGPU успешно инициализирован! Готов к работе с", CONFIG.INITIAL_AGENT_COUNT, "агентами");
  return true;
}

// ─── GPU: cleanup ───────────────────────────────────────────────────────────
function releaseGpu() {
  decayPipeline = null;
  connectionPipeline = null;
  clearPipeline = null;
  buildPipeline = null;
  simulatePipeline = null;
  renderPipeline = null;
  computeBindGroups = [];
  renderBindGroups = [];
  connectionBindGroups = [];
  agentBuffers = [];
  traitsBuffer = null;
  simUniformBuffer = null;
  renderUniformBuffer = null;
  connectionUniformBuffer = null;
  cellCountsBuffer = null;
  cellAgentsBuffer = null;
  relationKeysBuffer = null;
  relationValuesBuffer = null;
  gpuAgentCount = 0;
  relationTableSize = 0;
  gpuConnectionsBroken = false;
  gpuDecayStep = 0;
  gpuDecayStart = 0;
  gpuDecayCount = 0;
  relationDecayCursor = 0;
  device = null;
  gpuContext = null;
  useGpu = false;
}

// ─── GPU: simulation pass ────────────────────────────────────────────────────
function simulateGpu(dt) {
  if (!useGpu || !device) return;

  const t0 = performance.now();
  writeSimUniforms(dt);
  writeRenderUniforms();

  const count = Math.max(1, gpuAgentCount || getConfiguredAgentCount());
  let pairCountForDraw = 0;
  if (!gpuConnectionsBroken && CONFIG.SHOW_CONNECTIONS && count > 1 && connectionPipeline && connectionBindGroups.length === 2) {
    const totalPairs = Math.floor((count * (count - 1)) / 2);
    pairCountForDraw = Math.max(0, Math.min(totalPairs, MAX_GPU_CONNECTION_PAIRS));
    if (pairCountForDraw > 0) {
      const pairOffset = 0;
      const pairStride = totalPairs > pairCountForDraw
        ? Math.max(1, Math.floor(totalPairs / pairCountForDraw))
        : 1;
      writeConnectionUniforms(count, pairOffset, pairStride);
    }
  }
  const grid = computeGridSize();
  const encoder = device.createCommandEncoder();
  let t1 = t0;

  if (gpuDecayStep > 0 && gpuDecayCount > 0) {
    const decayPass = encoder.beginComputePass();
    decayPass.setPipeline(decayPipeline);
    decayPass.setBindGroup(0, computeBindGroups[activeIndex]);
    decayPass.dispatchWorkgroups(Math.ceil(gpuDecayCount / 128));
    decayPass.end();
  }
  frameDecayMs = performance.now() - t1;

  const clearPass = encoder.beginComputePass();
  clearPass.setPipeline(clearPipeline);
  clearPass.setBindGroup(0, computeBindGroups[activeIndex]);
  clearPass.dispatchWorkgroups(Math.ceil(grid.count / 128));
  clearPass.end();
  frameClearMs = performance.now() - t1; t1 = performance.now();

  const buildPass = encoder.beginComputePass();
  buildPass.setPipeline(buildPipeline);
  buildPass.setBindGroup(0, computeBindGroups[activeIndex]);
  buildPass.dispatchWorkgroups(Math.ceil(count / 128));
  buildPass.end();
  frameBuildMs = performance.now() - t1; t1 = performance.now();

  const simPass = encoder.beginComputePass();
  simPass.setPipeline(simulatePipeline);
  simPass.setBindGroup(0, computeBindGroups[activeIndex]);
  simPass.dispatchWorkgroups(Math.ceil(count / 128));
  simPass.end();
  frameSimMs = performance.now() - t1; t1 = performance.now();

  const bg = hexToRgba("#2b2622");
  const view = gpuContext.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });

  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroups[1 - activeIndex]);
  renderPass.draw(6, count);

  if (!gpuConnectionsBroken && CONFIG.SHOW_CONNECTIONS && count > 1 && connectionPipeline && connectionBindGroups.length === 2) {
    if (pairCountForDraw > 0) {
      renderPass.setPipeline(connectionPipeline);
      renderPass.setBindGroup(0, connectionBindGroups[1 - activeIndex]);
      renderPass.draw(2, pairCountForDraw);
    }
  }

  renderPass.end();
  frameRenderMs = performance.now() - t1;

  try {
    device.queue.submit([encoder.finish()]);
  } catch (e) {
    if (!gpuConnectionsBroken && CONFIG.SHOW_CONNECTIONS) {
      console.error("GPU connections failed, disabling lines for this session:", e);
      gpuConnectionsBroken = true;
      return;
    }
    throw e;
  }
  activeIndex = 1 - activeIndex;
  
  const frameTime = performance.now() - t0;
  lastFrameMs = frameTime;
  fpsSmoothed = fpsSmoothed * 0.9 + (1000 / Math.max(1, frameTime)) * 0.1;
}

// ─── unified resize ─────────────────────────────────────────────────────────
function resize() {
  if (!canvas) return;
  dpr = window.devicePixelRatio || 1;
  width  = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  canvas.width  = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (useGpu && gpuContext && device) {
    gpuContext.configure({ device, format, alphaMode: "premultiplied" });
  }
}

// ─── control panel ───────────────────────────────────────────────────────────
function buildPanel() {
  controlsStyle = document.createElement("style");
  controlsStyle.textContent = `
    #sf-panel {
      --sf-canvas: #2b2622;
      --sf-canvas-soft: #383330;
      --sf-hairline: #3f3a36;
      --sf-ink: #f7f5f0;
      --sf-body: #c9c0ad;
      --sf-mute: #aea69c;
      --sf-primary: #f7f5f0;
      --sf-on-primary: #2b2622;
    }
    #sf-panel {
      position: fixed; top: 6px; right: 6px; z-index: 9999;
      background: var(--sf-canvas);
      border: 1px solid var(--sf-hairline);
      border-radius: 4px;
      color: var(--sf-body);
      font-family: Inter, "Inter Fallback", system-ui, -apple-system, sans-serif;
      font-size: 8px;
      line-height: 1.2;
      width: 166px;
      max-height: 76vh;
      overflow-y: auto;
      padding: 3px;
    }
    #sf-panel > summary {
      cursor: pointer;
      font-size: 9px;
      font-weight: 500;
      letter-spacing: -0.12px;
      color: var(--sf-ink);
      user-select: none;
      margin-bottom: 2px;
      padding: 1px;
    }
    #sf-panel .mode-label {
      font-size: 7px;
      color: var(--sf-mute);
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      margin-bottom: 2px;
      padding: 1px;
    }
    #sf-panel .panel-width-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      margin: 1px 1px 3px;
      color: var(--sf-mute);
      font-size: 7px;
    }
    #sf-panel .panel-width-input {
      width: 52px;
      min-width: 52px;
      text-align: right;
      color: var(--sf-ink);
      background: var(--sf-canvas-soft);
      border: 1px solid var(--sf-hairline);
      border-radius: 3px;
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 7px;
      line-height: 1.2;
      padding: 1px 2px;
      box-sizing: border-box;
    }
    #sf-panel .group {
      border: 1px solid var(--sf-hairline);
      border-radius: 4px;
      margin: 2px 0;
      background: var(--sf-canvas-soft);
      padding: 1px 2px 2px;
    }
    #sf-panel .group > summary {
      cursor: pointer;
      user-select: none;
      color: var(--sf-ink);
      font-size: 8px;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: uppercase;
      padding: 1px 0;
    }
    #sf-panel label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2px;
      margin: 1px 0;
    }
    #sf-panel input[type=range] {
      flex: 0 0 56px;
      max-width: 56px;
      accent-color: var(--sf-primary);
      height: 10px;
      appearance: none;
      background: transparent;
    }
    #sf-panel input[type=range]::-webkit-slider-runnable-track {
      height: 2px;
      background: var(--sf-hairline);
      border-radius: 999px;
    }
    #sf-panel input[type=range]::-webkit-slider-thumb {
      appearance: none;
      margin-top: -3px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      border: 1px solid var(--sf-primary);
      background: var(--sf-primary);
    }
    #sf-panel input[type=range]::-moz-range-track {
      height: 2px;
      background: var(--sf-hairline);
      border: 0;
      border-radius: 999px;
    }
    #sf-panel input[type=range]::-moz-range-thumb {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      border: 1px solid var(--sf-primary);
      background: var(--sf-primary);
    }
    #sf-panel input[type=checkbox] {
      accent-color: var(--sf-primary);
      width: 9px;
      height: 9px;
    }
    #sf-panel .name {
      flex: 1;
      color: var(--sf-body);
      font-size: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
      word-break: normal;
    }
    #sf-panel .bound-input {
      width: 36px;
      min-width: 36px;
      text-align: right;
      color: var(--sf-mute);
      background: var(--sf-canvas-soft);
      border: 1px solid var(--sf-hairline);
      border-radius: 3px;
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 7px;
      line-height: 1.2;
      padding: 1px 2px;
      box-sizing: border-box;
    }
    #sf-panel .live-val {
      min-width: 36px;
      text-align: right;
      color: var(--sf-mute);
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 7px;
      line-height: 1.2;
    }
    #sf-panel .actions {
      display: flex;
      gap: 2px;
      margin-top: 3px;
      flex-wrap: wrap;
    }
    #sf-panel button {
      flex: 1;
      min-width: 0;
      padding: 2px 3px;
      min-height: 18px;
      background: var(--sf-canvas-soft);
      border: 1px solid var(--sf-hairline);
      border-radius: 3px;
      color: var(--sf-ink);
      font-family: Inter, "Inter Fallback", system-ui, -apple-system, sans-serif;
      font-size: 8px;
      font-weight: 500;
      line-height: 1.1;
      letter-spacing: -0.1px;
      cursor: pointer;
    }
    #sf-panel button:hover {
      background: var(--sf-primary);
      color: var(--sf-on-primary);
      border-color: var(--sf-primary);
    }
    #sf-panel input[type=text],
    #sf-panel select {
      background: var(--sf-canvas-soft);
      border: 1px solid var(--sf-hairline);
      border-radius: 3px;
      color: var(--sf-ink);
      font-family: Inter, "Inter Fallback", system-ui, -apple-system, sans-serif;
      font-size: 8px;
      padding: 2px 3px;
    }
  `;
  document.head.appendChild(controlsStyle);

  controlsRoot = document.createElement("details");
  controlsRoot.id = "sf-panel";
  controlsRoot.open = true;
  controlsRoot.innerHTML = `<summary>social-field</summary>`;

  const modeDiv = document.createElement("div");
  modeDiv.className = "mode-label";
  modeLabel = document.createElement("span");
  modeLabel.textContent = useGpu ? "mode: webgpu" : "mode: cpu";
  modeDiv.appendChild(modeLabel);
  controlsRoot.appendChild(modeDiv);

  // Profiler display for GPU timings
  const profilerDiv = document.createElement("div");
  profilerDiv.className = "mode-label";
  profilerDiv.id = "sf-profiler";
  profilerDiv.style.fontSize = "7px";
  profilerDiv.style.fontFamily = "monospace";
  profilerDiv.style.color = "var(--sf-mute)";
  controlsRoot.appendChild(profilerDiv);

  const savedWidthRaw = localStorage.getItem(PANEL_WIDTH_KEY);
  const savedWidth = savedWidthRaw ? Number(savedWidthRaw) : 0;
  const panelWidth = Number.isFinite(savedWidth) && savedWidth >= 140 && savedWidth <= 420
    ? savedWidth
    : 166;
  let currentPanelWidth = panelWidth;
  controlsRoot.style.width = `${currentPanelWidth}px`;

  const widthRow = document.createElement("div");
  widthRow.className = "panel-width-row";
  const widthLabel = document.createElement("span");
  widthLabel.textContent = "panel width";
  const widthInput = document.createElement("input");
  widthInput.type = "text";
  widthInput.className = "panel-width-input";
  widthInput.value = String(Math.round(currentPanelWidth));

  const applyPanelWidth = () => {
    const raw = Number.parseFloat(widthInput.value.replace(",", "."));
    if (!Number.isFinite(raw)) {
      widthInput.value = String(Math.round(currentPanelWidth));
      return;
    }
    const clamped = Math.min(520, Math.max(120, Math.round(raw)));
    currentPanelWidth = clamped;
    controlsRoot.style.width = `${clamped}px`;
    widthInput.value = String(clamped);
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(clamped));
    } catch (_) {}
  };

  widthInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      applyPanelWidth();
      widthInput.blur();
    }
  });
  widthInput.addEventListener("blur", applyPanelWidth);

  widthRow.append(widthLabel, widthInput);
  controlsRoot.appendChild(widthRow);

  let boundsStore = {};
  try {
    const rawBounds = localStorage.getItem(PANEL_BOUNDS_KEY);
    boundsStore = rawBounds ? JSON.parse(rawBounds) : {};
  } catch (_) {
    boundsStore = {};
  }

  const saveBoundsStore = () => {
    try {
      localStorage.setItem(PANEL_BOUNDS_KEY, JSON.stringify(boundsStore));
    } catch (_) {}
  };

  for (const groupDef of PANEL_GROUPS) {
    const group = document.createElement("details");
    group.className = "group";
    group.open = groupDef.title === "world" || groupDef.title === "agent";
    group.innerHTML = `<summary>${groupDef.title}</summary>`;

    if (groupDef.keys) {
      for (const key of groupDef.keys) {
        if (!(key in CONFIG) || !(key in CONFIG_RANGES)) continue;
        const range = CONFIG_RANGES[key];
        const label = document.createElement("label");
        const isInt = INTEGER_CONFIG_KEYS.has(key);
        const minInput = document.createElement("input");
        minInput.type = "text";
        minInput.className = "bound-input";

        const maxInput = document.createElement("input");
        maxInput.type = "text";
        maxInput.className = "bound-input";

        const liveVal = document.createElement("span");
        liveVal.className = "live-val";

        const fmt = (v) => isInt ? String(v) : (v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2));

        let minBound = range.min;
        let maxBound = range.max;
        const savedBounds = boundsStore[key];
        if (savedBounds && Number.isFinite(savedBounds.min) && Number.isFinite(savedBounds.max) && savedBounds.max > savedBounds.min) {
          minBound = savedBounds.min;
          maxBound = savedBounds.max;
        }

        minInput.value = fmt(minBound);
        maxInput.value = fmt(maxBound);
        liveVal.textContent = fmt(CONFIG[key]);

        const input = document.createElement("input");
        input.type = "range";
        input.min = "0";
        input.max = "1";
        input.step = "0.001";

        const clampToBounds = (v) => Math.min(maxBound, Math.max(minBound, v));
        const toT = (v) => {
          const span = Math.max(0.0000001, maxBound - minBound);
          return Math.min(1, Math.max(0, (v - minBound) / span));
        };
        const fromT = (t) => minBound + (maxBound - minBound) * t;
        input.value = String(toT(CONFIG[key]));

        const setFromNumeric = (raw) => {
          if (!Number.isFinite(raw)) return;
          const normalized = isInt ? Math.round(raw) : raw;
          CONFIG[key] = normalized;
          liveVal.textContent = fmt(normalized);
          input.value = String(toT(normalized));
          saveSocialFieldConfig(CONFIG);
        };

        input.addEventListener("input", () => {
          const t = Math.min(1, Math.max(0, parseFloat(input.value)));
          const raw = fromT(Number.isFinite(t) ? t : 0);
          setFromNumeric(raw);
        });

        const applyBoundInputs = () => {
          const parsedMin = Number.parseFloat(minInput.value.replace(",", "."));
          const parsedMax = Number.parseFloat(maxInput.value.replace(",", "."));
          if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMax <= parsedMin) {
            minInput.value = fmt(minBound);
            maxInput.value = fmt(maxBound);
            return;
          }

          minBound = parsedMin;
          maxBound = parsedMax;
          minInput.value = fmt(minBound);
          maxInput.value = fmt(maxBound);
          boundsStore[key] = { min: minBound, max: maxBound };
          saveBoundsStore();
          input.value = String(toT(CONFIG[key]));
        };

        minInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            applyBoundInputs();
            minInput.blur();
          }
        });
        maxInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            applyBoundInputs();
            maxInput.blur();
          }
        });
        minInput.addEventListener("blur", applyBoundInputs);
        maxInput.addEventListener("blur", applyBoundInputs);

        const nameSpan = document.createElement("span");
        nameSpan.className = "name";
        nameSpan.textContent = key.toLowerCase().replace(/_/g, " ");
        if (CONTROL_HINTS[key]) nameSpan.title = CONTROL_HINTS[key];

        label.append(nameSpan, minInput, input, maxInput, liveVal);
        group.appendChild(label);
      }
    }

    if (groupDef.boolKeys) {
      for (const key of groupDef.boolKeys) {
        if (!(key in CONFIG) || !BOOL_CONFIG_KEYS.has(key)) continue;
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!CONFIG[key];
        input.addEventListener("change", () => {
          CONFIG[key] = input.checked;
          saveSocialFieldConfig(CONFIG);
        });
        const nameSpan = document.createElement("span");
        nameSpan.className = "name";
        nameSpan.textContent = key.toLowerCase().replace(/_/g, " ");
        if (CONTROL_HINTS[key]) nameSpan.title = CONTROL_HINTS[key];
        label.append(nameSpan, input);
        group.appendChild(label);
      }
    }

    controlsRoot.appendChild(group);
  }

  // Presets
  const presetsGroup = document.createElement("details");
  presetsGroup.className = "group";
  presetsGroup.open = false;
  presetsGroup.innerHTML = `<summary>presets</summary>`;

  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.style.width = "100%";
  presetNameInput.style.boxSizing = "border-box";
  presetNameInput.style.marginBottom = "2px";
  presetNameInput.placeholder = "preset name";

  const presetsSelect = document.createElement("select");
  presetsSelect.style.width = "100%";
  presetsSelect.style.boxSizing = "border-box";
  presetsSelect.style.marginTop = "2px";
  presetsSelect.style.marginBottom = "2px";

  function updatePresetsSelect() {
    presetsSelect.innerHTML = "";
    const p = getPresets();
    presetsSelect.appendChild(Object.assign(document.createElement("option"), {
      value: "", textContent: "— select preset —"
    }));
    for (const key of Object.keys(p).sort()) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      presetsSelect.appendChild(opt);
    }
  }

  updatePresetsSelect();

  const btnSavePreset = document.createElement("button");
  btnSavePreset.textContent = "Save Preset";
  btnSavePreset.style.width = "100%";
  btnSavePreset.addEventListener("click", () => {
    const name = presetNameInput.value.trim();
    if (name) {
      savePreset(name, { ...CONFIG }, {
        panelWidth: currentPanelWidth,
        bounds: boundsStore,
      });
      presetNameInput.value = "";
      updatePresetsSelect();
    }
  });

  const presetBtnsRow = document.createElement("div");
  presetBtnsRow.style.display = "flex";
  presetBtnsRow.style.gap = "2px";
  presetBtnsRow.style.marginTop = "2px";

  const btnLoadPreset = document.createElement("button");
  btnLoadPreset.textContent = "Load";
  btnLoadPreset.style.flex = "1";
  btnLoadPreset.addEventListener("click", () => {
    const name = presetsSelect.value;
    if (name) {
      loadPreset(name);
      destroyPanel();
      buildPanel();
    }
  });

  const btnDelPreset = document.createElement("button");
  btnDelPreset.textContent = "Delete";
  btnDelPreset.style.flex = "1";
  btnDelPreset.addEventListener("click", () => {
    const name = presetsSelect.value;
    if (name) {
      deletePreset(name);
      updatePresetsSelect();
    }
  });

  presetBtnsRow.append(btnLoadPreset, btnDelPreset);
  presetsGroup.append(presetNameInput, btnSavePreset, presetsSelect, presetBtnsRow);
  controlsRoot.appendChild(presetsGroup);

  // Actions
  const actions = document.createElement("div");
  actions.className = "actions";

  const btnToggleGpu = document.createElement("button");
  btnToggleGpu.textContent = useGpu ? "GPU ✓" : "GPU (off)";
  btnToggleGpu.addEventListener("click", async () => {
    if (useGpu) {
      useGpu = false;
      releaseGpu();
      ensureCpuContext();
      modeLabel.textContent = "mode: cpu";
      btnToggleGpu.textContent = "GPU (off)";
    } else {
      const ok = await initGpu();
      if (ok) {
        modeLabel.textContent = "mode: webgpu";
        btnToggleGpu.textContent = "GPU ✓";
      }
    }
  });

  const btnReset = document.createElement("button");
  btnReset.textContent = "Reset Defaults";
  btnReset.addEventListener("click", () => {
    Object.assign(CONFIG, DEFAULT_SOCIAL_FIELD_CONFIG);
    saveSocialFieldConfig(CONFIG);
    destroyPanel();
    buildPanel();
  });

  const btnCopy = document.createElement("button");
  btnCopy.textContent = "Copy JSON";
  btnCopy.addEventListener("click", async () => {
    const text = JSON.stringify(CONFIG, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
  });

  actions.append(btnToggleGpu, btnReset, btnCopy);
  controlsRoot.appendChild(actions);

  document.body.appendChild(controlsRoot);
}

function destroyPanel() {
  if (controlsRoot?.parentElement) controlsRoot.parentElement.removeChild(controlsRoot);
  if (controlsStyle?.parentElement) controlsStyle.parentElement.removeChild(controlsStyle);
  controlsRoot = null;
  controlsStyle = null;
  modeLabel = null;
}

// ─── unified draw loop ───────────────────────────────────────────────────────
function frame(timestamp) {
  if (!alive) return;

  const dt = Math.min(0.1, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (useGpu && device) {
    try {
      simulateGpu(dt);
    } catch (e) {
      console.error("Ошибка GPU кадра, fallback на CPU:", e);
      releaseGpu();
      ensureCpuContext();
      if (modeLabel) modeLabel.textContent = "mode: cpu";
      simulateCpu(dt);
      drawCpu();
    }
  } else {
    simulateCpu(dt);
    drawCpu();
  }

  // Update profiler display
  const profilerEl = document.getElementById("sf-profiler");
  if (profilerEl && useGpu) {
    const fps = Math.round(fpsSmoothed);
    const total = Math.round((frameDecayMs + frameClearMs + frameBuildMs + frameSimMs + frameRenderMs) * 100) / 100;
    profilerEl.textContent = `${fps} fps | decay:${Math.round(frameDecayMs*10)/10}ms clear:${Math.round(frameClearMs*10)/10}ms build:${Math.round(frameBuildMs*10)/10}ms sim:${Math.round(frameSimMs*10)/10}ms`;
  }

  rafId = requestAnimationFrame(frame);
}

// ─── lifecycle ───────────────────────────────────────────────────────────────
export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  container.appendChild(canvas);

  onResize = () => resize();
  window.addEventListener("resize", onResize);
  resize();

  buildPanel();

  // Seed CPU agents (always)
  for (let i = 0; i < CONFIG.INITIAL_AGENT_COUNT; i++) {
    agents.push(createAgent(
      Math.random() * width,
      Math.random() * height,
    ));
  }

  // Click to spawn agents (CPU mode only)
  onPointerDown = async (e) => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);

    if (useGpu) {
      const nextCount = Math.min(200000, Math.max(1,
        Math.floor(CONFIG.INITIAL_AGENT_COUNT + CONFIG.AGENTS_TO_ADD_PER_CLICK)
      ));
      CONFIG.INITIAL_AGENT_COUNT = nextCount;
      saveSocialFieldConfig(CONFIG);
      await rebuildGpuForAgentCount();
      return;
    }

    for (let i = 0; i < CONFIG.AGENTS_TO_ADD_PER_CLICK; i++) {
      const dx = x + (Math.random() - 0.5) * 20;
      const dy = y + (Math.random() - 0.5) * 20;
      agents.push(createAgent(dx, dy));
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown);

  // Keyboard: spacebar to add agents
  const onKeyDown = async (e) => {
    if (e.code === "Space") {
      e.preventDefault();

      if (useGpu) {
        const nextCount = Math.min(200000, Math.max(1,
          Math.floor(CONFIG.INITIAL_AGENT_COUNT + CONFIG.AGENTS_TO_ADD_PER_CLICK)
        ));
        CONFIG.INITIAL_AGENT_COUNT = nextCount;
        saveSocialFieldConfig(CONFIG);
        await rebuildGpuForAgentCount();
        return;
      }

      for (let i = 0; i < CONFIG.AGENTS_TO_ADD_PER_CLICK; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        agents.push(createAgent(x, y));
      }
    }
  };
  window.addEventListener("keydown", onKeyDown);
  cleanupFns.push(() => window.removeEventListener("keydown", onKeyDown));
}

export function start() {
  alive = true;
  lastTime = performance.now();

  // GPU инициализируется в start() когда всё готово
  setupPromise = (async () => {
    if (navigator.gpu) {
      console.log("GPU инициализация в start()...");
      const ok = await initGpu();
      if (ok && modeLabel) {
        modeLabel.textContent = "mode: webgpu";
      }
    }
  })();

  if (setupPromise) {
    setupPromise.finally(() => {
      if (alive && !rafId) rafId = requestAnimationFrame(frame);
    });
  } else {
    rafId = requestAnimationFrame(frame);
  }
}

export function destroy() {
  alive = false;
  
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (onPointerDown && canvas) canvas.removeEventListener("pointerdown", onPointerDown);
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
  
  destroyPanel();
  releaseGpu();

  canvas = null;
  ctx = null;
  ctx2d = null;
  rafId = null;
  onResize = null;
  onPointerDown = null;
  agents = [];
  relationships.clear();
  gpuAgents = [];
  nextId = 0;
  setupPromise = null;
}
