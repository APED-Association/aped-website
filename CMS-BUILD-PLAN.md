# APED Site — Sveltia CMS Build Plan (branch: feat/sveltia-cms)

Goal: let Kokou + team edit the site at `apedassociation.org/admin` with no code,
using Sveltia CMS (GitHub login, no auth backend). Free, stays on GitHub Pages.

## Constraint
Current site = single hand-built `index.html` (SPA-style page sections, no build step,
no blog). Sveltia edits structured content files, so editable content must be extracted
into files the page can render.

## Editable scope (confirmed with Kerry-Ann)
1. Blog / News  — NEW section (they requested it in May)
2. Team / leadership — 6-person management table (changes often)
3. Photos — swappable images
4. Mission / key copy — hero + mission text blocks

Design, layout, hero structure = untouched.

## Approach (all on branch, nothing touches main/live)
- [ ] `/admin/index.html` + `/admin/config.yml` — Sveltia, GitHub backend, `main` branch
- [ ] `content/` files: `team.json`, `site-copy.json`, `blog/*.md`, `photos/` media
- [ ] Small client-side loader so the static page renders team + news from those files
- [ ] Test locally, then (post-transfer) confirm login + a live edit on the org repo

## Status
- Branch created. Plan drafted. Scaffolding next.
- Live site + `main` = unchanged.
