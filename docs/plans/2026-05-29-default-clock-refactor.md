# Default Clock Refactor Implementation Plan

> For Hermes / future agent: this plan is intentionally resumable. Before doing any task, read the `Current State`, `Resume Protocol`, and the latest `Progress Log`. Do not assume prior chat context exists.

Goal: Refactor `Default Clock` from a single large work file into a small modular clock engine, while keeping the render/capture pipeline working at every step.

Architecture: Keep `docs/works/default-clock.js` as the public work entrypoint, but progressively move independent responsibilities into modules under `docs/works/default-clock/`. Do the refactor in small commits with a working render smoke test after each stage. Prefer compatibility shims over broad rewrites.

Tech Stack: Static ES modules, browser Canvas 2D, Playwright-based render capture, Node scripts in `scripts/render-*.mjs`.

---

## Current State At Plan Creation

Date: 2026-05-29
Repo: `/Users/p.parchevsky/Desktop/self/GenArtTable`
Baseline commit before this plan: `162d46f Add default clock work variant`

Important files:
- `docs/works/default-clock.js` — current main work file, 1375 lines.
- `docs/works/default-clock.config.js` — config defaults + localStorage load/save/reset, 239 lines.
- `docs/works/time-satellite-1.js` — exact duplicate of `default-clock.js`; currently not used by registry.
- `docs/registry.js` — `time-satellite-1` already points to `./works/default-clock.js?v=time-satellite-1-default-alias-1`.
- `scripts/render-capture.mjs` — Playwright capture script; currently assumes exactly one `canvas.art-canvas`.
- `render-specs/default-clock.json` — render spec for default-clock smoke assets.

Observed facts:
- `docs/works/default-clock.js == docs/works/time-satellite-1.js` was true at plan creation.
- `npm run render:default-clock:still` currently fails because `locator('canvas.art-canvas')` matches both `.dc-base-canvas` and `.dc-fx-canvas`.
- Browser manual load works at `http://localhost:8087/works/default-clock.html?ui=0&fullscreen=1&time=2026-05-29T10:10:30.000Z`, with two canvases:
  - `.dc-base-canvas` opacity 0
  - `.dc-fx-canvas` opacity 1
- `time` query currently fixes the displayed clock via patched `Date`, but camera/fx motion still use RAF `timeMs`, so captures are not fully deterministic yet.

---

## Resume Protocol

Run these before continuing any task:

```bash
cd /Users/p.parchevsky/Desktop/self/GenArtTable
git status --short
git log -5 --oneline
```

If working tree is dirty:
1. Inspect with `git diff --stat` and `git diff`.
2. Read the `Progress Log` below.
3. Continue only if the dirty changes match the active task.
4. If changes look unrelated, stop and ask the user.

Before implementing a task, check whether it is already done:

```bash
grep -R "data-capture-target" -n docs/works scripts || true
test -f docs/works/time-satellite-1.js && cmp -s docs/works/default-clock.js docs/works/time-satellite-1.js && echo duplicate || true
```

After every task:

```bash
npm run render:default-clock:still
git status --short
git diff --stat
```

Commit after every completed task unless the user says not to. Do not push unless explicitly asked.

---

## Refactor Principles

1. Keep render pipeline green after every task.
2. Preserve public URLs:
   - `/works/default-clock.html`
   - `/works/time-satellite-1.html`
3. Avoid visual changes unless a task explicitly says visual change is expected.
4. Avoid changing `.obsidian/`, unrelated assets, or old work files.
5. Prefer moving code over rewriting code in early steps.
6. Each commit should be small enough to revert independently.
7. If a task fails verification, update this plan with the observed failure before trying a different approach.

---

## Task 0: Fix Capture Target Selection

Status: done

Objective: Make the render pipeline work with multi-canvas works by marking the final Default Clock canvas and teaching capture to prefer explicit targets.

Files:
- Modify: `docs/works/default-clock.js`
- Modify: `scripts/render-capture.mjs`

Implementation steps:

1. In `docs/works/default-clock.js`, inside `init`, after creating `fxCanvas`, set an explicit capture target:

```js
fxCanvas.dataset.captureTarget = "true";
```

Recommended location: immediately after `fxCanvas.className = "art-canvas dc-fx-canvas";`.

2. In `scripts/render-capture.mjs`, add a helper near `waitForCaptureReady`:

