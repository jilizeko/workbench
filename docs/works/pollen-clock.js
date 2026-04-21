let canvas;
let ctx;
let rafId;
let onResize;

let width = 0;
let height = 0;

let maskCanvas;
let maskCtx;
let maskData = null;
let lastTimeKey = "";

let targets = [];
let targetBuckets = [];
let targetBucketCols = 0;
let targetBucketRows = 0;

let particles = [];
let sepForceX = new Float32Array(0);
let sepForceY = new Float32Array(0);
let sepForceZ = new Float32Array(0);
let separationGrid = new Map();
let lastSeparationUpdateMs = 0;

let flowField = new Float32Array(0);
let flowCols = 0;
let flowRows = 0;
let flowLayers = 0;
let flowZMin = 0;
let flowZMax = 0;

let turbulenceField = new Float32Array(0);
let noiseCols = 0;
let noiseRows = 0;
let noiseLayers = 0;
let noiseZMin = 0;

let camRight = [1, 0, 0];
let camUp = [0, 1, 0];
let camFwd = [0, 0, 1];
let camX = 0;
let camY = 0;
let camZ = 900;
let focalLen = 1;

const CONFIG = {
  FONT_FAMILY: "Bebas Neue",
  FONT_WEIGHT: "400",
  SHOW_HOURS: true,
  SHOW_MINUTES: true,
  SHOW_SECONDS: true,
  MAX_COVERAGE: 0.8,
  LINE_HEIGHT: 0.92,

  BG: "#0d0d0d",
  GRADIENT_A: "#f5d0a9",
  GRADIENT_B: "#b84a1e",
  BASE_ALPHA: 0.82,
  SIZE_MIN: 0.9,
  SIZE_MAX: 1.8,

  PARTICLE_COUNT: 5200,
  DAMPING: .95,
  MAX_SPEED_XY: 2.4,
  MAX_SPEED_Z: 0.72,
  SOFT_BOUNDARY: 0.96,
  RETURN_TO_VIEW_FORCE: 0.10,

  TARGET_STRIDE: 2,
  TARGET_BUCKET_SIZE: 30,
  TARGET_SEARCH_RADIUS: 30,

  FLOW_CELL_XY: 2,
  FLOW_CELL_Z: 6,
  FLOW_DEPTH: 20,
  FLOW_FORCE: 0.25,
  FLOW_MIN_GAIN: 0.2,
  FLOW_DISTANCE_GAIN: 120,
  FLOW_Z_RETURN: 0.45,

  SEPARATION_INTERVAL_MS: 30,
  SEPARATION_CELL_SIZE: 40,
  SEPARATION_RADIUS: 4,
  SEPARATION_FORCE: 0.25,

  TURB_CELL_XY: 40,
  TURB_CELL_Z: 1,
  TURB_DEPTH: 60,

  WIND_DIR_X: 1,
  WIND_DIR_Y: -0.3,
  WIND_DIR_Z: 0,
  WIND_BASE_FORCE: 0.025,
  WIND_VARIATION_AMPLITUDE: 0.0,
  WIND_VARIATION_HZ: 0.1,
  WIND_TURB_STRENGTH: 0.3,
  WIND_FLOW_THRESHOLD: 0.19,

  CAM_FOV: 50,
  CAM_DISTANCE: 1.,
  CAM_THETA: 0.,
  CAM_PHI: 0.,

  WARMUP_SECONDS: 3.5, 
  WARMUP_STEP_MS: 1000 / 30,
};
 
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapValue(value, min, max) {
  const span = max - min;
  if (span <= 0) return value;
  if (value < min) return max - ((min - value) % span);
  if (value > max) return min + ((value - max) % span);
  return value;
}

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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;
  const intValue = parseInt(value, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function gradientColor(t) {
  const a = hexToRgb(CONFIG.GRADIENT_A);
  const b = hexToRgb(CONFIG.GRADIENT_B);
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function buildCamera() {
  const fovRad = CONFIG.CAM_FOV * Math.PI / 180;
  focalLen = (height * 0.5) / Math.tan(fovRad * 0.5);

  const distance = height * CONFIG.CAM_DISTANCE;
  const theta = CONFIG.CAM_THETA;
  const phi = CONFIG.CAM_PHI;

  camX = distance * Math.sin(theta) * Math.cos(phi);
  camY = distance * Math.sin(phi);
  camZ = distance * Math.cos(theta) * Math.cos(phi);

  camFwd = normalize3([-camX, -camY, -camZ]);
  camRight = normalize3(cross3(camFwd, [0, 1, 0]));
  camUp = cross3(camRight, camFwd);
}

function computeFontSize(lines) {
  const maxWidth = width * CONFIG.MAX_COVERAGE;
  const maxHeight = height * CONFIG.MAX_COVERAGE;
  let low = 10;
  let high = Math.max(12, Math.min(width, height) * 2);
  let best = low;

  while (low <= high) {
    const mid = (low + high) >> 1;
    maskCtx.font = `${CONFIG.FONT_WEIGHT} ${mid}px "${CONFIG.FONT_FAMILY}", sans-serif`;

    let lineWidth = 0;
    for (let i = 0; i < lines.length; i += 1) {
      lineWidth = Math.max(lineWidth, maskCtx.measureText(lines[i]).width);
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
  const lines = isPortrait() ? parts : [parts.join(":")];
  const fontSize = computeFontSize(lines);
  const lineHeight = fontSize * CONFIG.LINE_HEIGHT;

  maskCtx.font = `${CONFIG.FONT_WEIGHT} ${fontSize}px "${CONFIG.FONT_FAMILY}", sans-serif`;
  maskCtx.textAlign = "center";
  maskCtx.textBaseline = "middle";
  maskCtx.fillStyle = "white";

  if (lines.length > 1) {
    const totalHeight = lineHeight * lines.length;
    const startY = height * 0.5 - totalHeight * 0.5 + lineHeight * 0.5;
    for (let i = 0; i < lines.length; i += 1) {
      maskCtx.fillText(lines[i], width * 0.5, startY + i * lineHeight);
    }
  } else {
    maskCtx.fillText(lines[0], width * 0.5, height * 0.5);
  }

  maskData = maskCtx.getImageData(0, 0, width, height);
}

function sampleMaskWorld(x, y) {
  if (!maskData) return false;

  const px = Math.floor(x + width * 0.5);
  const py = Math.floor(height * 0.5 - y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return maskData.data[(py * width + px) * 4] > 127;
}

function buildTargetBuckets() {
  targets = [];

  if (!maskData) {
    targetBuckets = [];
    targetBucketCols = 0;
    targetBucketRows = 0;
    return;
  }

  targetBucketCols = Math.max(1, Math.ceil(width / CONFIG.TARGET_BUCKET_SIZE));
  targetBucketRows = Math.max(1, Math.ceil(height / CONFIG.TARGET_BUCKET_SIZE));
  targetBuckets = Array.from({ length: targetBucketCols * targetBucketRows }, () => []);

  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let py = 0; py < height; py += CONFIG.TARGET_STRIDE) {
    for (let px = 0; px < width; px += CONFIG.TARGET_STRIDE) {
      if (maskData.data[(py * width + px) * 4] <= 127) continue;

      const target = {
        x: px - halfWidth,
        y: halfHeight - py,
      };
      const index = targets.length;
      targets.push(target);

      const bx = clamp(Math.floor(px / CONFIG.TARGET_BUCKET_SIZE), 0, targetBucketCols - 1);
      const by = clamp(Math.floor(py / CONFIG.TARGET_BUCKET_SIZE), 0, targetBucketRows - 1);
      targetBuckets[by * targetBucketCols + bx].push(index);
    }
  }
}

function findNearestTarget(x, y) {
  if (targets.length === 0 || targetBucketCols === 0 || targetBucketRows === 0) return null;

  const px = x + width * 0.5;
  const py = height * 0.5 - y;
  const baseBx = clamp(Math.floor(px / CONFIG.TARGET_BUCKET_SIZE), 0, targetBucketCols - 1);
  const baseBy = clamp(Math.floor(py / CONFIG.TARGET_BUCKET_SIZE), 0, targetBucketRows - 1);

  let bestTarget = null;
  let bestDist2 = Infinity;

  for (let radius = 0; radius <= CONFIG.TARGET_SEARCH_RADIUS; radius += 1) {
    const minBx = clamp(baseBx - radius, 0, targetBucketCols - 1);
    const maxBx = clamp(baseBx + radius, 0, targetBucketCols - 1);
    const minBy = clamp(baseBy - radius, 0, targetBucketRows - 1);
    const maxBy = clamp(baseBy + radius, 0, targetBucketRows - 1);

    for (let by = minBy; by <= maxBy; by += 1) {
      for (let bx = minBx; bx <= maxBx; bx += 1) {
        const bucket = targetBuckets[by * targetBucketCols + bx];
        for (let i = 0; i < bucket.length; i += 1) {
          const target = targets[bucket[i]];
          const dx = target.x - x;
          const dy = target.y - y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < bestDist2) {
            bestDist2 = dist2;
            bestTarget = target;
          }
        }
      }
    }

    if (bestTarget) return bestTarget;
  }

  return null;
}

function flowFieldOffset(ix, iy, iz) {
  return ((iz * flowRows + iy) * flowCols + ix) * 3;
}

function buildFlowField() {
  flowCols = Math.max(1, Math.ceil(width / CONFIG.FLOW_CELL_XY));
  flowRows = Math.max(1, Math.ceil(height / CONFIG.FLOW_CELL_XY));
  flowLayers = Math.max(2, Math.ceil(CONFIG.FLOW_DEPTH / CONFIG.FLOW_CELL_Z));
  flowZMin = -CONFIG.FLOW_DEPTH * 0.5;
  flowZMax = CONFIG.FLOW_DEPTH * 0.5;
  flowField = new Float32Array(flowCols * flowRows * flowLayers * 3);

  const xyVectors = new Float32Array(flowCols * flowRows * 2);
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let iy = 0; iy < flowRows; iy += 1) {
    const y = halfHeight - (iy + 0.5) * CONFIG.FLOW_CELL_XY;
    for (let ix = 0; ix < flowCols; ix += 1) {
      const x = -halfWidth + (ix + 0.5) * CONFIG.FLOW_CELL_XY;
      const base = (iy * flowCols + ix) * 2;

      if (sampleMaskWorld(x, y)) {
        xyVectors[base] = 0;
        xyVectors[base + 1] = 0;
        continue;
      }

      const nearest = findNearestTarget(x, y);
      if (!nearest) {
        xyVectors[base] = 0;
        xyVectors[base + 1] = 0;
        continue;
      }

      const dx = nearest.x - x;
      const dy = nearest.y - y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const baseGain = clamp(distance / CONFIG.FLOW_DISTANCE_GAIN, CONFIG.FLOW_MIN_GAIN, 1);

      xyVectors[base] = (dx / distance) * baseGain;
      xyVectors[base + 1] = (dy / distance) * baseGain;
    }
  }

  for (let iz = 0; iz < flowLayers; iz += 1) {
    const z = flowZMin + (iz + 0.5) * CONFIG.FLOW_CELL_Z;
    const zNorm = clamp(-z / (CONFIG.FLOW_DEPTH * 0.5), -1, 1) * CONFIG.FLOW_Z_RETURN;

    for (let iy = 0; iy < flowRows; iy += 1) {
      for (let ix = 0; ix < flowCols; ix += 1) {
        const xyBase = (iy * flowCols + ix) * 2;
        const base = flowFieldOffset(ix, iy, iz);
        flowField[base] = xyVectors[xyBase];
        flowField[base + 1] = xyVectors[xyBase + 1];
        flowField[base + 2] = zNorm;
      }
    }
  }
}

function trilinearSample(field, cols, rows, layers, x, y, z, out) {
  const x0 = clamp(Math.floor(x), 0, cols - 1);
  const y0 = clamp(Math.floor(y), 0, rows - 1);
  const z0 = clamp(Math.floor(z), 0, layers - 1);
  const x1 = clamp(x0 + 1, 0, cols - 1);
  const y1 = clamp(y0 + 1, 0, rows - 1);
  const z1 = clamp(z0 + 1, 0, layers - 1);

  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;

  const c000 = ((z0 * rows + y0) * cols + x0) * 3;
  const c100 = ((z0 * rows + y0) * cols + x1) * 3;
  const c010 = ((z0 * rows + y1) * cols + x0) * 3;
  const c110 = ((z0 * rows + y1) * cols + x1) * 3;
  const c001 = ((z1 * rows + y0) * cols + x0) * 3;
  const c101 = ((z1 * rows + y0) * cols + x1) * 3;
  const c011 = ((z1 * rows + y1) * cols + x0) * 3;
  const c111 = ((z1 * rows + y1) * cols + x1) * 3;

  for (let k = 0; k < 3; k += 1) {
    const v00 = lerp(field[c000 + k], field[c100 + k], tx);
    const v10 = lerp(field[c010 + k], field[c110 + k], tx);
    const v01 = lerp(field[c001 + k], field[c101 + k], tx);
    const v11 = lerp(field[c011 + k], field[c111 + k], tx);
    const v0 = lerp(v00, v10, ty);
    const v1 = lerp(v01, v11, ty);
    out[k] = lerp(v0, v1, tz);
  }
}

function sampleFlow(x, y, z, out) {
  if (flowField.length === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }

  const nx = clamp((x + width * 0.5) / CONFIG.FLOW_CELL_XY - 0.5, 0, flowCols - 1);
  const ny = clamp((height * 0.5 - y) / CONFIG.FLOW_CELL_XY - 0.5, 0, flowRows - 1);
  const nz = clamp((z - flowZMin) / CONFIG.FLOW_CELL_Z - 0.5, 0, flowLayers - 1);
  trilinearSample(flowField, flowCols, flowRows, flowLayers, nx, ny, nz, out);
}

function hash3(ix, iy, iz, seed) {
  let h = ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return h >>> 0;
}

function randomFromHash(ix, iy, iz, seed) {
  return hash3(ix, iy, iz, seed) / 4294967295;
}

function buildTurbulenceField() {
  noiseCols = Math.max(2, Math.ceil(width / CONFIG.TURB_CELL_XY));
  noiseRows = Math.max(2, Math.ceil(height / CONFIG.TURB_CELL_XY));
  noiseLayers = Math.max(2, Math.ceil(CONFIG.TURB_DEPTH / CONFIG.TURB_CELL_Z));
  noiseZMin = -CONFIG.TURB_DEPTH * 0.5;
  turbulenceField = new Float32Array(noiseCols * noiseRows * noiseLayers * 3);

  for (let iz = 0; iz < noiseLayers; iz += 1) {
    for (let iy = 0; iy < noiseRows; iy += 1) {
      for (let ix = 0; ix < noiseCols; ix += 1) {
        const base = ((iz * noiseRows + iy) * noiseCols + ix) * 3;
        const rx = randomFromHash(ix, iy, iz, 11) * 2 - 1;
        const ry = randomFromHash(ix, iy, iz, 29) * 2 - 1;
        const rz = randomFromHash(ix, iy, iz, 47) * 2 - 1;
        const invLen = 1 / (Math.hypot(rx, ry, rz) || 1);
        turbulenceField[base] = rx * invLen;
        turbulenceField[base + 1] = ry * invLen;
        turbulenceField[base + 2] = rz * invLen;
      }
    }
  }
}

function sampleTurbulence(x, y, z, out) {
  if (turbulenceField.length === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }

  const nx = clamp((x + width * 0.5) / CONFIG.TURB_CELL_XY - 0.5, 0, noiseCols - 1);
  const ny = clamp((height * 0.5 - y) / CONFIG.TURB_CELL_XY - 0.5, 0, noiseRows - 1);
  const nz = clamp((z - noiseZMin) / CONFIG.TURB_CELL_Z - 0.5, 0, noiseLayers - 1);
  trilinearSample(turbulenceField, noiseCols, noiseRows, noiseLayers, nx, ny, nz, out);
}

function gridKey(ix, iy, iz) {
  return `${ix}|${iy}|${iz}`;
}

function rebuildSeparationForces(nowMs) {
  if (nowMs - lastSeparationUpdateMs < CONFIG.SEPARATION_INTERVAL_MS) return;
  lastSeparationUpdateMs = nowMs;

  separationGrid = new Map();
  sepForceX.fill(0);
  sepForceY.fill(0);
  sepForceZ.fill(0);

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const ix = Math.floor((p.x + width * 0.5) / CONFIG.SEPARATION_CELL_SIZE);
    const iy = Math.floor((height * 0.5 - p.y) / CONFIG.SEPARATION_CELL_SIZE);
    const iz = Math.floor((p.z - flowZMin) / CONFIG.SEPARATION_CELL_SIZE);
    const key = gridKey(ix, iy, iz);
    let bucket = separationGrid.get(key);
    if (!bucket) {
      bucket = [];
      separationGrid.set(key, bucket);
    }
    bucket.push(i);
  }

  const radius = CONFIG.SEPARATION_RADIUS;
  const radius2 = radius * radius;

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const ix = Math.floor((p.x + width * 0.5) / CONFIG.SEPARATION_CELL_SIZE);
    const iy = Math.floor((height * 0.5 - p.y) / CONFIG.SEPARATION_CELL_SIZE);
    const iz = Math.floor((p.z - flowZMin) / CONFIG.SEPARATION_CELL_SIZE);

    let fx = 0;
    let fy = 0;
    let fz = 0;

    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = separationGrid.get(gridKey(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;

          for (let j = 0; j < bucket.length; j += 1) {
            const otherIndex = bucket[j];
            if (otherIndex === i) continue;

            const other = particles[otherIndex];
            const rx = p.x - other.x;
            const ry = p.y - other.y;
            const rz = p.z - other.z;
            const dist2 = rx * rx + ry * ry + rz * rz;
            if (dist2 <= 0.0001 || dist2 >= radius2) continue;

            const dist = Math.sqrt(dist2);
            const weight = 1 - dist / radius;
            const inv = 1 / dist;
            fx += rx * inv * weight;
            fy += ry * inv * weight;
            fz += rz * inv * weight;
          }
        }
      }
    }

    sepForceX[i] = fx;
    sepForceY[i] = fy;
    sepForceZ[i] = fz;
  }
}

