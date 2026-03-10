let canvas;
let ctx;
let rafId;
let width = 0;
let height = 0;
let startTime = 0;
let position = { x: 0, y: 0 };
let onResize = null;

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  position = { x: width * 0.5, y: height * 0.5 };
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
}

function step() {
  const dx = Math.floor(Math.random() * 3) - 1;
  const dy = Math.floor(Math.random() * 3) - 1;

  position.x += dx;
  position.y += dy;

  if (position.x < 0 || position.x >= width || position.y < 0 || position.y >= height) {
    position.x = width * 0.5;
    position.y = height * 0.5;
  }
}

function draw(time) {
  const elapsed = (time - startTime) * 0.001;
  if (elapsed < 0) return;

  ctx.fillStyle = "rgba(0, 0, 0, 0.0005)";
  ctx.fillRect(0, 0, width, height);

  step();

  ctx.fillStyle = "white";
  ctx.fillRect(position.x, position.y, 1, 1);

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
}