```js
async function getCaptureCanvasHandle(page, candidateId) {
  const explicit = page.locator('canvas[data-capture-target="true"]').last();
  if (await explicit.count()) {
    return explicit.elementHandle();
  }

  const visibleCanvases = page.locator("canvas.art-canvas:visible");
  const visibleCount = await visibleCanvases.count();
  if (visibleCount === 1) {
    return visibleCanvases.first().elementHandle();
  }
  if (visibleCount > 1) {
    return visibleCanvases.last().elementHandle();
  }

  const canvases = page.locator("canvas.art-canvas");
  const count = await canvases.count();
  if (count === 1) {
    return canvases.first().elementHandle();
  }
  if (count > 1) {
    return canvases.last().elementHandle();
  }

  throw new Error(`Canvas not found for ${candidateId}`);
}
```

3. Replace both occurrences of this pattern:

```js
const canvasHandle = await page.locator("canvas.art-canvas").elementHandle();
if (!canvasHandle) {
  throw new Error(`Canvas not found for ${candidate.id}`);
}
```

with:

```js
const canvasHandle = await getCaptureCanvasHandle(page, candidate.id);
```

4. Important discovered pitfall: Playwright `elementHandle.screenshot()` can time out on Default Clock because the final canvas sits inside an animated CSS camera transform and is never considered stable. Use canvas pixel export instead:

```js
async function writeCanvasPng(canvasHandle, outputPath) {
  const dataUrl = await canvasHandle.evaluate((canvas) => canvas.toDataURL("image/png"));
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
}
```

Then replace image and video frame screenshots with:

```js
await writeCanvasPng(canvasHandle, outputPathOrFramePath);
```

5. `scripts/` is ignored by `.gitignore`. If committing the capture script, use `git add -f scripts/render-capture.mjs`.

Verification:

```bash
npm run render:default-clock:still
```

Expected:
- command exits 0
- output includes `Captured poster-frame--seed-default-clock-a--time-2026-05-29T10-10-30-000Z--frame-0`
- output includes `Wrote capture report: docs/media/default-clock/candidates/reports/...json`
- `git status --short` shows only expected source/script changes and newly updated generated capture report/render files if any.

Commit:

```bash
git add docs/works/default-clock.js scripts/render-capture.mjs docs/media/default-clock/candidates
git commit -m "Fix capture target for multi-canvas works"
```

If generated media changes are too noisy, inspect first and include only useful manifest/report updates. Do not commit huge frame directories unless intentionally generated.

---

## Task 1: Remove Obsolete Time Satellite Duplicate

Status: done

Objective: Remove the dead duplicate `docs/works/time-satellite-1.js` because registry already aliases Time Satellite to `default-clock.js`.

Files:
- Delete: `docs/works/time-satellite-1.js`
- Inspect only: `docs/registry.js`

Pre-check:

```bash
grep -n "time-satellite-1" docs/registry.js
cmp -s docs/works/default-clock.js docs/works/time-satellite-1.js && echo "safe duplicate"
```

Expected:
- registry script for `time-satellite-1` is `./works/default-clock.js?...`
- duplicate check prints `safe duplicate`

Implementation:

```bash
git rm docs/works/time-satellite-1.js
```

Verification:

```bash
npm run render:default-clock:still
```

Optional browser smoke test:

```bash
python3 -m http.server 8087 --directory docs
# open http://localhost:8087/works/time-satellite-1.html?ui=0&fullscreen=1
```

Expected:
- default-clock still renders/captures
- Time Satellite URL still loads because `docs/registry.js` points to `default-clock.js`

Commit:

```bash
git add docs/registry.js docs/works/time-satellite-1.js docs/media/default-clock/candidates
git commit -m "Remove duplicate time satellite work module"
```

Note: `git add docs/registry.js` is harmless if unchanged; commit should contain the deletion and any verified capture artifacts only.

---

## Task 2: Create Default Clock Module Directory Without Behavior Change

Status: pending

Objective: Prepare the module boundary while keeping imports stable.

Files:
- Create directory: `docs/works/default-clock/`
- Create: `docs/works/default-clock/README.md`

Implementation:

Create `docs/works/default-clock/README.md` with:

