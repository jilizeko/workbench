---
name: genart-package-post
description: "Use when: packaging a finished artwork module into the site (registry entry, SEO wrapper page, and sitemap update)."
argument-hint: "Provide slug, title, and meta description"
user-invocable: true
---

# GenArt Package Post

## Purpose
Convert a finished artwork module into a complete website entry aligned with the current routing and SEO structure.

## When to Use
- A new module exists in `docs/works/<slug>.js`.
- The artwork is approved and ready to be published on the site.

## Procedure
1. Add a registry entry in `docs/registry.js` with fields:
   - `slug`
   - `title`
   - `order`
   - `script`
   - `meta.date`
   - `meta.description`
2. Create the SEO wrapper page at:
   - `docs/works/<slug>.html`
3. Ensure the wrapper page contains:
   - `<title>`
   - `<meta name="description">`
   - OpenGraph metadata (`og:title`, `og:description`, `og:image`)
   - Use `og-default.svg` when no artwork-specific image is available.
   - link to shared CSS and runtime `app.js`
4. Keep wrapper pages minimal: they load the shared runtime and do not render the artwork directly.
5. Confirm `/all/` remains list-only; links are generated from `registry.js` at runtime (no manual descriptions).
6. Add the new page to `docs/sitemap.xml`.

## Output Format
```
registry patch
seo page
sitemap update
```

## Completion Rule
Artwork is reachable at:
```
/works/<slug>.html
```
