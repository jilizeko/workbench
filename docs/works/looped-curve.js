let canvas;
let ctx;
let rafId;
let width = 0;
let height = 0;
let startTime = 0;
let onResize = null;

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
}

function drawCurve(time) {
  const t = (time - startTime) * 0.0004;
  const phase = (t % (Math.PI * 2));
  const a = 3;
  const b = 4;
  const radius = Math.min(width, height) * 0.42;

  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  for (let i = 0; i <= 480; i += 1) {
    const p = (i / 480) * Math.PI * 2;
    const x = Math.sin(a * p + phase) * radius + width * 0.5;
    const y = Math.sin(b * p + phase * 0.9) * radius + height * 0.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "rgba(230, 230, 230, 0.85)";
  ctx.lineWidth = 1;
  ctx.stroke();

  rafId = requestAnimationFrame(drawCurve);
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
  rafId = requestAnimationFrame(drawCurve);
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
