# Implementation Plan: Friendly Home View

**Branch**: `feature/friendly-home-view-plan` (planning) · feature dir
`specs/002-friendly-home-view/` | **Date**: 2026-08-31 | **Spec**:
[spec.md](./spec.md) (Status: Draft → to be set Approved on plan merge)

**Input**: Feature specification from `specs/002-friendly-home-view/spec.md`

**Note**: This plan produces design artifacts only. No application code, Dockerfiles,
Compose files, CI, deployment scripts, server changes, `tasks.md`, or GitHub issues are
created in this phase.

## Summary

Friendly Home View re-shapes the Portal v1 authenticated landing view into a household
media hub **without changing any data, guarantee, or dependency**. Two additive optional
labels — `homemedia.placement` (`home` | `manage`, default `manage`) and
`homemedia.home_label` — let the operator promote the primary household actions to large
cards on the landing view and push every operator tool into one collapsed, accessible
"Manage media" section. With no service marked `home`, the landing view falls back to the
Portal v1 grouped dashboard byte-for-behaviour. Every card carries a plain-language
description (`homemedia.description` with a deterministic placement-based fallback). The
product presents as "Home media" including in the installed PWA name. Icons come from the
existing locally-bundled Apache-2.0 set, expanded with generic household-role glyphs;
status and the "LAN only" marker stay accurate but visually secondary. No persistence, no
account, no API, no polling, no service-worker policy change.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 LTS (unchanged from Portal v1).

**Primary Dependencies**: SvelteKit 2 + Svelte 5 + Vite; `@sveltejs/adapter-node`. **No
new runtime dependency.** The "Manage media" disclosure uses the native `<details>` /
`<summary>` element (no JS library, no ARIA re-implementation). Dev/test unchanged:
`vitest`, `@playwright/test`, `@axe-core/playwright`, `svelte-check`, `eslint`, `prettier`.

**Storage**: None. No database, cache, queue, or file store. No `localStorage`,
`sessionStorage`, IndexedDB, or preference cookie is introduced. The dashboard model stays
per-request and ephemeral.

**Testing**: `vitest` unit for label parsing (`placement`, `home_label`, defaults,
malformed → `manage`), projection (placement + resolved primary-card title), dashboard
assembly (home/manage split, no-home fallback, description fallback), service-worker
source-structure guard (unchanged). Playwright e2e for the two-region layout, collapsed
disclosure + keyboard operation, search force-open + count + re-collapse, no-home
fallback, unlabelled-container invisibility, 360 × 780 viewport fit, friendly identity,
PWA install signal (unchanged), and axe (default + `reducedMotion: 'reduce'`).

**Target Platform**: Linux/amd64 container; single replica behind the separately-operated
HTTPS reverse proxy. ~98% mobile.

**Project Type**: Server-rendered web application (single SvelteKit project) — unchanged.

**Performance Goals**: Unchanged from Portal v1 (SSR < 300 ms server time, Docker read
within the 4 s budget, initial route JS < 60 KB gzip). The split adds only in-memory
partitioning of an already-built list; the disclosure is CSS. No extra network work.

**Constraints**: Mobile-first, one-handed at **360 × 780 px**, no horizontal scroll; for
the normal two-primary-action case both complete primary cards visible without vertical
scroll; WCAG 2.1 AA contrast; touch targets ≥ 44 × 44 px including the disclosure control;
`prefers-reduced-motion` removes the expand/collapse animation; CSS-only visuals; no
runtime external fetch (icons bundled, CSP unchanged); service worker caches static assets
only; no secret or private infrastructure value in any tracked file or the image.

**Scale/Scope**: One household. Normally two `home` services, ~7–9 `manage` services, a
handful of categories. ~6–10 changed/added modules. No horizontal scale requirement.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 (see end of section).*

Constitution version 1.0.0. Each principle → how this plan complies.

| # | Principle | Compliance |
|---|---|---|
| I | Curated mobile-first single-host directory; external only via existing reverse proxy | Still exactly a directory. "Manage media" is a display grouping of the same read-only links — no management/monitoring capability is added. Reverse proxy untouched. |
| II | SvelteKit + TS + adapter-node; simplicity over infra | Same stack; **no new dependency**; native `<details>` for the disclosure; **no DB/queue/worker**; visuals CSS-only. |
| III | Own Compose project; no media-stack lifecycle change beyond documented `homemedia.*` labels | This feature changes no Compose file. The only later operational change is adding `homemedia.placement` / `homemedia.home_label` / `homemedia.description` values to already-labelled services, via the server's documented process (implementation/rollout task, logged in the private migration log). |
| IV | Read-only Docker only via digest-pinned socket proxy | No change to the Docker read path, the proxy, or its permission set. The two new labels are parsed from data already fetched. |
| V | Opt-in `homemedia.enable=true` discovery; nothing else revealed | Unchanged and reinforced: FR-112 requires both regions and every empty/collapsed/error state to exclude non-labelled containers; the disclosure control's count covers labelled `manage` services only. |
| VI | No Watchtower; no mutable deployed tags; manual rollback-capable updates | Deployment model unchanged: the feature ships as a new digest-pinned image; promotion/rollback follows the existing runbook (one `@sha256:` line). |
| VII | Public registry, no server credential | Unchanged; image stays on public GHCR, pulled anonymously. |
| VIII | No network/perimeter changes | None. |
| IX | No secrets/topology in repo/specs/issues/CI/examples/image | The concrete `placement` / `home_label` / `description` values are curated in the operator's untracked notes (FR-113); tracked files and PR text use placeholder examples only. Auth/session unchanged. |
| X | PWA caches static assets only | **Unchanged.** The manifest's descriptive text changes ("Home media"); the precache list stays `[...build, ...files]` and the fetch handler stays network-only for everything else. A test asserts the service-worker source structure is unchanged. |
| XI | v1 fences: no probing/polling/WebGL/parallax/OAuth/API-key/AI-control API; status from Docker state only | None added. Status still derives only from container state + healthchecks; it is merely restyled. Search stays client-side over the loaded model. |
| XII | Tests/verification evidence + doc updates; never `down -v` | Every implementation task carries tests/evidence; `docs/deployment.md` and the private runbook get the label-rollout note; promotion uses the least-disruptive portal-only update. |

