let canvas;
let ctx;
let rafId;
let width = 0;
let height = 0;
let dpr = 1;
let startTime = 0;
let lastTime = 0;
let onResize = null;
let vignetteCanvas;
let vignetteCtx;
let particles = [];
let spawnCarry = 0;
let spawnCarryCenter = 0;

const CONFIG = {
  BG: "#2b2b2b",
  FOG_DEPTH_RATIO: 0.9,
  FOG_FAR_DEPTH_RATIO: -0.9,
  FOG_NEAR_CURVE: .6,
  FOG_FAR_CURVE: .6,
  FOCAL_RATIO: 1.2,
  SPIRAL_LENGTH_RATIO: 2.,
  HOURS_RADIUS_RATIO: 0.25,
  MINUTES_RADIUS_RATIO: 0.2,
  SECONDS_RADIUS_RATIO: 0.1,
  HOURS_PITCH_RATIO: 0.818,
  MINUTES_PITCH_RATIO: -.000,
  SECONDS_PITCH_RATIO: -0.,
  NUMERAL_SIZE_RATIO: 0.025,
  TICK_LENGTH_RATIO: 0.25,
  TICK_WIDTH_RATIO: 0.01,
  DOT_SIZE_RATIO: 0.001,
  HAND_HOUR_LENGTH_RATIO: 0.122,
  HAND_MINUTE_LENGTH_RATIO: 0.22,
  HAND_WIDTH_RATIO: 0.01,
  SECOND_HAND_LENGTH_RATIO: 0.37,
  SECOND_HAND_WIDTH_RATIO: 0.002,
  PARTICLE_RATE: 10,
  PARTICLE_SPEED_RATIO: 0.0745,
  PARTICLE_TURN_RATE: .515,
  PARTICLE_SIZE_RATIO: 0.009,
  PARTICLE_MAX_LIFE: 180,
  PARTICLE_NEAR_DRIFT_FACTOR: 1.2,
  PARTICLE_FADEIN_TIME: 0.5,
  VIGNETTE_INNER: 0.,
  VIGNETTE_OUTER: 10.,
  VIGNETTE_DISSOLVE_START: 0.,
  VIGNETTE_DISSOLVE_END: .9,
  VIGNETTE_ALPHA: 0.,
  ANGLE_OFFSET: Math.PI * 0/12,
  ANGLE_DIRECTION: 1,
  TIME_DIRECTION: 1,
  TIME_ANGLE_OFFSET: .75,//-Math.PI * 4/12,
  HOUR_INDEX_OFFSET: 3,
  CENTER_EMITTER_ENABLED: true,
  CENTER_EMITTER_RATE: 5,
  CENTER_EMITTER_Z_OFFSET_RATIO: .9,
  CENTER_EMITTER_PREWARM: true,
  CENTER_EMITTER_SIZE_X_RATIO: 1,
  CENTER_EMITTER_SIZE_Y_RATIO: 1.,
  FONT_FAMILY: "Times New Roman",
  FONT_WEIGHT: "600",
  COLOR_HAND: "#ffffff",
  COLOR_NUMERAL: "#ffffff",
  COLOR_TICK: "#ffffff",
  COLOR_SECOND: "#ffffff",
  COLOR_DOT: "#ffffff",
};

const ROMAN = [
  "XII",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
];

let derived = {
  centerX: 0,
  centerY: 0,
  minDim: 0,
  focal: 0,
  fogDepthNear: 0,
  fogDepthFar: 0,
  spiralLength: 0,
  hourRadius: 0,
  minuteRadius: 0,
  secondRadius: 0,
  hourPitch: 0,
  minutePitch: 0,
  secondPitch: 0,
  numeralSize: 0,
  tickLength: 0,
  tickWidth: 0,
  dotSize: 0,
  hourHandLength: 0,
  minuteHandLength: 0,
  handWidth: 0,
  secondHandLength: 0,
  secondHandWidth: 0,
  particleSpeed: 0,
  particleSize: 0,
  centerEmitterZ: 0,
};

