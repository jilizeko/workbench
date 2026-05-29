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
