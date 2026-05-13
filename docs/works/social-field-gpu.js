import {
  loadSocialFieldGpuConfig,
  saveSocialFieldGpuConfig,
  resetSocialFieldGpuConfig
} from "./social-field-gpu.config.js";

let canvas;
let ctx2d;
let gpuContext;
let rafId;
let resizeHandler;
let controlsRoot;
let controlsStyle;
let infoLabel;
let benchmarkLabel;
let alive = false;

let config = loadSocialFieldGpuConfig();

// WebGPU state
let device;
let format;
let clearPipeline;
let buildPipeline;
let simulatePipeline;
let renderPipeline;
let computeBindGroups = [];
let renderBindGroups = [];
let agentBuffers = [];
let traitsBuffer;
let simUniformBuffer;
let renderUniformBuffer;
let cellCountsBuffer;
let cellAgentsBuffer;
let activeIndex = 0;
let useGpu = false;
let setupPromise = null;
let lastTime = 0;

// CPU fallback state
let fallbackAgents = [];

// Benchmark state
let benchmarkState = null;

const cleanupFns = [];
const GRID_MAX_CELLS = 16384;
const GRID_MAX_CELL_CAPACITY = 64;

const RANGE_META = {
  AGENT_COUNT: { min: 1000, max: 120000, step: 1000 },
  WORLD_DAMPING: { min: 0.85, max: 0.999, step: 0.001 },
  WORLD_SPEED_LIMIT: { min: 0.3, max: 4.0, step: 0.05 },
  INTERACTION_RADIUS: { min: 0.01, max: 0.2, step: 0.005 },
  PERSONAL_SPACE: { min: 0.005, max: 0.08, step: 0.001 },
  ATTRACTION: { min: 0.0, max: 0.8, step: 0.01 },
  REPULSION: { min: 0.0, max: 1.4, step: 0.01 },
  SAMPLE_COUNT: { min: 4, max: 64, step: 1 },
  MAX_NEIGHBORS: { min: 4, max: 64, step: 1 },
  JITTER: { min: 0.0, max: 0.02, step: 0.0005 },
  POINT_SIZE: { min: 1.0, max: 8.0, step: 0.1 },
  GLOW: { min: 0.0, max: 2.0, step: 0.05 }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex) {
  const h = (hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [1, 1, 1, 1];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

function resizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
}

function seedFallbackAgents() {
  const count = Math.max(1000, Math.floor(config.AGENT_COUNT * 0.2));
  fallbackAgents = new Array(count).fill(0).map(() => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.002,
    vy: (Math.random() - 0.5) * 0.002,
    friendly: 0.45 + Math.random() * 0.9,
    personal: 0.65 + Math.random() * 0.9,
    jitter: 0.7 + Math.random() * 0.6
  }));
}

function computeGridSize() {
  const radius = Math.max(0.01, config.INTERACTION_RADIUS);
  let gx = Math.max(1, Math.ceil(1 / radius));
  let gy = gx;
  while (gx * gy > GRID_MAX_CELLS && gx > 1 && gy > 1) {
    gx -= 1;
    gy -= 1;
  }
  return { gx, gy, count: gx * gy };
}

