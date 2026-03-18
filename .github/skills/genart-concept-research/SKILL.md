---
name: genart-concept-research
description: "Use when: turning a visual idea into a feasible generative art concept for this project; includes algorithm options, risks, and a recommended approach."
argument-hint: "Provide a visual idea or mood and expected constraints"
user-invocable: true
---

# GenArt Concept Research

## Purpose
Convert a visual idea into a technically feasible generative artwork concept for the GenArtTable pipeline.

## When to Use
- The user has a visual idea but no algorithm yet.
- You need multiple algorithm options before building a module.
- You must validate feasibility against the project stack.

## Procedure
1. Analyze the user's visual description.
2. Extract visual properties:
   - motion behavior
   - density and distribution
   - randomness vs structure
   - trails, blur, glow
   - symmetry or repetition
3. Propose algorithm families that can produce the effect, for example:
   - random walks
   - flow fields
   - particle systems
   - reaction diffusion
   - Voronoi
   - noise-driven motion
4. Evaluate each option against constraints:
   - must run in browser
   - must work in Canvas or WebGL
   - must support continuous animation
   - must be compatible with module lifecycle
5. Produce 3 candidate implementations, each with:
   - algorithm name
   - visual description
   - implementation outline
   - expected complexity
   - potential risks
6. Recommend one preferred solution.

## Output Format
```
Concept Brief

Title:

Slug suggestion:

Visual description:

Algorithm:

Implementation idea:

Technical constraints:
```

## Completion Rule
Finish when the user approves one concept.
