---
name: genart-deploy-check
description: "Use when: validating that a new artwork is ready for deployment (routing, SEO metadata, registry, sitemap)."
argument-hint: "Provide the artwork slug to validate"
user-invocable: true
---

# GenArt Deploy Check

## Purpose
Validate that a new artwork is ready for GitHub Pages deployment.

## When to Use
- A new artwork has been packaged.
- You need a readiness checklist before deployment.

## Procedure
1. Routing:
   - `/works/<slug>.html` resolves and loads the module.
2. SEO:
   - `<title>` exists.
   - `<meta name="description">` exists.
   - OpenGraph metadata exists.
   - If no artwork-specific image is available, `og:image` uses `og-default.svg`.
3. Structure:
   - module file exists at `docs/works/<slug>.js`.
   - registry entry exists in `docs/registry.js`.
   - wrapper page exists at `docs/works/<slug>.html`.
4. Sitemap:
   - entry exists in `docs/sitemap.xml`.

## Output Format
```
Deploy Checklist

Routing: OK / FAIL
SEO metadata: OK / FAIL
Registry: OK / FAIL
Sitemap: OK / FAIL

Status:
READY / NEEDS FIX
```

## Completion Rule
If all checks pass the artwork is ready for GitHub Pages deployment.
