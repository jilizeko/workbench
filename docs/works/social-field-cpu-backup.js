import {
  DEFAULT_SOCIAL_FIELD_CONFIG,
  loadSocialFieldConfig,
  saveSocialFieldConfig,
} from "./social-field.config.js";

// ─── module state ────────────────────────────────────────────────────────────
let canvas, ctx, rafId, onResize, onPointerDown;
let controlsRoot, controlsStyle;
let width = 0, height = 0, dpr = 1;
let lastTime = 0;
let agents = [];
let relationships = new Map(); // key "${minId}-${maxId}" → number
let nextId = 0;
const PANEL_WIDTH_KEY = "social-field-panel-width";
const PRESETS_KEY = "social-field-presets";
let decayAccumulator = 0;

const CONFIG = loadSocialFieldConfig();

// ─── config meta for panel ───────────────────────────────────────────────────
const INTEGER_CONFIG_KEYS = new Set([
  "INITIAL_AGENT_COUNT", "VISION_RADIUS", "MAX_RELATIONSHIP",
  "AGENT_RADIUS", "GLOW_INTENSITY", "DECAY_BATCH_INTERVAL",
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
  ASPECT_A_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_B_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_C_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  ASPECT_D_STRENGTH:        { min: 0,   max: 3,    step: 0.01  },
  BOUNDARY_REDUCTION_MAX:   { min: 0,   max: 1,    step: 0.01  },
  BOUNDARY_CURVE:           { min: 0.1, max: 6,    step: 0.1   },
  AGENT_RADIUS:             { min: 2,   max: 40,   step: 1     },
  GLOW_INTENSITY:           { min: 0,   max: 60,   step: 1     },
  CONNECTION_ALPHA_MAX:     { min: 0,   max: 1,    step: 0.01  },
  DECAY_BATCH_INTERVAL:     { min: 1,   max: 60,   step: 1     },
};

const PANEL_GROUPS = [
  {
    title: "world",
    keys: ["INITIAL_AGENT_COUNT", "VISION_RADIUS", "FRICTION", "SPEED_LIMIT"],
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
    keys: ["ASPECT_FORCE_SCALE", "ASPECT_REPEL_THRESHOLD", "ASPECT_A_STRENGTH", "ASPECT_B_STRENGTH", "ASPECT_C_STRENGTH", "ASPECT_D_STRENGTH"],
  },
  {
    title: "render",
    keys: ["AGENT_RADIUS", "GLOW_INTENSITY", "CONNECTION_ALPHA_MAX"],
  },
  {
    title: "toggles",
    boolKeys: ["SHOW_CONNECTIONS", "SHOW_VISION"],
  },
];

// ─── relationship helpers ────────────────────────────────────────────────────
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

// ─── agent factory ───────────────────────────────────────────────────────────
function createAgent(x, y) {
  const fv = CONFIG.FRIENDLINESS_VARIANCE;
  const bv = CONFIG.BOUNDARY_VARIANCE;
  return {
    id: nextId++,
    x, y,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    friendliness: Math.max(0, CONFIG.DEFAULT_FRIENDLINESS + (Math.random() - 0.5) * 2 * fv),
    baseBoundary: Math.max(5, CONFIG.DEFAULT_BASE_BOUNDARY + (Math.random() - 0.5) * 2 * bv),
    boundaryAmplitude: Math.max(0, CONFIG.DEFAULT_BOUNDARY_AMPLITUDE),
    aspectA: Math.random(),
    aspectB: Math.random(),
    aspectC: Math.random(),
    aspectD: Math.random(),
  };
}

// ─── presets ──────────────────────────────────────────────────────────────────
function getPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function savePreset(name, config) {
  try {
    const presets = getPresets();
    presets[name] = config;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (_) { /* ignore */ }
}

function loadPreset(name, presets) {
  const p = presets[name];
  if (p) {
    Object.assign(CONFIG, p);
    saveSocialFieldConfig(CONFIG);
    return true;
  }
  return false;
}

function deletePreset(name) {
  try {
    const presets = getPresets();
    delete presets[name];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (_) { /* ignore */ }
}

function wrapDelta(delta, size) {
  if (size <= 0) return delta;
  if (delta > size * 0.5) return delta - size;
  if (delta < -size * 0.5) return delta + size;
  return delta;
}

// ─── spatial grid ────────────────────────────────────────────────────────────
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

// ─── physics ─────────────────────────────────────────────────────────────────
function simulate(dt) {
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

      // Tick relationship once per pair per frame
      const pairKey = relKey(a.id, b.id);
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        addRel(a.id, b.id, CONFIG.RELATIONSHIP_TICK_RATE * dt);
      }

      // Effective boundary for agent a (friendship shrinks personal space)
      const rel       = getRel(a.id, b.id);
      const relFactor = Math.min(1, rel / CONFIG.MAX_RELATIONSHIP);
      const reduction = Math.pow(relFactor, CONFIG.BOUNDARY_CURVE) * CONFIG.BOUNDARY_REDUCTION_MAX;
      const bEff      = a.baseBoundary * (1 - reduction);
      const amp       = a.boundaryAmplitude;

      let force = 0;
      if (d > bEff) {
        // Attraction zone — stronger near boundary, weaker at vision edge
        const t = (d - bEff) / Math.max(1, vr - bEff);
        force = a.friendliness * CONFIG.ATTRACTION_SCALE * (1 - t * 0.6);
      } else if (amp > 0 && d > bEff - amp) {
        // Soft repulsion zone — quadratic rise toward inner wall
        const t = (bEff - d) / amp;
        force = -(t * t) * CONFIG.SOFT_REPULSION_SCALE;
      } else {
        // Hard-stop zone — inversely proportional to distance
        force = -CONFIG.HARD_REPULSION * bEff / Math.max(1, d);
      }

      const threshold = CONFIG.ASPECT_REPEL_THRESHOLD;
      const denomNear = Math.max(0.0001, threshold);
      const denomFar = Math.max(0.0001, 1 - threshold);
      const aspectDiffs = [
        Math.abs(a.aspectA - b.aspectA),
        Math.abs(a.aspectB - b.aspectB),
        Math.abs(a.aspectC - b.aspectC),
        Math.abs(a.aspectD - b.aspectD),
      ];
      const aspectStrengths = [
        CONFIG.ASPECT_A_STRENGTH,
        CONFIG.ASPECT_B_STRENGTH,
        CONFIG.ASPECT_C_STRENGTH,
        CONFIG.ASPECT_D_STRENGTH,
      ];
      if (CONFIG.ENABLE_ASPECTS) {
        let aspectForce = 0;
        for (let i = 0; i < aspectDiffs.length; i++) {
          const diff = aspectDiffs[i];
          const strength = aspectStrengths[i];
          if (diff <= threshold) {
            const closeness = 1 - diff / denomNear;
            aspectForce += closeness * CONFIG.ASPECT_FORCE_SCALE * strength;
          } else {
            const conflict = (diff - threshold) / denomFar;
            aspectForce -= conflict * CONFIG.ASPECT_FORCE_SCALE * strength;
          }
        }
        force += aspectForce / aspectDiffs.length;
      }

      accX[i] += force * nx;
      accY[i] += force * ny;
    }
  }

  // Batched relationship decay (once per N frames to reduce overhead)
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
      decayAccumulator = 0;
    }
  }

  // Integrate velocities and positions
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

    // Strict torus: boundary is exactly the screen extents.
    a.x = ((a.x % w) + w) % w;
    a.y = ((a.y % h) + h) % h;
  }
}

