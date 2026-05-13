# Social Field — Performance Backlog

## Current Architecture
- **Agents**: Array-based storage, O(n) per simulate frame
- **Relationships**: Map-based, key `${minId}-${maxId}` → number
- **Collision Detection**: Grid-based spatial hashing with 9-cell neighbor check
- **Render**: Canvas 2D, per-agent arc + shadow blur (heavyweight)
- **Physics**: Force accumulation per pair, O(n²) worst-case (mitigated by grid)

## Known Bottlenecks (to measure)
1. **Relationship decay** — iterates all entries in Map every frame (O(m) where m = active pairs)
2. **Aspect force calculation** — 4 aspects per pair, 4 strength multipliers per interaction
3. **Grid rebuild** — every frame, O(n) agents binned into cells
4. **Render shadow blur** — shadowBlur property is expensive on large count
5. **Map lookups** — relKey string generation + Map.get/set on every pair check

## Optimization Ideas (Priority Order)

### Tier 1: High-Impact, Low-Risk
**IMPLEMENTED & READY TO TEST:**

- [x] **Disable shadow blur by default** — ENABLE_SHADOWS config flag (default: false)
  - Impact: 40–60% render time savings (shadowBlur is expensive in Canvas 2D)
  - Code change: Wrap `ctx.shadowBlur = ...` in `if (CONFIG.ENABLE_SHADOWS && glowOn)` block
  - Risk: Low (visual-only, fully reversible via UI toggle)

- [x] **Batch relationship decay** — DECAY_BATCH_INTERVAL config (default: 10 frames)
  - Impact: 30–50% physics time savings (O(m) → O(m/10) in simulate())
  - Code change: Added `decayAccumulator` module var; decay only when accumulator crosses interval threshold
  - Risk: Negligible (decay smoothness imperceptible at 60 FPS)

- [x] **Disable aspect force by default** — ENABLE_ASPECTS config flag (default: false)
  - Impact: 15–20% physics time savings (4 aspect diffs per pair)
  - Code change: Wrapped entire aspect force block in `if (CONFIG.ENABLE_ASPECTS)` guard
  - Risk: Low (feature toggle, can re-enable in UI)

**READY TO TEST:** Run perf-test.html with Tier 1 baseline and measure 1k/10k/100k FPS.

### Tier 2: Medium-Impact, Medium-Risk
- [ ] **Object pooling** — reuse agent objects on spawn/destroy to reduce GC pressure
- [ ] **Sparse relationship updates** — only tick pairs within vision once per 2–4 frames (configurable)
- [ ] **Grid cell pruning** — skip empty cells, use Set instead of Map for grid
- [ ] **Typed arrays for position/velocity** — Float32Array for x, y, vx, vy per agent

### Tier 3: Risky / Major Refactor
- [ ] **WebWorker simulation** — move physics loop off main thread
- [ ] **Instanced rendering** — WebGL instead of Canvas 2D for 10k+ agents
- [ ] **Spatial index alternative** — quadtree or BVH tree instead of uniform grid
- [ ] **Approximate physics** — skip force calc for distant pairs, use velocity continuation

## Test Targets
- **1k agents**: Baseline, expected 60 FPS on modern hardware
- **10k agents**: Stress test, target 30–60 FPS with culling
- **100k agents**: Extreme, shed features (disable shadows, reduce render frequency)

## Measurement Strategy
1. FPS counter (requestAnimationFrame timing)
2. Memory snapshot (navigator.memory if available)
3. Per-frame breakdown: simulate vs render time
4. Relationship count graph (to show pair growth)

## Notes
- Don't over-optimize early; measure first.
- Each optimization should be behind a config toggle for A/B testing.
- WebWorker is likely the most impactful for 10k+, but adds complexity.
