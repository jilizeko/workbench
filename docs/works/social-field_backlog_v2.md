# Social Field — Performance Backlog

## Current Architecture
- **Agents**: Array-based storage, O(n) per simulate frame
- **Relationships**: Map-based, key `${minId}-${maxId}` → number
- **Collision Detection**: Grid-based spatial hashing with 9-cell neighbor check
- **Render**: Canvas 2D, per-agent arc + shadow blur (heavyweight)
- **Physics**: Force accumulation per pair, O(n²) worst-case (mitigated by grid)

## Known Bottlenecks
1. **Pair explosion** — At 10k agents, ~3.5M pairs per frame (O(n²) with large VISION_RADIUS)
2. **Relationship decay** — Map iteration over all pairs every N frames
3. **String key generation** — relKey `${id1}-${id2}` per pair lookup
4. **Grid rebuild** — O(n) agents rebinned every frame
5. **Set/Map overhead** — Large data structures hit memory limits at 100k

## Tier 1: High-Impact, Low-Risk (IMPLEMENTED & TESTED ✅)

- [x] **Disable shadow blur by default** — ENABLE_SHADOWS config flag (default: false)
  - Actual impact: Not the bottleneck at 10k
  
- [x] **Batch relationship decay** — DECAY_BATCH_INTERVAL config (default: 10 frames)
  - Actual impact: Minimal (not the bottleneck)
  
- [x] **Disable aspect force by default** — ENABLE_ASPECTS config flag (default: false)
  - Actual impact: Minimal (not the bottleneck)

## Test Results (Tier 1 Baseline)

**Environment**: Node.js, canvas 1024×1024, VISION_RADIUS=160px

| Agents | FPS | Frames | Duration | Pairs | Status |
|--------|-----|--------|----------|-------|--------|
| 1k | 57.4 | 100/100 | 1741ms | 40,800 | ✅ OK |
| 10k | **0.2** | 3/100 | 15341ms | 3,452,661 | ⚠️ BROKEN |
| 100k | crash | — | — | OOM on Set | ❌ OOM |

## Problem Analysis

**Why 10k fails:**
- At 10k agents with VISION_RADIUS=160, average agent sees ~350 neighbors
- This generates 3.5M pair interactions per frame
- Each pair: distance calc, force calc, relationship update, decay check
- O(n²) algorithm is fundamental bottleneck, not micro-optimizations

**Why 100k crashes:**
- Pair count would exceed 5B (billions)
- JavaScript Set/Map implementation hits max size

## Tier 2: Medium-Impact, Medium-Risk (REQUIRED FOR 10K+)

### Option A: Reduce Pair Generation
- [ ] **Smaller VISION_RADIUS** — Use 80px instead of 160px → ~4x fewer pairs
  - Trade-off: Less long-range interaction feels flat
  - Effort: 1 line config change
  - Risk: Low (gameplay knob)

- [ ] **Sparse relationship updates** — Only process pairs at 2-4 frames interval
  - Trade-off: Stale relationships for 1-2 frames
  - Effort: ~10 lines (frame counter + skip logic)
  - Risk: Low (imperceptible at 60 FPS)

- [ ] **LOD (Level of Detail)** — Distant agents use simpler force model
  - Trade-off: Visual pop-in at distance
  - Effort: ~20 lines (distance-based force branch)
  - Risk: Medium (complexity)

### Option B: Approximate Physics
- [ ] **Velocity continuation** — Skip force recalc for stable pairs, reuse previous
  - Trade-off: Less responsive to sudden changes
  - Effort: ~15 lines (stability check + cache)
  - Risk: Low (degradation is subtle)

- [ ] **Chunk simulation** — Process agents in batches, skip some per frame
  - Trade-off: Fairness (some agents skip update)
  - Effort: ~20 lines (round-robin counter)
  - Risk: Low (rotation ensures all get updated)

### Option C: Data Structure Optimization
- [ ] **Numeric pair encoding** — Use `id1*MAX_ID+id2` instead of `"${id1}-${id2}"`
  - Trade-off: Limited by int size (must change after 32k agents)
  - Effort: ~5 lines (change relKey function)
  - Risk: Very low (pure refactor)

- [ ] **Typed arrays for relationships** — Use parallel arrays instead of Map
  - Trade-off: Must track active pair indices separately
  - Effort: ~30 lines (sparse array management)
  - Risk: Low-medium (complexity in iteration)

## Tier 3: Risky / Major Refactor (NUCLEAR OPTIONS)

- [ ] **WebWorker simulation** — Move physics off main thread
  - Impact: Unblocks main thread for UI/render
  - Effort: Major (~200 lines, message protocol)
  - Risk: High (complex, slow on small scales)

- [ ] **WebGL instancing** — Replace Canvas 2D with Three.js + instanced rendering
  - Impact: Scales to millions of agents (GPU)
  - Effort: Massive (~500 lines, complete rewrite)
  - Risk: Very high (framework change, rendering model shift)

- [ ] **Spatial BVH/Quadtree** — Replace uniform grid with hierarchical index
  - Impact: Better for non-uniform agent distribution
  - Effort: Large (~100 lines, tree traversal)
  - Risk: Medium (complexity, potential bugs)

## Recommendation

**For 1k agents**: Current Tier 1 is sufficient (57 FPS ✅)

**For 10k agents**: Implement Tier 2 Option A (smaller VISION_RADIUS)
- Quickest fix: Change `VISION_RADIUS: 160` → `VISION_RADIUS: 80`
- Expected result: ~4x fewer pairs → 10-15 FPS (acceptable)
- Then add Option B (sparse updates) for additional 2-3x speedup

**For 100k agents**: Requires Tier 3 (WebWorker + WebGL)
- Too many pairs for CPU + Canvas 2D
- Consider this "exploration mode" with simplified physics

## Next Action

Test VISION_RADIUS reduction:
1. Set VISION_RADIUS to 80px (was 160)
2. Re-run perf test for 1k/10k/100k
3. Measure FPS improvement
4. If 10k ≥ 10 FPS, declare Tier 2 MVP complete
5. Integrate back into main social-field.js with CONFIG option