### Required validation gates (green at plan time, re-checked post-design)

1. **Public-repository disclosure** — no LAN IP, hostname/FQDN, port, absolute server path,
   proxy topology, enumerated service inventory, or image digest in any tracked file.
   Verified by the whole-authored-tree scan ([quickstart.md](./quickstart.md) §"disclosure
   & secrets gate"). → **PASS**.
2. **Secrets** — no plaintext password, session secret, hash, or token anywhere. Auth is
   untouched. → **PASS**.
3. **Static-only PWA caching** — precache list and fetch handler unchanged; only manifest
   text changes; asserted by an unchanged service-worker source-structure test. → **PASS**.
4. **No Docker mutation capability** — the Docker read path, the socket-proxy, and its
   permission set are untouched; no non-GET Docker request is added. → **PASS**.

### Deviation note

None. This feature introduces no Constitution deviation. The Complexity Tracking table is
empty.

### Server-document conflict check

The server's private operational documents were re-reviewed for this feature. The only
operational impact is adding presentation-only `homemedia.*` label values to services
already opted in — this is exactly the documented "curate the menu with labels" flow and
does not touch any service's lifecycle, networking, or image pin. **No blocking conflict.
Proceeding.**

### Post-Phase-1 re-check

After the design artifacts below were produced, the table and the four gates were
re-evaluated. No new violations: the route/authorization model is unchanged (no new
route, no auth change); the data model gains only two parsed label fields and a
view-level partition, holds no persistent store, and still never fabricates/caches/retains
a list; the Docker contract is untouched; the session cookie is untouched; the PWA
precache policy is untouched. **The whole-authored-tree disclosure + secrets scan is
clean. Constitution Check: PASS (pre- and post-design).**

## Project Structure

### Documentation (this feature)

```text
specs/002-friendly-home-view/
├── spec.md              # Approved specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions FHV-R1…FHV-R4
├── data-model.md        # Phase 1 — label + projection + view-model deltas
├── contracts/
│   └── label-contract-delta.md   # additive homemedia.placement / homemedia.home_label
├── quickstart.md        # Phase 1 — end-to-end validation guide for this feature
└── checklists/
    └── requirements.md  # spec quality checklist (from spec phase)
```

The Portal v1 contract file `specs/001-portal-v1/contracts/label-contract.md` and its
`data-model.md` gain the two additive keys in the **tasks** PR (mirroring how Portal v1's
own tasks PR folded contract edits in), not in this plan PR.

### Source Code (repository root) — *changed/added during implementation*

```text
src/
├── app.html                         # document <title> → "Home media"
├── app.css                          # friendly landing styles; secondary status/badge
├── lib/
│   ├── types.ts                     # ServiceProjection += placement, homeLabel;
│   │                                #   DashboardModel += primary[] / manage grouping
│   ├── server/
│   │   ├── labels.ts                # parse homemedia.placement + homemedia.home_label
│   │   └── docker/
│   │       ├── projection.ts        # resolve placement + primary-card title
│   │       └── dashboard.ts         # split primary vs manage; no-home fallback;
│   │                                #   description fallback by placement
│   ├── icons/
│   │   ├── index.ts                 # register added generic-role glyph ids; re-pin note
│   │   ├── svg/*.svg                # added glyphs (generic household-role, verbatim/authored)
│   │   ├── NOTICE / PROVENANCE.md   # updated id table + pinned commit
│   └── components/
│       ├── PrimaryActionCard.svelte # NEW — large landing card
│       ├── ManageMediaSection.svelte# NEW — <details> disclosure wrapper + count
│       ├── ServiceCard.svelte       # status/badge de-emphasis (shared)
│       ├── StatusIndicator.svelte   # smaller / lower-emphasis variant
│       └── LanOnlyBadge.svelte      # quieter presentation
├── routes/
│   ├── +page.svelte                 # landing: <h1>Home media, primary cards, disclosure,
│   │                                #   search across both regions, fallback branch
│   └── +page.server.ts              # unchanged (still returns the one model)
static/
└── manifest.webmanifest             # name/short_name/description → friendly identity
tests/
├── unit/                            # labels, projection, dashboard split/fallback, sw guard
└── e2e/                             # friendly-home-view.spec.ts (+ a11y/mobile/pwa updates)
docs/
└── deployment.md                    # label-rollout note (generic wording)
```

**Structure Decision**: unchanged single SvelteKit project. All new logic is pure and
lives in `src/lib/server/**` (parsing, projection, model assembly) or presentational
components; routes stay thin. No new route, no new endpoint.

## Accelerated delivery packaging

Portal v1 used Work Packages bundled into review-sized PRs. Friendly Home View is small
enough to ship as **one implementation PR** after two documentation PRs:

1. **Plan PR** — `plan.md`, `research.md`, `data-model.md`,
   `contracts/label-contract-delta.md`, `quickstart.md`; sets spec Status → Approved.
2. **Tasks PR** — `tasks.md`; folds the two additive keys into
   `specs/001-portal-v1/contracts/label-contract.md` and its `data-model.md`.
3. **Implementation PR** — the single bundle FHV-1 (all work packages), with the full
   test suite and CI green.

No GitHub issues are created (product-owner instruction).

## Complexity Tracking

No Constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
