# Project Guidelines

## Code Style
- Plain HTML/CSS/JS only; no frameworks per [prd.md](prd.md).
- Keep UI text-only (no button elements); use minimal typography and layout per [prd.md](prd.md).

## Architecture
- Single shell page provides the DOM container and minimal navigation UI; it does not embed specific art code.
- A registry file defines all works (slug, title, order, script, optional meta) and drives navigation + all-posts list.
- Each art module is a separate JS file that mounts into the shell container and implements lifecycle: `init()`, `start()`, `destroy()`.
- Navigation uses the registry: `next` wraps to first; `random` must avoid current work.

## Build and Test
- No build or test commands are defined in this repo.

## Project Conventions
- One screen shows one work; auto-start on load; no scroll; work occupies most of the viewport with small UI margins.
- The art container is a single shared canvas area; modules must clean up to avoid resource leaks.
- Adding a new work: create a module file and add a registry entry; deploy via GitHub Pages.

## Integration Points
- Static hosting on GitHub Pages.
- Art modules may use Canvas 2D, WebGL, Three.js, or GLSL shaders.

## Security
- Static, client-only site; no backend or auth specified.

говори с пользователем на русском языке, если он пишет на русском