let canvas;
let gl;
let programUpdate;
let programPresent;
let quadBuffer;
let textures = [];
let framebuffers = [];
let writeIndex = 0;
let rafId;
let startTime = 0;
let lastDotTime = 0;
let dot = { x: 0.5, y: 0.5 };
let onResize = null;

const DOT_INTERVAL_MS = 1;
const DOT_RADIUS = 0.04;
const BLUR_RADIUS = 2;

const vertexSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const updateSource = `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_texel;
  uniform vec2 u_dot;
  uniform float u_aspect;
  uniform float u_dotRadius;
  uniform float u_blurRadius;
  uniform float u_addDot;
  varying vec2 v_uv;

  vec4 blurSample() {
    vec4 sum = texture2D(u_texture, v_uv) * 0.72;
    vec2 offset = u_texel * u_blurRadius;
    sum += texture2D(u_texture, v_uv + vec2(offset.x, 0.0)) * 0.07;
    sum += texture2D(u_texture, v_uv - vec2(offset.x, 0.0)) * 0.07;
    sum += texture2D(u_texture, v_uv + vec2(0.0, offset.y)) * 0.07;
    sum += texture2D(u_texture, v_uv - vec2(0.0, offset.y)) * 0.07;
    return sum;
  }

  void main() {
    vec4 base = max(blurSample() * 0.995 - vec4(0.002), 0.0);
    vec2 diff = (v_uv - u_dot) * vec2(u_aspect, 1.0);
    float d = length(diff);
    float dot = smoothstep(u_dotRadius, 0.0, d) * u_addDot;
    vec3 color = base.rgb + vec3(0.9) * dot;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const presentSource = `
  precision mediump float;

  uniform sampler2D u_texture;
  varying vec2 v_uv;

  void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(vertex, fragment) {
  const program = gl.createProgram();
  const vs = compileShader(gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl.FRAGMENT_SHADER, fragment);

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createTexture(width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function createFramebuffer(texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return framebuffer;
}

function setupQuad() {
  quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
}

function updateTextures() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  canvas.width = width;
  canvas.height = height;

  gl.viewport(0, 0, width, height);

  textures.forEach((texture) => gl.deleteTexture(texture));
  framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));

  textures = [createTexture(width, height), createTexture(width, height)];
  framebuffers = [
    createFramebuffer(textures[0]),
    createFramebuffer(textures[1])
  ];

  writeIndex = 0;
}

function drawFrame(time) {
  const elapsed = time - startTime;
  const addDot = elapsed - lastDotTime >= DOT_INTERVAL_MS ? 1 : 0;

  if (addDot) {
    lastDotTime = elapsed;
    dot.x = Math.random();
    dot.y = Math.random();
  }

  const readIndex = 1 - writeIndex;
  const readTexture = textures[readIndex];
  const writeBuffer = framebuffers[writeIndex];

  gl.bindFramebuffer(gl.FRAMEBUFFER, writeBuffer);
  gl.useProgram(programUpdate);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  const updatePosition = gl.getAttribLocation(programUpdate, "a_position");
  gl.enableVertexAttribArray(updatePosition);
  gl.vertexAttribPointer(updatePosition, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, readTexture);
  gl.uniform1i(gl.getUniformLocation(programUpdate, "u_texture"), 0);
  gl.uniform2f(
    gl.getUniformLocation(programUpdate, "u_texel"),
    1 / canvas.width,
    1 / canvas.height
  );
  gl.uniform2f(gl.getUniformLocation(programUpdate, "u_dot"), dot.x, dot.y);
  gl.uniform1f(
    gl.getUniformLocation(programUpdate, "u_aspect"),
    canvas.width / canvas.height
  );
  gl.uniform1f(gl.getUniformLocation(programUpdate, "u_dotRadius"), DOT_RADIUS);
  gl.uniform1f(gl.getUniformLocation(programUpdate, "u_blurRadius"), BLUR_RADIUS);
  gl.uniform1f(gl.getUniformLocation(programUpdate, "u_addDot"), addDot);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(programPresent);

  const presentPosition = gl.getAttribLocation(programPresent, "a_position");
  gl.enableVertexAttribArray(presentPosition);
  gl.vertexAttribPointer(presentPosition, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures[writeIndex]);
  gl.uniform1i(gl.getUniformLocation(programPresent, "u_texture"), 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  writeIndex = readIndex;
  rafId = requestAnimationFrame(drawFrame);
}

export function init({ container }) {
  canvas = document.createElement("canvas");
  canvas.className = "art-canvas";
  container.appendChild(canvas);

  gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) {
    throw new Error("WebGL not supported");
  }

  gl.disable(gl.DEPTH_TEST);

  programUpdate = createProgram(vertexSource, updateSource);
  programPresent = createProgram(vertexSource, presentSource);
  setupQuad();

  onResize = () => {
    updateTextures();
  };

  window.addEventListener("resize", onResize);
  updateTextures();
}

export function start() {
  startTime = performance.now();
  lastDotTime = 0;
  rafId = requestAnimationFrame(drawFrame);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  if (onResize) window.removeEventListener("resize", onResize);

  if (gl) {
    textures.forEach((texture) => gl.deleteTexture(texture));
    framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
    if (quadBuffer) gl.deleteBuffer(quadBuffer);
    if (programUpdate) gl.deleteProgram(programUpdate);
    if (programPresent) gl.deleteProgram(programPresent);
  }

  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);

  canvas = null;
  gl = null;
  programUpdate = null;
  programPresent = null;
  quadBuffer = null;
  textures = [];
  framebuffers = [];
  rafId = null;
  onResize = null;
}