const BG_RGB = hexToRgb(CONFIG.BG);
const COLOR_HAND = hexToRgb(CONFIG.COLOR_HAND);
const COLOR_NUMERAL = hexToRgb(CONFIG.COLOR_NUMERAL);
const COLOR_TICK = hexToRgb(CONFIG.COLOR_TICK);
const COLOR_SECOND = hexToRgb(CONFIG.COLOR_SECOND);
const COLOR_DOT = hexToRgb(CONFIG.COLOR_DOT);

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(base, mix, alpha) {
  const r = Math.round(lerp(base.r, BG_RGB.r, mix));
  const g = Math.round(lerp(base.g, BG_RGB.g, mix));
  const b = Math.round(lerp(base.b, BG_RGB.b, mix));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fogFactor(z, depth, curve) {
  if (!depth) return 0;
  const raw = clamp(z / depth, 0, 1);
  return Math.pow(raw, curve);
}

function fogMix(z) {
  const near = fogFactor(z, derived.fogDepthNear, CONFIG.FOG_NEAR_CURVE);
  const far = fogFactor(z, derived.fogDepthFar, CONFIG.FOG_FAR_CURVE);
  return clamp(near + far, 0, 1);
}

function wrapSigned(value, length) {
  const half = length * 0.5;
  return ((value + half) % length + length) % length - half;
}

function hashNoise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function projectPoint(x, y, z) {
  const zClamped = Math.max(z, -derived.focal * 0.85);
  const scale = derived.focal / (derived.focal + zClamped);
  return {
    x: derived.centerX + x * scale,
    y: derived.centerY + y * scale,
    scale,
  };
}

function spiralPosition(angle, z, baseRadius, pitch) {
  const radius = Math.max(derived.minDim * 0.05, baseRadius + z * pitch);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function updateDerived() {
  derived.centerX = width * 0.5;
  derived.centerY = height * 0.5;
  derived.minDim = Math.min(width, height);
  derived.focal = derived.minDim * CONFIG.FOCAL_RATIO;
  derived.fogDepthNear = derived.minDim * CONFIG.FOG_DEPTH_RATIO;
  derived.fogDepthFar = derived.minDim * CONFIG.FOG_FAR_DEPTH_RATIO;
  derived.spiralLength = derived.minDim * CONFIG.SPIRAL_LENGTH_RATIO;
  derived.hourRadius = derived.minDim * CONFIG.HOURS_RADIUS_RATIO;
  derived.minuteRadius = derived.minDim * CONFIG.MINUTES_RADIUS_RATIO;
  derived.secondRadius = derived.minDim * CONFIG.SECONDS_RADIUS_RATIO;
  derived.hourPitch = derived.minDim * CONFIG.HOURS_PITCH_RATIO;
  derived.minutePitch = derived.minDim * CONFIG.MINUTES_PITCH_RATIO;
  derived.secondPitch = derived.minDim * CONFIG.SECONDS_PITCH_RATIO;
  derived.numeralSize = derived.minDim * CONFIG.NUMERAL_SIZE_RATIO;
  derived.tickLength = derived.minDim * CONFIG.TICK_LENGTH_RATIO;
  derived.tickWidth = derived.minDim * CONFIG.TICK_WIDTH_RATIO;
  derived.dotSize = derived.minDim * CONFIG.DOT_SIZE_RATIO;
  derived.hourHandLength = derived.minDim * CONFIG.HAND_HOUR_LENGTH_RATIO;
  derived.minuteHandLength = derived.minDim * CONFIG.HAND_MINUTE_LENGTH_RATIO;
  derived.handWidth = derived.minDim * CONFIG.HAND_WIDTH_RATIO;
  derived.secondHandLength = derived.minDim * CONFIG.SECOND_HAND_LENGTH_RATIO;
  derived.secondHandWidth = derived.minDim * CONFIG.SECOND_HAND_WIDTH_RATIO;
  derived.particleSpeed = derived.minDim * CONFIG.PARTICLE_SPEED_RATIO;
  derived.particleSize = derived.minDim * CONFIG.PARTICLE_SIZE_RATIO;
  derived.centerEmitterZ = derived.minDim * CONFIG.CENTER_EMITTER_Z_OFFSET_RATIO;
}

function buildVignette() {
  if (!vignetteCanvas) {
    vignetteCanvas = document.createElement("canvas");
    vignetteCtx = vignetteCanvas.getContext("2d");
  }

  vignetteCanvas.width = width;
  vignetteCanvas.height = height;

  const image = vignetteCtx.createImageData(width, height);
  const data = image.data;
  const maxDist = Math.hypot(derived.centerX, derived.centerY);
  const inner = CONFIG.VIGNETTE_INNER;
  const outer = CONFIG.VIGNETTE_OUTER;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - derived.centerX;
      const dy = y - derived.centerY;
      const r = Math.hypot(dx, dy) / maxDist;
      let alpha = clamp((r - inner) / (outer - inner), 0, 1);

      if (r > CONFIG.VIGNETTE_DISSOLVE_START) {
        const edge = clamp(
          (r - CONFIG.VIGNETTE_DISSOLVE_START) /
            (CONFIG.VIGNETTE_OUTER - CONFIG.VIGNETTE_DISSOLVE_START),
          0,
          1,
        );
        const threshold = lerp(
          CONFIG.VIGNETTE_DISSOLVE_START,
          CONFIG.VIGNETTE_DISSOLVE_END,
          edge,
        );
        if (hashNoise(x, y) < threshold) alpha = 0;
      }

      alpha *= CONFIG.VIGNETTE_ALPHA;

      const idx = (y * width + x) * 4;
      data[idx] = BG_RGB.r;
      data[idx + 1] = BG_RGB.g;
      data[idx + 2] = BG_RGB.b;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  vignetteCtx.putImageData(image, 0, 0);
}

function spawnParticle(originX, originY) {
  const jitter = derived.minDim * 0.003;
  const startX = originX + (Math.random() * 2 - 1) * jitter;
  const startY = originY + (Math.random() * 2 - 1) * jitter;
  let vx = (Math.random() * 2 - 1) * 0.2;
  let vy = (Math.random() * 2 - 1) * 0.2;
  let vz = -1;
  const inv = 1 / Math.hypot(vx, vy, vz);
  vx *= inv * derived.particleSpeed;
  vy *= inv * derived.particleSpeed;
  vz *= inv * derived.particleSpeed;

  particles.push({
    x: startX,
    y: startY,
    z: 0,
    vx,
    vy,
    vz,
    life: 0,
  });
}

function spawnCenterParticle() {
  const jitter = derived.minDim * 0.003;
  const sizeX = derived.minDim * CONFIG.CENTER_EMITTER_SIZE_X_RATIO;
  const sizeY = derived.minDim * CONFIG.CENTER_EMITTER_SIZE_Y_RATIO;
  const startX = (Math.random() - 0.5) * sizeX;
  const startY = (Math.random() - 0.5) * sizeY;
  let vx = (Math.random() * 2 - 1) * 0.2;
  let vy = (Math.random() * 2 - 1) * 0.2;
  let vz = -1;
  const inv = 1 / Math.hypot(vx, vy, vz);
  vx *= inv * derived.particleSpeed;
  vy *= inv * derived.particleSpeed;
  vz *= inv * derived.particleSpeed;

  particles.push({
    x: startX,
    y: startY,
    z: derived.centerEmitterZ,
    vx,
    vy,
    vz,
    life: 0,
  });
}

function updateParticles(dt) {
  const alive = [];
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    p.life += dt;
    p.vx += (Math.random() * 2 - 1) * CONFIG.PARTICLE_TURN_RATE * derived.particleSpeed * dt;
    p.vy += (Math.random() * 2 - 1) * CONFIG.PARTICLE_TURN_RATE * derived.particleSpeed * dt;
    p.vz += (Math.random() * 2 - 1) * CONFIG.PARTICLE_TURN_RATE * derived.particleSpeed * dt;
    const speed = Math.max(1e-4, Math.hypot(p.vx, p.vy, p.vz));
    const norm = derived.particleSpeed / speed;
    p.vx *= norm;
    p.vy *= norm;
    p.vz *= norm;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    const nearStart = -derived.focal * 0.3;
    if (p.z < nearStart) {
      const nearness = clamp((nearStart - p.z) / (derived.focal * 0.65), 0, 1);
      const drift = nearness * CONFIG.PARTICLE_NEAR_DRIFT_FACTOR * derived.particleSpeed * dt;
      const lateralLen = Math.hypot(p.vx, p.vy);
      if (lateralLen > 1e-6) {
        p.x += (p.vx / lateralLen) * drift;
        p.y += (p.vy / lateralLen) * drift;
      }
    }

    if (p.life < CONFIG.PARTICLE_MAX_LIFE && p.z > -derived.focal * 0.95) {
      alive.push(p);
    }
  }
  particles = alive;
}

function prewarmParticles() {
  particles = [];
  const duration = Math.max(0, CONFIG.PARTICLE_MAX_LIFE);
  const step = 1 / 60;
  let carryCenter = 0;
  let carrySecond = 0;
  const nowMs = Date.now();
  const doCenter = CONFIG.CENTER_EMITTER_ENABLED && CONFIG.CENTER_EMITTER_PREWARM;

  for (let t = 0; t < duration; t += step) {
    if (doCenter) {
      carryCenter += step * CONFIG.CENTER_EMITTER_RATE;
      const cc = Math.floor(carryCenter);
      carryCenter -= cc;
      for (let i = 0; i < cc; i += 1) {
        spawnCenterParticle();
      }
    }

    const simDate = new Date(nowMs - (duration - t) * 1000);
    const sec = simDate.getSeconds();
    const ms = simDate.getMilliseconds();
    const secondFrac = (sec + ms / 1000) / 60;
    const secondAngle = angleFromFrac(secondFrac);
    const ox = Math.sin(secondAngle) * derived.secondHandLength;
    const oy = -Math.cos(secondAngle) * derived.secondHandLength;

    carrySecond += step * CONFIG.PARTICLE_RATE;
    const sc = Math.floor(carrySecond);
    carrySecond -= sc;
    for (let i = 0; i < sc; i += 1) {
      spawnParticle(ox, oy);
    }

    updateParticles(step);
  }
}

function angleFromFrac(frac) {
  return CONFIG.ANGLE_OFFSET + CONFIG.ANGLE_DIRECTION * frac * Math.PI * 2;
}

function drawHands(hourAngle, minuteAngle, secondAngle) {
  ctx.save();
  ctx.translate(derived.centerX, derived.centerY);

  ctx.fillStyle = CONFIG.COLOR_HAND;
  ctx.rotate(hourAngle);
  ctx.fillRect(
    -derived.handWidth * 0.5,
    -derived.handWidth * 0.5,
    derived.handWidth,
    -derived.hourHandLength,
  );
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(derived.centerX, derived.centerY);

  ctx.rotate(minuteAngle);
  ctx.fillRect(
    -derived.handWidth * 0.5,
    -derived.handWidth * 0.5,
    derived.handWidth,
    -derived.minuteHandLength,
  );
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(derived.centerX, derived.centerY);

  ctx.fillStyle = CONFIG.COLOR_SECOND;
  ctx.rotate(secondAngle);
  ctx.fillRect(
    -derived.secondHandWidth * 0.5,
    -derived.secondHandWidth * 0.5,
    derived.secondHandWidth,
    -derived.secondHandLength,
  );
  ctx.restore();
}

function buildDrawables(hourFrac, minuteFrac, secondFrac, hourAngle, minuteAngle, secondAngle) {
  const drawables = [];
  const hourDepthFrac = hourFrac + CONFIG.TIME_ANGLE_OFFSET;
  const minuteDepthFrac = minuteFrac + CONFIG.TIME_ANGLE_OFFSET;
  const secondDepthFrac = secondFrac + CONFIG.TIME_ANGLE_OFFSET;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 12; i += 1) {
    const numeralIndex = (i + CONFIG.HOUR_INDEX_OFFSET + 12) % 12;
    const angle = angleFromFrac(i / 12);
    const z = wrapSigned(
      (i / 12 - hourDepthFrac) * derived.spiralLength * CONFIG.TIME_DIRECTION,
      derived.spiralLength,
    );
    const pos = spiralPosition(angle, z, derived.hourRadius, derived.hourPitch);
    const proj = projectPoint(pos.x, pos.y, z);
    const fog = fogMix(z);
    const fontSize = derived.numeralSize * proj.scale;

    drawables.push({
      z,
      draw: () => {
        ctx.font = `${CONFIG.FONT_WEIGHT} ${fontSize}px ${CONFIG.FONT_FAMILY}, serif`;
        ctx.fillStyle = mixColor(COLOR_NUMERAL, fog, 1);
        ctx.fillText(ROMAN[numeralIndex], proj.x, proj.y);
      },
    });
  }

  for (let i = 0; i < 60; i += 1) {
    const angle = angleFromFrac(i / 60);
    const z = wrapSigned(
      (i / 60 - minuteDepthFrac) * derived.spiralLength * CONFIG.TIME_DIRECTION,
      derived.spiralLength,
    );
    const pos = spiralPosition(angle, z, derived.minuteRadius, derived.minutePitch);
    const proj = projectPoint(pos.x, pos.y, z);
    const fog = fogMix(z);
    const scale = proj.scale;
    const length = derived.tickLength * scale;
    const widthTick = derived.tickWidth * scale;

    drawables.push({
      z,
      draw: () => {
        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(angle + Math.PI * 0.5);
        ctx.fillStyle = mixColor(COLOR_TICK, fog, 1);
        ctx.fillRect(-widthTick * 0.5, -length, widthTick, length);
        ctx.restore();
      },
    });
  }

  for (let i = 0; i < 60; i += 1) {
    const angle = angleFromFrac(i / 60);
    const z = wrapSigned(
      (i / 60 - secondDepthFrac) * derived.spiralLength * CONFIG.TIME_DIRECTION,
      derived.spiralLength,
    );
    const pos = spiralPosition(angle, z, derived.secondRadius, derived.secondPitch);
    const proj = projectPoint(pos.x, pos.y, z);
    const fog = fogMix(z);
    const size = derived.dotSize * proj.scale;

    drawables.push({
      z,
      draw: () => {
        ctx.fillStyle = mixColor(COLOR_DOT, fog, 1);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    drawables.push({
      z: p.z,
      draw: () => {
        const proj = projectPoint(p.x, p.y, p.z);
        const fog = fogMix(p.z);
        const fadein = clamp(p.life / CONFIG.PARTICLE_FADEIN_TIME, 0, 1);
        const size = derived.particleSize * proj.scale * fadein;

        ctx.fillStyle = mixColor(COLOR_SECOND, fog, 1);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  drawables.push({
    z: 0,
    draw: () => drawHands(hourAngle, minuteAngle, secondAngle),
  });

  drawables.sort((a, b) => b.z - a.z);
  return drawables;
}

function draw(time) {
  const dt = Math.min(0.05, lastTime ? (time - lastTime) * 0.001 : 0);
  lastTime = time;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CONFIG.BG;
  ctx.fillRect(0, 0, width, height);

  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();

  const hourFrac = (hours + minutes / 60 + seconds / 3600) / 12;
  const minuteFrac = (minutes + seconds / 60 + millis / 60000) / 60;
  const secondFrac = (seconds + millis / 1000) / 60;

  const hourAngle = angleFromFrac(hourFrac);
  const minuteAngle = angleFromFrac(minuteFrac);
  const secondAngle = angleFromFrac(secondFrac);

  const origin = {
    x: derived.centerX + Math.sin(secondAngle) * derived.secondHandLength,
    y: derived.centerY - Math.cos(secondAngle) * derived.secondHandLength,
  };

  spawnCarry += dt * CONFIG.PARTICLE_RATE;
  const spawnCount = Math.floor(spawnCarry);
  spawnCarry -= spawnCount;
  for (let i = 0; i < spawnCount; i += 1) {
    spawnParticle(origin.x - derived.centerX, origin.y - derived.centerY);
  }

  if (CONFIG.CENTER_EMITTER_ENABLED) {
    spawnCarryCenter += dt * CONFIG.CENTER_EMITTER_RATE;
    const centerCount = Math.floor(spawnCarryCenter);
    spawnCarryCenter -= centerCount;
    for (let i = 0; i < centerCount; i += 1) {
      spawnCenterParticle();
    }
  }

  updateParticles(dt);

  const drawables = buildDrawables(hourFrac, minuteFrac, secondFrac, hourAngle, minuteAngle, secondAngle);
  for (let i = 0; i < drawables.length; i += 1) {
    drawables[i].draw();
  }

  if (vignetteCanvas) {
    ctx.drawImage(vignetteCanvas, 0, 0);
  }

  rafId = requestAnimationFrame(draw);
}

function resize() {
  if (!canvas) return;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateDerived();
  buildVignette();
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  onResize = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resize();
  };

  window.addEventListener("resize", onResize);
  resize();
}

export function start() {
  startTime = performance.now();
  lastTime = 0;
  spawnCarry = 0;
  spawnCarryCenter = 0;
  prewarmParticles();
  rafId = requestAnimationFrame(draw);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);

  particles = [];
  canvas = null;
  ctx = null;
  rafId = null;
  onResize = null;
  vignetteCanvas = null;
  vignetteCtx = null;
}