// ─── render ───────────────────────────────────────────────────────────────────
function draw(timestamp) {
  const dt = Math.min(0.1, (timestamp - lastTime) / 1000);
  lastTime  = timestamp;

  simulate(dt);

  ctx.fillStyle = "#08080e";
  ctx.fillRect(0, 0, width, height);

  const vr  = CONFIG.VISION_RADIUS;
  const vr2 = vr * vr;

  // Vision circles
  if (CONFIG.SHOW_VISION) {
    ctx.lineWidth   = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (const a of agents) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, vr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Connection lines
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
        const alpha = (rel / CONFIG.MAX_RELATIONSHIP) * CONFIG.CONNECTION_ALPHA_MAX;
        if (alpha < 0.01) continue;

        // Colour shifts from cool blue (low rel) to warm gold (high rel)
        const t = rel / CONFIG.MAX_RELATIONSHIP;
        const hue = 220 + t * 110;
        ctx.strokeStyle = `hsla(${hue},75%,65%,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + dx, a.y + dy);
        ctx.stroke();
      }
    }
  }

  // Agents
  const glowOn = CONFIG.GLOW_INTENSITY > 0;
  for (const a of agents) {
    const sizeFactor = 0.55 + 0.9 * a.aspectB;
    const r = CONFIG.AGENT_RADIUS * sizeFactor;
    // Friendliness maps to brightness
    const maxF  = Math.max(0.001, CONFIG.DEFAULT_FRIENDLINESS * 2);
    const fNorm = Math.min(1, a.friendliness / maxF);
    const baseLightness = 40 + fNorm * 35;
    const brightnessFactor = 0.65 + 0.7 * a.aspectC;
    const lightness = Math.max(18, Math.min(92, baseLightness * brightnessFactor));

    const hue = a.aspectA * 360;
    const color = `hsl(${hue.toFixed(1)},75%,${lightness.toFixed(1)}%)`;

    if (CONFIG.ENABLE_SHADOWS && glowOn) {
      const glowBlur = CONFIG.GLOW_INTENSITY * (0.2 + 1.8 * a.aspectD);
      ctx.shadowBlur  = glowBlur;
      ctx.shadowColor = color;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (glowOn) { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }

  rafId = requestAnimationFrame(draw);
}

// ─── resize ───────────────────────────────────────────────────────────────────
function resize() {
  if (!canvas) return;
  dpr = window.devicePixelRatio || 1;
  width  = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  canvas.width  = Math.floor(width  * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ─── control panel ────────────────────────────────────────────────────────────
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
    #sf-panel .panel-topbar {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 3px;
      padding: 1px 0;
      border-top: 1px solid var(--sf-hairline);
      border-bottom: 1px solid var(--sf-hairline);
    }
    #sf-panel .panel-topbar .w-label {
      color: var(--sf-mute);
      font-size: 7px;
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      min-width: 10px;
    }
    #sf-panel .panel-topbar .w-val {
      color: var(--sf-mute);
      font-size: 7px;
      font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      min-width: 30px;
      text-align: right;
    }
    #sf-panel .panel-topbar input[type=range] {
      flex: 1;
      max-width: none;
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
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      line-height: 1.15;
      word-break: break-word;
    }
    #sf-panel .val {
      min-width: 24px;
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

  const savedWidthRaw = localStorage.getItem(PANEL_WIDTH_KEY);
  const savedWidth = savedWidthRaw ? Number(savedWidthRaw) : 0;
  const panelWidth = Number.isFinite(savedWidth) && savedWidth >= 140 && savedWidth <= 420
    ? savedWidth
    : 166;
  controlsRoot.style.width = `${panelWidth}px`;

  const topbar = document.createElement("div");
  topbar.className = "panel-topbar";
  const wLabel = document.createElement("span");
  wLabel.className = "w-label";
  wLabel.textContent = "w";
  const wInput = document.createElement("input");
  wInput.type = "range";
  wInput.min = "140";
  wInput.max = "420";
  wInput.step = "1";
  wInput.value = String(panelWidth);
  const wVal = document.createElement("span");
  wVal.className = "w-val";
  wVal.textContent = `${panelWidth}px`;

  wInput.addEventListener("input", () => {
    const next = Math.max(140, Math.min(420, parseInt(wInput.value, 10) || 166));
    controlsRoot.style.width = `${next}px`;
    wVal.textContent = `${next}px`;
    localStorage.setItem(PANEL_WIDTH_KEY, String(next));
  });

  topbar.append(wLabel, wInput, wVal);
  controlsRoot.appendChild(topbar);

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
        const valSpan = document.createElement("span");
        valSpan.className = "val";

        const fmt = (v) => isInt ? String(v) : (v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2));
        valSpan.textContent = fmt(CONFIG[key]);

        const input = document.createElement("input");
        input.type = "range";
        input.min = range.min;
        input.max = range.max;
        input.step = range.step;
        input.value = CONFIG[key];

        input.addEventListener("input", () => {
          const raw = parseFloat(input.value);
          CONFIG[key] = isInt ? Math.round(raw) : raw;
          valSpan.textContent = fmt(CONFIG[key]);
          saveSocialFieldConfig(CONFIG);
        });

        const nameSpan = document.createElement("span");
        nameSpan.className = "name";
        nameSpan.textContent = key.toLowerCase().replace(/_/g, " ");

        label.append(nameSpan, input, valSpan);
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
        label.append(nameSpan, input);
        group.appendChild(label);
      }
    }

    controlsRoot.appendChild(group);
  }

  // Presets group
  const presetsGroup = document.createElement("details");
  presetsGroup.className = "group";
  presetsGroup.open = false;
  presetsGroup.innerHTML = `<summary>presets</summary>`;

  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.className = "presets-input";
  presetNameInput.placeholder = "preset name";
  presetNameInput.style.width = "100%";
  presetNameInput.style.boxSizing = "border-box";
  presetNameInput.style.marginBottom = "2px";

  const presetsSelect = document.createElement("select");
  presetsSelect.className = "presets-select";
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
      savePreset(name, { ...CONFIG });
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
      loadPreset(name, getPresets());
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
  btnCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2)).catch(() => {});
  });

  const btnClear = document.createElement("button");
  btnClear.textContent = "Clear Agents";
  btnClear.addEventListener("click", () => {
    agents = [];
    relationships.clear();
  });

  const btnFill = document.createElement("button");
  btnFill.textContent = "Fill Canvas";
  btnFill.addEventListener("click", () => {
    for (let i = 0; i < CONFIG.INITIAL_AGENT_COUNT; i++) {
      agents.push(createAgent(Math.random() * width, Math.random() * height));
    }
  });

  actions.append(btnReset, btnCopy, btnClear, btnFill);
  controlsRoot.appendChild(actions);

  document.body.appendChild(controlsRoot);
}

function destroyPanel() {
  if (controlsRoot && controlsRoot.parentElement) controlsRoot.parentElement.removeChild(controlsRoot);
  if (controlsStyle && controlsStyle.parentElement) controlsStyle.parentElement.removeChild(controlsStyle);
  controlsRoot = null;
  controlsStyle = null;
}

// ─── lifecycle ────────────────────────────────────────────────────────────────
export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  onResize = () => resize();
  window.addEventListener("resize", onResize);
  resize();

  // Seed initial agents
  for (let i = 0; i < CONFIG.INITIAL_AGENT_COUNT; i++) {
    agents.push(createAgent(
      Math.random() * width,
      Math.random() * height,
    ));
  }

  // Click to spawn
  onPointerDown = (e) => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    agents.push(createAgent(x, y));
  };
  canvas.addEventListener("pointerdown", onPointerDown);

  buildPanel();
}

export function start() {
  lastTime = performance.now();
  rafId = requestAnimationFrame(draw);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (onPointerDown && canvas) canvas.removeEventListener("pointerdown", onPointerDown);
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
  destroyPanel();

  canvas = null;
  ctx = null;
  rafId = null;
  onResize = null;
  onPointerDown = null;
  agents = [];
  relationships.clear();
  nextId = 0;
}
