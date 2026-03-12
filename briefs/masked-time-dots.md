Concept Brief

Title: Masked Time Dots

Slug suggestion: masked-time-dots

Visual description:
Large time digits occupy up to ~70% of the canvas. The digits act as a mask: circles of varying size appear and disappear within the digit strokes. On each second tick, circles shrink to zero or grow back depending on mask change. Portrait layout stacks hours/minutes/seconds in three lines; landscape uses one line.

Algorithm:
Canvas 2D + text mask (ImageData) + particle circles with radius interpolation on mask changes.

Implementation idea:
1) Render time text in an offscreen canvas (white on black) to build a mask.
2) Generate N circles with position, base radius, and layer Z index.
3) Sample the mask at each circle position every tick; if pixel flips, animate radius toward 0 or toward base radius.
4) Use multiple layers with slight parallax in Z.
5) Apply small camera wiggle (sinusoidal rotation/offset around the center).

Technical constraints:
Canvas 2D only; ImageData sampling limited to tick intervals (default 1000ms) for performance. Keep N and layer count bounded.