function getComputeShader() {
  return `
struct AgentState {
  pos : vec2<f32>,
  vel : vec2<f32>,
}

struct AgentTraits {
  friendly : f32,
  personal : f32,
  jitter : f32,
  pad : f32,
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
}

@group(0) @binding(0) var<storage, read> srcAgents : array<AgentState>;
@group(0) @binding(1) var<storage, read_write> dstAgents : array<AgentState>;
@group(0) @binding(2) var<storage, read> traits : array<AgentTraits>;
@group(0) @binding(3) var<storage, read_write> cellCounts : array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellAgents : array<u32>;
@group(0) @binding(5) var<uniform> params : SimParams;

fn hash32(v : u32) -> u32 {
  var x = v * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return (x >> 22u) ^ x;
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

fn cellIndexFromPos(pos : vec2<f32>) -> u32 {
  let gx = max(1u, params.gridX);
  let gy = max(1u, params.gridY);
  let fx = clamp(pos.x, 0.0, 0.999999);
  let fy = clamp(pos.y, 0.0, 0.999999);
  let cx = min(u32(floor(fx * f32(gx))), gx - 1u);
  let cy = min(u32(floor(fy * f32(gy))), gy - 1u);
  return cy * gx + cx;
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
  let personal = max(params.personalSpace * selfTraits.personal, 0.0001);

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

        let dir = delta / dist;
        if (dist < personal) {
          let t = 1.0 - (dist / personal);
          force -= dir * (params.repulsion * (0.25 + t * 0.75));
        } else {
          let t = 1.0 - ((dist - personal) / max(radius - personal, 0.0001));
          force += dir * (params.attraction * selfTraits.friendly * t);
        }

        seen = seen + 1u;
      }
    }
  }

  let n0 = f32(hash32(i * 92821u + params.count) & 1023u) / 1023.0;
  let n1 = f32(hash32(i * 13331u + params.gridX) & 1023u) / 1023.0;
  force += vec2<f32>(n0 - 0.5, n1 - 0.5) * params.globalJitter * selfTraits.jitter;

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

function getRenderShader() {
  return `
struct AgentState {
  pos : vec2<f32>,
  vel : vec2<f32>,
}

struct RenderParams {
  pointSize : f32,
  glow : f32,
  invWidth : f32,
  invHeight : f32,
  color : vec4<f32>,
}

struct VsOut {
  @builtin(position) position : vec4<f32>,
  @location(0) localUv : vec2<f32>,
}

@group(0) @binding(0) var<storage, read> agents : array<AgentState>;
@group(0) @binding(1) var<uniform> rp : RenderParams;

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
  let center = vec2<f32>(state.pos.x * 2.0 - 1.0, 1.0 - state.pos.y * 2.0);
  let px = rp.pointSize * 2.0 * rp.invWidth;
  let py = rp.pointSize * 2.0 * rp.invHeight;
  let offset = offsets[vertexIndex] * vec2<f32>(px, py);

  var out : VsOut;
  out.position = vec4<f32>(center + offset, 0.0, 1.0);
  out.localUv = offsets[vertexIndex];
  return out;
}