```md
# Default Clock Modules

This folder contains the modular implementation behind `../default-clock.js`.

Public entrypoint remains:
- `docs/works/default-clock.js`

Module boundaries:
- `config.js` — defaults, sanitize, load/save/reset
- `schema.js` — author controls schema: ranges, select options, hints, panel tree
- `math.js` — clamp, color conversion, noise helpers
- `camera.js` — CSS 3D camera transform
- `clock-scene.js` — base clock canvas drawing
- `fx-stack.js` — post-processing layers
- `author-panel.js` — author UI only
- `frame-state.js` — wall time + motion time adapter for capture determinism
```

Verification:

```bash
npm run render:default-clock:still
```

Commit:

```bash
git add docs/works/default-clock/README.md
git commit -m "Document default clock module boundaries"
```

---

## Task 3: Move Config Values Into Module Directory

Status: pending

Objective: Move `default-clock.config.js` to `default-clock/config.js` and keep a compatibility re-export so existing imports do not break during refactor.

Files:
- Create: `docs/works/default-clock/config.js`
- Modify: `docs/works/default-clock.config.js`
- Modify eventually: `docs/works/default-clock.js`

Implementation:

1. Copy full current content of `docs/works/default-clock.config.js` to `docs/works/default-clock/config.js`.
2. Replace `docs/works/default-clock.config.js` with a compatibility shim:

```js
export {
  DEFAULT_CLOCK_CONFIG,
  DEFAULT_DEFAULT_CLOCK_CONFIG,
  loadDefaultClockConfig,
  resetDefaultClockConfig,
  saveDefaultClockConfig,
} from "./default-clock/config.js";
```

3. Do not change `default-clock.js` import yet, unless verification passes and the change is trivial.

Verification:

```bash
npm run render:default-clock:still
```

Commit:

```bash
git add docs/works/default-clock.config.js docs/works/default-clock/config.js
git commit -m "Move default clock config into module directory"
```

---

## Task 4: Extract Author Control Schema

Status: pending

Objective: Move control metadata out of `default-clock.js` without changing behavior.

Files:
- Create: `docs/works/default-clock/schema.js`
- Modify: `docs/works/default-clock.js`

Move these declarations from `default-clock.js` to `schema.js`:
- `NUMBER_RANGES`
- `SELECT_OPTIONS`
- `CONTROL_HINTS`
- `PANEL_TREE`

Keep these in `default-clock.js` or derive after import:

```js
const COLOR_KEYS = new Set(Object.keys(DEFAULT_CLOCK_CONFIG).filter(...));
const BOOL_KEYS = new Set(Object.keys(DEFAULT_CLOCK_CONFIG).filter(...));
```

Add import at top of `default-clock.js`:

```js
import {
  CONTROL_HINTS,
  NUMBER_RANGES,
  PANEL_TREE,
  SELECT_OPTIONS,
} from "./default-clock/schema.js";
```

Verification:

```bash
npm run render:default-clock:still
```

Manual author UI check:
- Open `/works/default-clock.html`
- Press Space
- Confirm panel opens and controls are grouped as before.

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/schema.js
git commit -m "Extract default clock control schema"
```

---

## Task 5: Extract Utility Math And Color Helpers

Status: pending

Objective: Move pure helpers out of the renderer.

Files:
- Create: `docs/works/default-clock/math.js`
- Modify: `docs/works/default-clock.js`

Move:
- `clamp`
- `pad2`
- `hexToRgba`
- `smoothstep`
- `hashNoise`
- `gradient1D`
- `perlin1D`
- `fbm3`
- `toDeg`
- `SIMPLEX_GRAD_3D`
- `fastFloor`
- `simplexHash3`
- `simplex3D`
- `fractalSimplex3D`
- `simplex01`
- `hash2`

Export the helpers used by other modules.

Verification:

```bash
npm run render:default-clock:still
```

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/math.js
git commit -m "Extract default clock math helpers"
```

---

## Task 6: Extract Capture-Aware Frame State

Status: pending

Objective: Make capture timing deterministic for both clock display and motion FX.

Files:
- Create: `docs/works/default-clock/frame-state.js`
- Modify: `docs/app.js` if needed
- Modify: `docs/works/default-clock.js`

Target behavior:
- live mode uses real wall clock and RAF motion time.
- capture mode with `?time=...&frame=...` uses fixed wall time plus frame offset for both Date and motion FX.

Implementation sketch:

