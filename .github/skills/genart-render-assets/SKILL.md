---
name: genart-render-assets
description: "Use when: generating social media and preview assets for an artwork (og-image, poster-frame, loop videos) using the deterministic render pipeline."
argument-hint: "Provide artwork slug; confirm or adjust seed strategy and aspect ratios in render spec."
user-invocable: true
---

# GenArt Render Assets

## Purpose
Generate deterministic, curated media assets from a browser-based generative artwork for use in social media embedding, gallery previews, and promotional channels.

## When to Use
- A new artwork module exists at `docs/works/<slug>.js` and has been tested.
- The artwork supports deterministic rendering via seeded RNG and fixed-time capture (via shared shell runtime in `docs/app.js` exposing `window.__GENART_CAPTURE__`).
- You need social media assets: OG image, poster frame, and video loops.
- Assets should be validated by the author before publication.

## Prerequisites
- `npm install` and `npx playwright install chromium` have been run.
- Verify capture dependencies before Step 2:
  - `node -e "import('playwright').then(() => console.log('ok')).catch(() => process.exit(1))"`
- Verify canonical capture route exists and resolves:
  - Wrapper page exists at `docs/work/<slug>/index.html` (or equivalent route support is present).
  - Opening `/work/<slug>/` loads shell runtime and artwork without 404.
- Render spec exists at `render-specs/<slug>.json` with:
  - `slug`, `title`, `category`
  - `targetAssets` (which formats to generate: og-image, poster-frame, loop-landscape, etc.)
  - `seedStrategy` (random-range or fixed-list)
  - `variants` (resolution, fps, format for each asset type)
  - `heroFrameHints` (which animation frames are interesting for poster/og)
  - `validationNotes` (checklist for author review)

## Procedure

### Step 1: Prepare Manifest
```bash
node scripts/render-pipeline.mjs prepare <slug>
```
Generates:
- `docs/media/<slug>/candidates/manifest.json` — list of all candidate combinations (seeds × times × frames)
- `docs/media/<slug>/validation-log.md` — author checklist template

**Best Practice:** Review the manifest to ensure asset targets, seed ranges, and time candidates match your vision. If adjustments needed, update `render-specs/<slug>.json` and re-run prepare.

### Step 2: Capture Candidates
Run capture for each asset type needed:
```bash
node scripts/render-capture.mjs <slug> --asset og-image --limit 1
node scripts/render-capture.mjs <slug> --asset poster-frame --limit 1
node scripts/render-capture.mjs <slug> --asset loop-landscape --limit 1
node scripts/render-capture.mjs <slug> --asset loop-vertical --limit 1    # if needed
node scripts/render-capture.mjs <slug> --asset loop-square --limit 1      # if needed
```

**Best Practice:** Start with `--limit 1` to test capture works. If quality issues occur:
- Increase `--limit 5` to generate multiple seed/time/frame variants
- Review candidates in `docs/media/<slug>/candidates/renders/`
- Pick the best variant
- If none are acceptable, adjust render spec or artwork parameters and rerun

**Outputs:**
- `docs/media/<slug>/candidates/renders/<candidate-id>.png` or `.mp4`
- `docs/media/<slug>/candidates/frames/<candidate-id>/` (frame sequences for video)
- `docs/media/<slug>/candidates/reports/<timestamp>.json` (capture metadata)

Key parameters on capture URLs:
- `width`, `height` — canvas resolution
- `seed` — deterministic randomness
- `time` — fixed render timestamp (for clocks/time-based art)
- `frame` — still image frame time (0–duration in seconds)
- `duration` — video loop length
- `ui=0` — hide UI chrome
- `fullscreen=1` — fullscreen layout

### Step 3: Author Validation
1. Open `docs/media/<slug>/validation-log.md` in editor.
2. View candidate files in `docs/media/<slug>/candidates/renders/`.
3. For each asset type, check:
   - Readability at thumbnail scale (150px minimum)
   - Seed consistency (all assets ideally use same seed for coherence)
   - Video loop transitions (watch 2–3 loops; check frame continuity)
   - Composition safety (key elements within safe margins for crop platforms)
   - No UI artifacts or errors
4. Update validation log with approved candidate IDs:
   ```markdown
   ## og-image
   - [x] Best candidate selected
   - [x] Readable at thumbnail scale
   - [x] No artifacts
   - [x] Approved candidate id: og-image--seed-123456--time-2026-04-08T12-00-00-000Z--frame-0-5
   ```
5. Mark **Final Decision** as "Approved" or "Needs recapture".

**Best Practice:** 
- Prefer one aligned seed/time set across poster/og/video for visual cohesion.
- For clocks: fixed-time candidates help ensure consistent appearance in archives.
- If most candidates are visually poor, the artwork algorithm may need tuning before assets.

### Step 4: Finalize Assets
Once approved candidate IDs are documented, finalize:
```bash
node scripts/render-pipeline.mjs finalize <slug> \
  --og docs/media/<slug>/candidates/renders/og-image--seed-123456--time-2026-04-08T12-00-00-000Z--frame-0-5.png \
  --poster docs/media/<slug>/candidates/renders/poster-frame--seed-123456--time-2026-04-08T12-00-00-000Z--frame-0-5.png \
  --landscape docs/media/<slug>/candidates/renders/loop-landscape--seed-123456--time-2026-04-08T12-00-00-000Z--dur-4.mp4 \
  --vertical docs/media/<slug>/candidates/renders/loop-vertical--seed-123456--time-2026-04-08T12-00-00-000Z--dur-4.mp4 \
  --square docs/media/<slug>/candidates/renders/loop-square--seed-123456--time-2026-04-08T12-00-00-000Z--dur-4.mp4
```