function buildParticles() {
  particles = [];
  const spawnWidth = width * 0.75;
  const spawnHeight = height * 0.75;

  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i += 1) {
    const color = gradientColor(Math.random());
    particles.push({
      x: (Math.random() - 0.5) * spawnWidth,
      y: (Math.random() - 0.5) * spawnHeight,
      z: lerp(flowZMin, flowZMax, Math.random()),
      vx: 0,
      vy: 0,
      vz: 0,
      size: CONFIG.SIZE_MIN + Math.random() * (CONFIG.SIZE_MAX - CONFIG.SIZE_MIN),
      colorRgb: `rgb(${color.r}, ${color.g}, ${color.b})`,
    });
  }

  sepForceX = new Float32Array(particles.length);
  sepForceY = new Float32Array(particles.length);
  sepForceZ = new Float32Array(particles.length);
  lastSeparationUpdateMs = 0;
}

function rebuildClockFields(date) {
  renderMask(date);
  buildTargetBuckets();
  buildFlowField();
}

function updateParticles(nowMs) {
  rebuildSeparationForces(nowMs);

  const flowSample = [0, 0, 0];
  const turbSample = [0, 0, 0];
  const timeSec = nowMs * 0.001;
  const windStrength = CONFIG.WIND_BASE_FORCE +
    Math.sin(timeSec * Math.PI * 2 * CONFIG.WIND_VARIATION_HZ) * CONFIG.WIND_VARIATION_AMPLITUDE;

  const windDirLen = Math.hypot(CONFIG.WIND_DIR_X, CONFIG.WIND_DIR_Y, CONFIG.WIND_DIR_Z) || 1;
  const windDirX = CONFIG.WIND_DIR_X / windDirLen;
  const windDirY = CONFIG.WIND_DIR_Y / windDirLen;
  const windDirZ = CONFIG.WIND_DIR_Z / windDirLen;

  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];

    sampleFlow(p.x, p.y, p.z, flowSample);
    sampleTurbulence(p.x, p.y, p.z, turbSample);

    p.vx += flowSample[0] * CONFIG.FLOW_FORCE;
    p.vy += flowSample[1] * CONFIG.FLOW_FORCE;
    p.vz += flowSample[2] * CONFIG.FLOW_FORCE;

    p.vx += sepForceX[i] * CONFIG.SEPARATION_FORCE;
    p.vy += sepForceY[i] * CONFIG.SEPARATION_FORCE;
    p.vz += sepForceZ[i] * CONFIG.SEPARATION_FORCE;

    const flowStrengthXY = Math.hypot(flowSample[0], flowSample[1]);
    if (flowStrengthXY > CONFIG.WIND_FLOW_THRESHOLD) {
      const turbAlongWind =
        turbSample[0] * windDirX +
        turbSample[1] * windDirY +
        turbSample[2] * windDirZ;
      const windMultiplier = clamp(1 + turbAlongWind * CONFIG.WIND_TURB_STRENGTH, 0, 2);
      const windForce = windStrength * windMultiplier;

      p.vx += windDirX * windForce;
      p.vy += windDirY * windForce;
      p.vz += windDirZ * windForce;
    }

    if (p.z < flowZMin) p.vz += (flowZMin - p.z) * CONFIG.RETURN_TO_VIEW_FORCE;
    else if (p.z > flowZMax) p.vz += (flowZMax - p.z) * CONFIG.RETURN_TO_VIEW_FORCE;

    p.vx *= CONFIG.DAMPING;
    p.vy *= CONFIG.DAMPING;
    p.vz *= CONFIG.DAMPING;

    const speedXY = Math.hypot(p.vx, p.vy);
    if (speedXY > CONFIG.MAX_SPEED_XY) {
      const scale = CONFIG.MAX_SPEED_XY / speedXY;
      p.vx *= scale;
      p.vy *= scale;
    }
    p.vz = clamp(p.vz, -CONFIG.MAX_SPEED_Z, CONFIG.MAX_SPEED_Z);

    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;

    p.x = wrapValue(p.x, -halfWidth, halfWidth);
    p.y = wrapValue(p.y, -halfHeight, halfHeight);
  }
}

