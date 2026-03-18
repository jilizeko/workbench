# Spiral Time Dial

## Concept Brief

Title: Spiral Time Dial
Slug suggestion: spiral-time-dial

Visual description:
A centered clock on plane z=0 with two rectangular hands. The dial is built from three spirals that extend into depth along the z axis. Roman numerals sit at their correct angles and are stretched along the hour spiral in depth. Minute marks are short ticks on their own spiral. The spiral motion advances toward the camera, so the current time sits at z=0 and the hour hand points at it. The second hand spawns particles that move toward the camera and randomly perturb their velocity direction each frame. Distant objects blend more with the background based on depth. A circular vignette in the background color overlays everything with a dissolve edge. Default background: #111111.

Algorithm:
2D Canvas with pseudo-3D depth. Use z to control perspective scale, alpha, and background mixing. Particles are a simple emitter with randomized angular drift.

Implementation idea:
- Constants for hand sizes, numeral size, spiral radius/length, spiral speed, particle motion, fog depth, background color, vignette parameters.
- 3D spiral points projected to 2D with a simple perspective (scale = focal / (focal + z)).
- Roman numerals drawn with fillText and scaled/alpha by depth. Minute ticks drawn as line segments along their spiral.
- Particle velocity moves along -z and is rotated by a small random angle each frame.
- Fog mix uses lerp(objectColor, bg, clamp(z / fogDepth)).

Technical constraints:
- Plain HTML/CSS/JS, Canvas 2D.
- Module lifecycle: init/start/destroy.
- Render inside #art-container.