**Outputs:**
- `docs/media/<slug>/og-image.png` (1200×630)
- `docs/media/<slug>/poster-frame.png` (1920×1080)
- `docs/media/<slug>/loop-landscape.mp4` (1280×720, 3–6s loop)
- `docs/media/<slug>/loop-vertical.mp4` (1080×1920, optional)
- `docs/media/<slug>/loop-square.mp4` (1080×1080, optional)
- `docs/media/<slug>/metadata.json` (asset reference record)

**Note:** Omit `--vertical` or `--square` if those formats were not part of target assets or failed validation.

## Integration
Once finalized, assets are ready for:
- **SEO:** Link from wrapper page `og:image`, `og:video` metadata (future: auto-inject from metadata.json).
- **Gallery:** Poster frame as hero image in `/all/` index (future enhancement).
- **Social:** Share artwork with `og-image.png` as preview.

## Sample Workflow (Full Example)

```bash
# 1. Prepare
node scripts/render-pipeline.mjs prepare masked-time-dots

# 2. Capture all asset types
node scripts/render-capture.mjs masked-time-dots --asset og-image --limit 1
node scripts/render-capture.mjs masked-time-dots --asset poster-frame --limit 1
node scripts/render-capture.mjs masked-time-dots --asset loop-landscape --limit 1
node scripts/render-capture.mjs masked-time-dots --asset loop-square --limit 1

# 3. Validate in editor
# Edit: docs/media/masked-time-dots/validation-log.md
# Review: docs/media/masked-time-dots/candidates/renders/

# 4. Finalize
node scripts/render-pipeline.mjs finalize masked-time-dots \
  --og "docs/media/masked-time-dots/candidates/renders/og-image--seed-200000--time-2026-04-08T08-08-08-000Z--frame-0-5.png" \
  --poster "docs/media/masked-time-dots/candidates/renders/poster-frame--seed-200000--time-2026-04-08T08-08-08-000Z--frame-0-5.png" \
  --landscape "docs/media/masked-time-dots/candidates/renders/loop-landscape--seed-200000--time-2026-04-08T08-08-08-000Z--dur-4.mp4" \
  --square "docs/media/masked-time-dots/candidates/renders/loop-square--seed-200000--time-2026-04-08T08-08-08-000Z--dur-4.mp4"

# Result: docs/media/masked-time-dots/{og-image.png, poster-frame.png, loop-landscape.mp4, loop-square.mp4, metadata.json}
```

## Troubleshooting

### Capture times out or fails
- Check that the artwork module supports capture mode (has `window.__GENART_CAPTURE__` setup).
- Verify shared capture runtime is initialized in `docs/app.js` and sets `window.__GENART_CAPTURE__.ready` after work load.
- Verify `window.__GENART_CAPTURE__` implements `captureStill(frameTime)` and (optionally) `resetScene()`.
- If using canonical URLs from manifest, verify `/work/<slug>/` route exists and maps to shell page.
- Check manifest to confirm candidate URL is valid.

### Cannot find package 'playwright'
- Run `npm install` in repo root.
- Re-run `npx playwright install chromium`.
- Re-run one capture command with `--limit 1` to confirm environment is healthy.

### Candidate URL returns 404
- Confirm wrapper page exists at `docs/work/<slug>/index.html`.
- Confirm manifest `captureUrl` points to `/work/<slug>/...` and not a missing path.
- Open the candidate URL in browser and verify artwork loads before rerunning capture.

### Generated candidates are visually poor
- Check seed strategy in render spec: random-range may need wider range or more candidates.
- Inspect validationNotes in spec for known problem seeds.
- Increase `--limit` to sample more seeds and pick best.
- Consider if artwork algorithm needs visual refinement.

### Video encode errors
- Ensure ffmpeg is available (`ffmpeg -version`).
- Check ffmpeg location: system ffmpeg or Playwright cache fallback.
- Reduce video duration or resolution if encode fails.

### Files too large
- For og-image: target ≤200 KB (compress if needed).
- For poster: target ≤500 KB.
- For MP4 loops: target ≤10 MB (reduce resolution or fps if needed).

## Output Format
```
Manifest prepared
  docs/media/<slug>/candidates/manifest.json
  docs/media/<slug>/validation-log.md

Candidates captured
  og-image.png, poster-frame.png, loop-landscape.mp4, ...

Assets finalized
  docs/media/<slug>/og-image.png
  docs/media/<slug>/poster-frame.png
  docs/media/<slug>/loop-landscape.mp4
  docs/media/<slug>/metadata.json
```

## Completion Rule
All target assets exist in `docs/media/<slug>/` with proper filenames:
- `og-image.png`
- `poster-frame.png`
- `loop-landscape.mp4`
- `loop-vertical.mp4` (if targeted)
- `loop-square.mp4` (if targeted)
- `metadata.json`

Assets are ready for SEO integration, gallery indexing, and social distribution.