function warmupParticles(startMs) {
  const warmupMs = Math.max(0, CONFIG.WARMUP_SECONDS * 1000);
  const stepMs = Math.max(1, CONFIG.WARMUP_STEP_MS);
  if (warmupMs <= 0 || particles.length === 0) return;

  // Use a local monotonic timeline for warmup so separation updates remain regular.
  let simTimeMs = 0;
  const steps = Math.floor(warmupMs / stepMs);
  for (let i = 0; i < steps; i += 1) {
    simTimeMs += stepMs;
    updateParticles(simTimeMs);
  }

  // Sync separation scheduler to real RAF time to avoid a force spike on first visible frames.
  lastSeparationUpdateMs = startMs;
}

function draw(nowMs) {
  const now = new Date();
  const timeKey = getTimeKey(now);
  if (timeKey !== lastTimeKey) {
    lastTimeKey = timeKey;
    rebuildClockFields(now);
  }

  updateParticles(nowMs);

  ctx.fillStyle = CONFIG.BG;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = CONFIG.BASE_ALPHA;

  const rx = camRight[0];
  const ry = camRight[1];
  const rz = camRight[2];
  const ux = camUp[0];
  const uy = camUp[1];
  const uz = camUp[2];
  const fx = camFwd[0];
  const fy = camFwd[1];
  const fz = camFwd[2];
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const dx = p.x - camX;
    const dy = p.y - camY;
    const dz = p.z - camZ;
    const depth = fx * dx + fy * dy + fz * dz;
    if (depth <= 0.001) continue;

    const perspective = focalLen / depth;
    const radius = p.size * perspective;
    if (radius < 0.3) continue;

    const sx = halfWidth + (rx * dx + ry * dy + rz * dz) * perspective;
    const sy = halfHeight - (ux * dx + uy * dy + uz * dz) * perspective;
    if (sx < -radius || sy < -radius || sx > width + radius || sy > height + radius) continue;

    ctx.fillStyle = p.colorRgb;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  rafId = requestAnimationFrame(draw);
}

