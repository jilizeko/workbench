let canvas;
let ctx;
let rafId;
let width = 0;
let height = 0;
let startTime = 0;
let onResize = null;

function resize() {
  if (!canvas) return;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.floor(width * window.devicePixelRatio);
  canvas.height = Math.floor(height * window.devicePixelRatio);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function draw(time) {
  const t = (time - startTime) * 0.001;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < 6; i += 1) {
    const offset = i * 0.8 + t;
    const x = Math.sin(offset) * width * 0.4 + width * 0.5;
    const y = Math.cos(offset * 0.8) * height * 0.4 + height * 0.5;
    const radius = Math.max(40, Math.min(width, height) * 0.15);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(230,230,230,0.12)");
    gradient.addColorStop(1, "rgba(17,17,17,0.0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  rafId = requestAnimationFrame(draw);
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
