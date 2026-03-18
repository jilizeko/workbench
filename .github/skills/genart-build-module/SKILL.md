---
name: genart-build-module
description: "Use when: generating a generative-art JavaScript module that implements init/start/destroy lifecycle for GenArtTable."
argument-hint: "Provide the approved concept brief and desired slug"
user-invocable: true
---

# GenArt Build Module

## Purpose
Generate the JavaScript module that implements the approved artwork concept using the project lifecycle.

## When to Use
- The concept brief is approved and ready for implementation.
- You need a new module under `docs/works/`.
- You must ensure lifecycle cleanup and no memory leaks.

## Procedure
1. Use the approved concept brief as the source of truth.
2. Implement the module lifecycle:
   - `init({ container, work })`
   - `start()`
   - `destroy()`
3. Follow implementation requirements:
   - render inside `#art-container`
   - create canvas dynamically
   - apply `art-canvas` class to the canvas
   - store references internally
   - clean up RAF and listeners in `destroy()`
4. Enforce animation rules:
   - continuous animation loop
   - avoid memory leaks
   - avoid global variables
5. Handle resize:
   - add a window `resize` listener in `init()`
   - recompute canvas size and internal buffers
   - remove the listener in `destroy()`
6. Export the lifecycle functions.
7. Add tunable parameters where useful (examples: particle count, noise scale, speed, trail length).

## Output Format
```
File path:
docs/works/<slug>.js

Module code:

Explanation of parameters:
```

## Module Skeleton (Guideline)
```js
let canvas;
let ctx;
let rafId;
let onResize;

function resize() {
   if (!canvas) return;
   const dpr = window.devicePixelRatio || 1;
   const width = Math.max(1, canvas.clientWidth);
   const height = Math.max(1, canvas.clientHeight);
   canvas.width = Math.floor(width * dpr);
   canvas.height = Math.floor(height * dpr);
   ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(time) {
   // render frame
   rafId = requestAnimationFrame(draw);
}

export function init({ container }) {
   canvas = document.createElement("canvas");
   canvas.className = "art-canvas";
   ctx = canvas.getContext("2d");
   container.appendChild(canvas);

   onResize = () => resize();
   window.addEventListener("resize", onResize);
   resize();
}

export function start() {
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
```

## Completion Rule
The module runs correctly when loaded by `app.js`.