function resize() {
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  maskCanvas.width = width;
  maskCanvas.height = height;

  buildCamera();
  buildTurbulenceField();
  rebuildClockFields(new Date());

  if (particles.length === 0) {
    buildParticles();
  }
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  maskCanvas = document.createElement("canvas");
  maskCtx = maskCanvas.getContext("2d");

  onResize = () => resize();
  window.addEventListener("resize", onResize);
  resize();
}

export function start() {
  const now = new Date();
  const startMs = performance.now();

  lastTimeKey = getTimeKey(now);
  rebuildClockFields(now);

  if (particles.length === 0) {
    buildParticles();
  }

  lastSeparationUpdateMs = 0;
  warmupParticles(startMs);
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
  lastTimeKey = "";

  particles = [];
  targets = [];
  targetBuckets = [];
  targetBucketCols = 0;
  targetBucketRows = 0;

  sepForceX = new Float32Array(0);
  sepForceY = new Float32Array(0);
  sepForceZ = new Float32Array(0);
  separationGrid = new Map();

  flowField = new Float32Array(0);
  flowCols = 0;
  flowRows = 0;
  flowLayers = 0;

  turbulenceField = new Float32Array(0);
  noiseCols = 0;
  noiseRows = 0;
  noiseLayers = 0;
}