```js
export function getFrameState(rafTimeMs, getClockTime) {
  const capture = window.__GENART_CAPTURE__;
  const motionTimeMs = Number.isFinite(capture?.motionTimeMs) ? capture.motionTimeMs : rafTimeMs;
  const wallDate = new Date();
  return {
    wallDate,
    motionTimeMs,
    clock: getClockTime(wallDate),
  };
}
```

In `docs/app.js`, inside `captureStill(frameTime)`, expose the deterministic motion time:

```js
api.motionTimeMs = Number.isFinite(frameMs) ? frameMs : 0;
```

Important: if this changes live behavior, stop and revise. Capture determinism must not make live mode static.

Verification:

```bash
npm run render:default-clock:still
```

Optional determinism check:

```bash
npm run render:default-clock:still
npm run render:default-clock:still
# compare latest two PNG outputs by checksum if filenames differ
```

Commit:

```bash
git add docs/app.js docs/works/default-clock.js docs/works/default-clock/frame-state.js docs/media/default-clock/candidates
git commit -m "Make default clock capture timing deterministic"
```

---

## Task 7: Extract Camera Module

Status: pending

Objective: Move CSS 3D camera calculation out of the main entrypoint.

Files:
- Create: `docs/works/default-clock/camera.js`
- Modify: `docs/works/default-clock.js`

Move:
- `applyCamera3D`

New function shape:

```js
export function applyCamera3D({ cameraStage, cameraPlane, config, motionTimeMs }) {
  // existing body, replacing CONFIG with config and timeMs with motionTimeMs
}
```

Verification:

```bash
npm run render:default-clock:still
```

Manual check:
- Open `/works/default-clock.html`
- Toggle camera controls in panel
- Confirm 3D transform still responds.

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/camera.js
git commit -m "Extract default clock camera module"
```

---

## Task 8: Extract Clock Scene Drawing

Status: pending

Objective: Move base clock drawing to a renderer module with explicit dependencies.

Files:
- Create: `docs/works/default-clock/clock-scene.js`
- Modify: `docs/works/default-clock.js`

Move:
- `getClockTime` if not moved to frame-state
- `drawBackground`
- `drawFaceRing`
- `drawTicks`
- `drawDigitRing`
- `drawSecondProgress`
- `drawHand`
- `drawAnalogHands`
- `drawCenterTime`
- `draw`

New function shape:

```js
export function drawClockScene({ ctx, width, height, config, now, clock }) {
  // previous draw body
}
```

Verification:

```bash
npm run render:default-clock:still
```

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/clock-scene.js
git commit -m "Extract default clock scene renderer"
```

---

## Task 9: Extract FX Stack

Status: pending

Objective: Move post-processing out of entrypoint and set up future optimization.

Files:
- Create: `docs/works/default-clock/fx-stack.js`
- Modify: `docs/works/default-clock.js`

Move:
- `setComposite`
- `applyBaseGrade`
- `createDisplacementMapGenerator`
- `drawFractalNoise`
- `drawDistortion`
- `drawRadialBlurFrom`
- `drawTintedScaledChannel`
- `drawAberration`
- `makeHalationMask`
- `drawHalation`
- `drawLensEffects`
- `renderFxStack`

New function shape:

```js
export function renderFxStack({
  config,
  canvas,
  ctx,
  fxCanvas,
  fxCtx,
  fxScratchCanvas,
  fxScratchCtx,
  fxMapCanvas,
  fxMapCtx,
  cameraPlane,
  width,
  height,
  motionTimeMs,
}) {
  // previous renderFxStack body
}
```

Verification:

```bash
npm run render:default-clock:still
```

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/fx-stack.js
git commit -m "Extract default clock FX stack"
```

---

## Task 10: Extract Author Panel

Status: pending

Objective: Move author-only UI out of the rendering entrypoint.

Files:
- Create: `docs/works/default-clock/author-panel.js`
- Modify: `docs/works/default-clock.js`

Move:
- `readJsonStore`
- `writeJsonStore`
- `saveConfig` or replace with callback
- `createPanelStyle`
- `formatControlValue`
- `labelFor`
- `createNumberControl`
- `createColorControl`
- `createBoolControl`
- `createSelectControl`
- `shouldShowPanel`
- `isEditableTarget`
- `togglePanel`
- `handleGlobalKeydown`
- `appendControlsForGroup`
- `createGroup`
- `buildPanel`
- `destroyPanel`

Preferred API:

```js
const authorPanel = createAuthorPanel({
  config: CONFIG,
  defaultConfig: DEFAULT_CLOCK_CONFIG,
  saveConfig,
  resetConfig: resetDefaultClockConfig,
  schema: { NUMBER_RANGES, SELECT_OPTIONS, CONTROL_HINTS, PANEL_TREE },
});

