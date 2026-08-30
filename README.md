# homemedia-portal

A curated, mobile-first internal service directory ("menu") for a single private
home server. Built with SvelteKit + TypeScript + `@sveltejs/adapter-node`.

This repository is public. **No infrastructure values or secrets** — addresses,
hostnames, ports, absolute server paths, or the service inventory — belong in
tracked files. See the project constitution at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md) and the
approved design under [`specs/001-portal-v1/`](specs/001-portal-v1/).

## Status

Scaffold only (work package WP0). Authentication, discovery, the dashboard, the
PWA, and the health endpoint are implemented in later work packages — see
[`specs/001-portal-v1/tasks.md`](specs/001-portal-v1/tasks.md).

## Requirements

- Node.js 22 LTS (`.nvmrc` / `engines` pin `>=22 <23`)

## Develop

```sh
npm install
npm run dev
```

## Scripts

| Script             | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `npm run build`    | Production build (adapter-node output in `build/`) |
| `npm run preview`  | Serve the production build locally                 |
| `npm run check`    | `svelte-check` type checking                       |
| `npm run lint`     | Prettier + ESLint                                  |
| `npm run format`   | Apply Prettier formatting                          |
| `npm test`         | Unit tests (Vitest, single run)                    |
| `npm run test:e2e` | End-to-end tests (Playwright)                      |

The e2e run needs browsers once: `npx playwright install`. No unit or e2e test
files exist yet in this scaffold; they land in later work packages.