@fragment
fn fsMain(in : VsOut) -> @location(0) vec4<f32> {
  let r = length(in.localUv);
  if (r > 1.0) { discard; }
  let core = smoothstep(1.0, 0.0, r);
  let glow = smoothstep(1.0, 0.0, r * (1.0 - rp.glow * 0.45));
  let alpha = clamp(core * 0.9 + glow * 0.4, 0.0, 1.0);
  return vec4<f32>(rp.color.rgb, alpha);
}
`;
}

function writeSimUniforms(dt) {
  const grid = computeGridSize();
  const count = Math.max(1, Math.floor(config.AGENT_COUNT));
  const data = new ArrayBuffer(64);
  const f32 = new Float32Array(data);
  const u32 = new Uint32Array(data);

  f32[0] = dt;
  u32[1] = count;
  u32[2] = grid.gx;
  u32[3] = grid.gy;

  f32[4] = config.INTERACTION_RADIUS;
  f32[5] = config.PERSONAL_SPACE;
  f32[6] = config.ATTRACTION;
  f32[7] = config.REPULSION;

  f32[8] = config.WORLD_SPEED_LIMIT;
  f32[9] = config.WORLD_DAMPING;
  f32[10] = config.JITTER;
  f32[11] = config.POINT_SIZE;

  u32[12] = Math.max(4, Math.floor(config.SAMPLE_COUNT));
  u32[13] = GRID_MAX_CELL_CAPACITY;
  u32[14] = Math.max(4, Math.floor(config.MAX_NEIGHBORS));
  u32[15] = grid.count;

  device.queue.writeBuffer(simUniformBuffer, 0, data);
}

function writeRenderUniforms() {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const color = hexToRgba(config.AGENT_COLOR);
  const data = new Float32Array([
    config.POINT_SIZE * (window.devicePixelRatio || 1),
    config.GLOW,
    1 / width,
    1 / height,
    color[0], color[1], color[2], 1
  ]);
  device.queue.writeBuffer(renderUniformBuffer, 0, data);
}

async function initGpu() {
  if (!navigator.gpu) return false;

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return false;

  device = await adapter.requestDevice();
  gpuContext = canvas.getContext("webgpu");
  format = navigator.gpu.getPreferredCanvasFormat();
  gpuContext.configure({ device, format, alphaMode: "premultiplied" });

  const count = Math.max(1, Math.floor(config.AGENT_COUNT));
  const stateStride = 16;
  const traitsStride = 16;

  const states = new Float32Array(count * 4);
  const traits = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    states[i * 4 + 0] = Math.random();
    states[i * 4 + 1] = Math.random();
    states[i * 4 + 2] = (Math.random() - 0.5) * 0.001;
    states[i * 4 + 3] = (Math.random() - 0.5) * 0.001;

    traits[i * 4 + 0] = 0.45 + Math.random() * 0.9;
    traits[i * 4 + 1] = 0.65 + Math.random() * 0.9;
    traits[i * 4 + 2] = 0.7 + Math.random() * 0.6;
    traits[i * 4 + 3] = 0;
  }

  agentBuffers = [
    device.createBuffer({ size: count * stateStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }),
    device.createBuffer({ size: count * stateStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  ];

  traitsBuffer = device.createBuffer({ size: count * traitsStride, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  simUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  renderUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  cellCountsBuffer = device.createBuffer({
    size: GRID_MAX_CELLS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  cellAgentsBuffer = device.createBuffer({
    size: GRID_MAX_CELLS * GRID_MAX_CELL_CAPACITY * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  device.queue.writeBuffer(agentBuffers[0], 0, states);
  device.queue.writeBuffer(agentBuffers[1], 0, states);
  device.queue.writeBuffer(traitsBuffer, 0, traits);

  const computeModule = device.createShaderModule({ code: getComputeShader() });
  const renderModule = device.createShaderModule({ code: getRenderShader() });

  clearPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "clearCells" }
  });

  buildPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "buildGrid" }
  });

  simulatePipeline = device.createComputePipeline({
    layout: "auto",
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

  computeBindGroups = [
    device.createBindGroup({
      layout: simulatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[0] } },
        { binding: 1, resource: { buffer: agentBuffers[1] } },
        { binding: 2, resource: { buffer: traitsBuffer } },
        { binding: 3, resource: { buffer: cellCountsBuffer } },
        { binding: 4, resource: { buffer: cellAgentsBuffer } },
        { binding: 5, resource: { buffer: simUniformBuffer } }
      ]
    }),
    device.createBindGroup({
      layout: simulatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[1] } },
        { binding: 1, resource: { buffer: agentBuffers[0] } },
        { binding: 2, resource: { buffer: traitsBuffer } },
        { binding: 3, resource: { buffer: cellCountsBuffer } },
        { binding: 4, resource: { buffer: cellAgentsBuffer } },
        { binding: 5, resource: { buffer: simUniformBuffer } }
      ]
    })
  ];

  renderBindGroups = [
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[0] } },
        { binding: 1, resource: { buffer: renderUniformBuffer } }
      ]
    }),
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentBuffers[1] } },
        { binding: 1, resource: { buffer: renderUniformBuffer } }
      ]
    })
  ];

  activeIndex = 0;
  useGpu = true;
  return true;
}

function releaseGpu() {
  clearPipeline = null;
  buildPipeline = null;
  simulatePipeline = null;
  renderPipeline = null;
  computeBindGroups = [];
  renderBindGroups = [];
  agentBuffers = [];
  traitsBuffer = null;
  simUniformBuffer = null;
  renderUniformBuffer = null;
  cellCountsBuffer = null;
  cellAgentsBuffer = null;
  device = null;
  gpuContext = null;
  useGpu = false;
}

function stepFallback(dt) {
  const radius = config.INTERACTION_RADIUS;
  const personalBase = config.PERSONAL_SPACE;

  for (let i = 0; i < fallbackAgents.length; i++) {
    const a = fallbackAgents[i];
    let fx = 0;
    let fy = 0;

    const samples = Math.max(4, Math.floor(config.MAX_NEIGHBORS * 0.5));
    for (let s = 0; s < samples; s++) {
      const j = Math.floor(Math.random() * fallbackAgents.length);
      if (j === i) continue;
      const b = fallbackAgents[j];

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx > 0.5) dx -= 1;
      if (dx < -0.5) dx += 1;
      if (dy > 0.5) dy -= 1;
      if (dy < -0.5) dy += 1;

      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-6 || d2 > radius * radius) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const personal = personalBase * a.personal;

      if (d < personal) {
        const t = 1 - d / personal;
        fx -= nx * config.REPULSION * t;
        fy -= ny * config.REPULSION * t;
      } else {
        const t = 1 - (d - personal) / Math.max(0.0001, radius - personal);
        fx += nx * config.ATTRACTION * a.friendly * t;
        fy += ny * config.ATTRACTION * a.friendly * t;
      }
    }

    a.vx = (a.vx + fx * dt + (Math.random() - 0.5) * config.JITTER * a.jitter) * config.WORLD_DAMPING;
    a.vy = (a.vy + fy * dt + (Math.random() - 0.5) * config.JITTER * a.jitter) * config.WORLD_DAMPING;

    const maxSpeed = config.WORLD_SPEED_LIMIT * 0.01;
    const speed = Math.hypot(a.vx, a.vy);
    if (speed > maxSpeed) {
      const k = maxSpeed / speed;
      a.vx *= k;
      a.vy *= k;
    }

    a.x = (a.x + a.vx + 1) % 1;
    a.y = (a.y + a.vy + 1) % 1;
  }
}

function renderFallback() {
  if (!ctx2d) return;
  const [br, bg, bb] = hexToRgba(config.BG_COLOR);
  const [ar, ag, ab] = hexToRgba(config.AGENT_COLOR);

  ctx2d.fillStyle = `rgb(${Math.round(br * 255)} ${Math.round(bg * 255)} ${Math.round(bb * 255)})`;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  const size = config.POINT_SIZE * (window.devicePixelRatio || 1);
  ctx2d.fillStyle = `rgb(${Math.round(ar * 255)} ${Math.round(ag * 255)} ${Math.round(ab * 255)})`;
  for (const a of fallbackAgents) {
    ctx2d.beginPath();
    ctx2d.arc(a.x * canvas.width, a.y * canvas.height, size, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

async function rebuildSimulation() {
  if (!canvas) return;

  if (navigator.gpu) {
    releaseGpu();
    const ok = await initGpu();
    if (!ok) {
      useGpu = false;
      ctx2d = canvas.getContext("2d");
      seedFallbackAgents();
    }
  } else {
    useGpu = false;
    ctx2d = canvas.getContext("2d");
    seedFallbackAgents();
  }

  if (infoLabel) {
    infoLabel.textContent = useGpu
      ? `mode: webgpu / agents: ${Math.floor(config.AGENT_COUNT).toLocaleString()}`
      : `mode: cpu fallback / agents: ${fallbackAgents.length.toLocaleString()}`;
  }
}

async function advanceBenchmarkStage() {
  if (!benchmarkState || benchmarkState.transitioning) return;
  benchmarkState.transitioning = true;

  benchmarkState.index += 1;
  if (benchmarkState.index >= benchmarkState.stages.length) {
    const summary = benchmarkState.results
      .map((r) => {
        const cap = r.capped ? " (vsync cap)" : "";
        return `${r.count.toLocaleString()}: ${r.fps.toFixed(1)} fps / ${r.simFps.toFixed(1)} sim-fps${cap}`;
      })
      .join(" | ");

    config.AGENT_COUNT = benchmarkState.originalCount;
    saveSocialFieldGpuConfig(config);
    await rebuildSimulation();

    if (benchmarkLabel) benchmarkLabel.textContent = `bench done: ${summary}`;
    benchmarkState = null;
    return;
  }

  const count = benchmarkState.stages[benchmarkState.index];
  config.AGENT_COUNT = count;
  await rebuildSimulation();

  benchmarkState.stageStart = performance.now();
  benchmarkState.stageFrames = 0;
  benchmarkState.stageSimSteps = 0;
  benchmarkState.transitioning = false;

  if (benchmarkLabel) {
    benchmarkLabel.textContent = `bench ${benchmarkState.index + 1}/${benchmarkState.stages.length}: ${count.toLocaleString()} agents (x${benchmarkState.passesPerFrame} substeps/frame)`;
  }
}

function startBenchmark() {
  if (benchmarkState) return;
  benchmarkState = {
    stages: [10000, 30000, 60000, 100000],
    index: -1,
    stageStart: 0,
    stageFrames: 0,
    stageSimSteps: 0,
    stageSeconds: 3,
    passesPerFrame: 8,
    results: [],
    originalCount: Math.floor(config.AGENT_COUNT),
    transitioning: false
  };
  advanceBenchmarkStage();
}

function updateBenchmark(nowMs) {
  if (!benchmarkState || benchmarkState.transitioning || benchmarkState.stageStart <= 0) return;
  const elapsed = (nowMs - benchmarkState.stageStart) / 1000;
  if (elapsed < benchmarkState.stageSeconds) return;

  const fps = benchmarkState.stageFrames / elapsed;
  const simFps = benchmarkState.stageSimSteps / elapsed;
  benchmarkState.results.push({
    count: Math.floor(config.AGENT_COUNT),
    fps,
    simFps,
    capped: fps > 115 && fps < 125
  });
  advanceBenchmarkStage();
}

function buildControls() {
  controlsStyle = document.createElement("style");
  controlsStyle.textContent = `
    .sfgpu-panel {
      position: absolute;
      top: 12px;
      left: 12px;
      width: min(370px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: rgba(8, 12, 18, 0.88);
      border: 1px solid rgba(150, 175, 210, 0.28);
      border-radius: 8px;
      backdrop-filter: blur(8px);
      color: #d8e6ff;
      font: 11px/1.45 "DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 10px;
      z-index: 8;
    }
    .sfgpu-panel h3 { font-size: 12px; margin: 0 0 8px; font-weight: 600; }
    .sfgpu-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin-bottom: 7px; }
    .sfgpu-row label { color: #a9bddf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sfgpu-row input[type="range"] { width: 100%; }
    .sfgpu-row input[type="color"] { width: 28px; height: 20px; padding: 0; border: 0; background: transparent; }
    .sfgpu-value { color: #f4f8ff; min-width: 60px; text-align: right; }
    .sfgpu-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    .sfgpu-btn {
      border: 1px solid rgba(154, 188, 255, 0.35);
      background: rgba(18, 27, 40, 0.9);
      color: #d8e6ff;
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
      font: inherit;
    }
    .sfgpu-meta { margin-top: 8px; color: #8ea4c9; }
    .sfgpu-bench { margin-top: 4px; color: #9ab7e0; line-height: 1.3; }
  `;
  document.head.appendChild(controlsStyle);

  controlsRoot = document.createElement("div");
  controlsRoot.className = "sfgpu-panel";
  controlsRoot.innerHTML = "<h3>social field gpu v2</h3>";

  const numericKeys = [
    "AGENT_COUNT", "INTERACTION_RADIUS", "PERSONAL_SPACE", "ATTRACTION", "REPULSION",
    "MAX_NEIGHBORS", "WORLD_DAMPING", "WORLD_SPEED_LIMIT", "JITTER", "POINT_SIZE", "GLOW"
  ];

  for (const key of numericKeys) {
    const row = document.createElement("div");
    row.className = "sfgpu-row";

    const label = document.createElement("label");
    label.textContent = key.toLowerCase();

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr auto";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(RANGE_META[key].min);
    input.max = String(RANGE_META[key].max);
    input.step = String(RANGE_META[key].step);
    input.value = String(config[key]);

    const value = document.createElement("span");
    value.className = "sfgpu-value";
    value.textContent = Number(config[key]).toFixed(key.includes("COUNT") || key.includes("NEIGHBORS") ? 0 : 3).replace(/\.0+$/, "");

    const onInput = () => {
      const raw = Number(input.value);
      const clamped = clamp(raw, RANGE_META[key].min, RANGE_META[key].max);
      config[key] = key.includes("COUNT") || key.includes("NEIGHBORS") ? Math.round(clamped) : clamped;
      value.textContent = Number(config[key]).toFixed(key.includes("COUNT") || key.includes("NEIGHBORS") ? 0 : 3).replace(/\.0+$/, "");
      saveSocialFieldGpuConfig(config);

      if (key === "AGENT_COUNT") {
        rebuildSimulation();
      }
    };

    input.addEventListener("input", onInput);
    cleanupFns.push(() => input.removeEventListener("input", onInput));

    wrap.appendChild(input);
    wrap.appendChild(value);
    row.appendChild(label);
    row.appendChild(wrap);
    controlsRoot.appendChild(row);
  }

  for (const key of ["BG_COLOR", "AGENT_COLOR"]) {
    const row = document.createElement("div");
    row.className = "sfgpu-row";

    const label = document.createElement("label");
    label.textContent = key.toLowerCase();

    const color = document.createElement("input");
    color.type = "color";
    color.value = config[key];

    const onColor = () => {
      config[key] = color.value;
      saveSocialFieldGpuConfig(config);
    };

    color.addEventListener("input", onColor);
    cleanupFns.push(() => color.removeEventListener("input", onColor));

    row.appendChild(label);
    row.appendChild(color);
    controlsRoot.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "sfgpu-actions";

  const resetBtn = document.createElement("button");
  resetBtn.className = "sfgpu-btn";
  resetBtn.textContent = "reset defaults";

  const copyBtn = document.createElement("button");
  copyBtn.className = "sfgpu-btn";
  copyBtn.textContent = "copy json";

  const benchBtn = document.createElement("button");
  benchBtn.className = "sfgpu-btn";
  benchBtn.textContent = "run benchmark";

  const onReset = async () => {
    config = resetSocialFieldGpuConfig();
    rebuildUi();
    await rebuildSimulation();
  };

  const onCopy = async () => {
    const text = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      if (infoLabel) infoLabel.textContent = useGpu ? "mode: webgpu / config copied" : "mode: cpu fallback / config copied";
    } catch (_) {
      if (infoLabel) infoLabel.textContent = "clipboard unavailable";
    }
  };

  const onBench = () => {
    startBenchmark();
  };

  resetBtn.addEventListener("click", onReset);
  copyBtn.addEventListener("click", onCopy);
  benchBtn.addEventListener("click", onBench);

  cleanupFns.push(() => resetBtn.removeEventListener("click", onReset));
  cleanupFns.push(() => copyBtn.removeEventListener("click", onCopy));
  cleanupFns.push(() => benchBtn.removeEventListener("click", onBench));

  actions.appendChild(resetBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(benchBtn);
  controlsRoot.appendChild(actions);

  infoLabel = document.createElement("div");
  infoLabel.className = "sfgpu-meta";
  infoLabel.textContent = useGpu ? "mode: webgpu" : "mode: cpu fallback";
  controlsRoot.appendChild(infoLabel);

  benchmarkLabel = document.createElement("div");
  benchmarkLabel.className = "sfgpu-bench";
  benchmarkLabel.textContent = "bench: idle";
  controlsRoot.appendChild(benchmarkLabel);

  canvas.parentElement?.appendChild(controlsRoot);
}

function rebuildUi() {
  if (controlsRoot?.parentElement) controlsRoot.parentElement.removeChild(controlsRoot);
  controlsRoot = null;
  buildControls();
}

function frame(time) {
  if (!alive) return;

  const dt = Math.min(0.05, Math.max(0.001, (time - (lastTime || time)) / 1000));
  lastTime = time;
  const benchmarkPasses = benchmarkState ? benchmarkState.passesPerFrame : 1;

  if (useGpu && device) {
    writeRenderUniforms();

    const count = Math.max(1, Math.floor(config.AGENT_COUNT));
    const grid = computeGridSize();
    const encoder = device.createCommandEncoder();

    for (let pass = 0; pass < benchmarkPasses; pass++) {
      writeSimUniforms(dt / benchmarkPasses);

      const clearPass = encoder.beginComputePass();
      clearPass.setPipeline(clearPipeline);
      clearPass.setBindGroup(0, computeBindGroups[activeIndex]);
      clearPass.dispatchWorkgroups(Math.ceil(grid.count / 128));
      clearPass.end();

      const buildPass = encoder.beginComputePass();
      buildPass.setPipeline(buildPipeline);
      buildPass.setBindGroup(0, computeBindGroups[activeIndex]);
      buildPass.dispatchWorkgroups(Math.ceil(count / 128));
      buildPass.end();

      const simulatePass = encoder.beginComputePass();
      simulatePass.setPipeline(simulatePipeline);
      simulatePass.setBindGroup(0, computeBindGroups[activeIndex]);
      simulatePass.dispatchWorkgroups(Math.ceil(count / 128));
      simulatePass.end();

      activeIndex = 1 - activeIndex;
    }

    const bg = hexToRgba(config.BG_COLOR);
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
    renderPass.end();

    device.queue.submit([encoder.finish()]);
    if (benchmarkState) {
      benchmarkState.stageFrames += 1;
      benchmarkState.stageSimSteps += benchmarkPasses;
    }
  } else {
    stepFallback(dt);
    renderFallback();
    if (benchmarkState) {
      benchmarkState.stageFrames += 1;
      benchmarkState.stageSimSteps += 1;
    }
  }

  updateBenchmark(performance.now());
  rafId = requestAnimationFrame(frame);
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  container.style.position = "relative";
  container.appendChild(canvas);

  resizeHandler = () => {
    resizeCanvas();
    if (useGpu && gpuContext && device) {
      gpuContext.configure({ device, format, alphaMode: "premultiplied" });
    }
  };

  window.addEventListener("resize", resizeHandler);
  resizeCanvas();
  buildControls();

  setupPromise = rebuildSimulation();

  cleanupFns.push(() => {
    if (controlsRoot?.parentElement) controlsRoot.parentElement.removeChild(controlsRoot);
    controlsRoot = null;
  });
  cleanupFns.push(() => {
    if (controlsStyle?.parentElement) controlsStyle.parentElement.removeChild(controlsStyle);
    controlsStyle = null;
  });
}

export function start() {
  alive = true;
  lastTime = 0;

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
  rafId = null;

  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  for (const fn of cleanupFns.splice(0)) {
    try { fn(); } catch (_) { /* ignore */ }
  }

  benchmarkState = null;
  fallbackAgents = [];
  releaseGpu();
  setupPromise = null;

  if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
  canvas = null;
  ctx2d = null;
  infoLabel = null;
  benchmarkLabel = null;
}