authorPanel.build();
window.addEventListener("keydown", authorPanel.handleGlobalKeydown);
```

Verification:

```bash
npm run render:default-clock:still
```

Manual UI check:
- Open `/works/default-clock.html`
- Space toggles panel.
- Change a numeric slider; refresh; value persists.
- Reset Defaults works.
- Copy JSON works if clipboard permission allows it.

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/author-panel.js
git commit -m "Extract default clock author panel"
```

---

## Task 11: Optimize Static Layers With Dirty Cache

Status: pending

Objective: Reduce per-frame drawing cost without changing visual output.

Files:
- Modify: `docs/works/default-clock/clock-scene.js`
- Possibly create: `docs/works/default-clock/layer-cache.js`

Approach:
- Cache static dial layer: background-independent face ring, ticks, digits if relevant config/size unchanged.
- Keep moving layers dynamic: seconds progress, second dot, analog hands, center time.
- Invalidate cache on resize and config changes.

Verification:

```bash
npm run render:default-clock:still
```

Manual performance check in browser console:

```js
(async()=>{const frames=[];let last=performance.now();return await new Promise(resolve=>{let n=0;function tick(t){frames.push(t-last);last=t;if(++n<180)requestAnimationFrame(tick);else{frames.shift();frames.sort((a,b)=>a-b);const avg=frames.reduce((s,x)=>s+x,0)/frames.length;resolve({count:frames.length,avgMs:avg,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames[frames.length-1]});}}requestAnimationFrame(tick);});})()
```

Record before/after in this plan before committing.

Commit:

```bash
git add docs/works/default-clock.js docs/works/default-clock/*.js docs/media/default-clock/candidates
git commit -m "Cache default clock static layers"
```

---

## Task 12: Optimize Noise/Distortion Buffers

Status: pending

Objective: Reduce per-frame allocations and full-resolution raster work in FX.

Files:
- Modify: `docs/works/default-clock/fx-stack.js`

Approach:
- Reuse ImageData buffers for distortion when dimensions unchanged.
- Render noise into a lower-resolution scratch canvas and upscale where visually acceptable.
- Avoid creating gradients/filters repeatedly when config/size unchanged.
- Keep all optimizations behind identical config behavior.

Verification:

```bash
npm run render:default-clock:still
```

Manual check:
- Enable distortion in author panel.
- Verify frame still updates and no console errors.
- Compare performance measurement before/after.

Commit:

```bash
git add docs/works/default-clock/fx-stack.js docs/media/default-clock/candidates
git commit -m "Optimize default clock FX buffers"
```

---

## Final Acceptance Criteria

The refactor is complete when:

- `npm run render:default-clock:still` exits 0.
- `/works/default-clock.html` loads live.
- `/works/time-satellite-1.html` loads live.
- Space toggles the author panel in live mode.
- `?ui=0&fullscreen=1&time=...` hides UI and captures final canvas.
- `docs/works/default-clock.js` is a thin entrypoint, ideally under 250 lines.
- No duplicate `time-satellite-1.js` copy exists.
- Main responsibilities live in named modules under `docs/works/default-clock/`.

---

## Progress Log

- 2026-05-29: Plan created after baseline commit `162d46f`. Task 0 implemented locally: `default-clock.js` marks `.dc-fx-canvas` with `data-capture-target="true"`; ignored script `scripts/render-capture.mjs` now prefers explicit capture canvas and writes canvas PNG via `toDataURL` to avoid Playwright element screenshot stability timeout. Verification passed: `npm run render:default-clock:still` captured poster frame and wrote a report. Committed as `fc28c67 Fix default clock capture target`.
- 2026-05-29: Task 1 implemented locally: deleted obsolete `docs/works/time-satellite-1.js`; registry already routes `time-satellite-1` to `./works/default-clock.js?v=time-satellite-1-default-alias-1`. Verification passed: `npm run render:default-clock:still`; browser smoke passed for `/works/time-satellite-1.html?ui=0&fullscreen=1&time=2026-05-29T10:10:30.000Z` with `.dc-fx-canvas` as capture target. Active next task: commit Task 1, then Task 2.
