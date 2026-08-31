---
description: "Dependency-ordered implementation breakdown for Friendly Home View (feature 002)"
---

# Tasks: Friendly Home View

**Input**: Design documents in `specs/002-friendly-home-view/` —
[spec.md](./spec.md) (Approved), [plan.md](./plan.md), [research.md](./research.md)
(FHV-R1–R4), [data-model.md](./data-model.md),
[contracts/label-contract-delta.md](./contracts/label-contract-delta.md),
[quickstart.md](./quickstart.md). Governance: `.specify/memory/constitution.md`.
Portal v1 (`specs/001-portal-v1/`) is the baseline and stays in force.

**Tests**: **Required** (Constitution XII). Test tasks are first-class.

**Delivery**: one implementation PR — **Bundle FHV-1** (all work packages). No GitHub
issues (product-owner instruction). Task IDs `T001…` are stable and in execution order;
`[P]` = parallelisable (different files, deps satisfied).

## Hard guardrails (every task — non-negotiable)

Never, in any task or PR:

- change the Docker read path, the socket-proxy, or its permission set; issue any
  non-`GET` Docker request.
- add a runtime or dev dependency (the disclosure uses native `<details>`).
- add HTTP/uptime probing, background polling, status streaming, an API, WebGL/parallax,
  OAuth/SSO, an API key, or any client persistence (`localStorage` / `sessionStorage` /
  IndexedDB / preference cookie).
- weaken the `__Host-` session cookie, the CSP / security headers, `/healthz`, or the
  two Docker discovery/status failure modes.
- change the service-worker precache list (`[...build, ...files]`) or its network-only
  fetch handler; cache service data, API responses, auth routes, or authenticated HTML.
- put a private service name, an inventory→icon-id mapping, an address, a port, a path,
  a credential, or an image digest into any tracked file, commit message, or PR text.
- show, count, or hint at a container without `homemedia.enable=true` — in either region
  or any empty / collapsed / error state.

---

## FHV-WP1 — Label + projection + model (server, pure)

- **T001** `[P]` `src/lib/server/labels.ts`: parse `homemedia.placement`
  (casefold; `home` → `home`, else `manage`) and `homemedia.home_label` (trim, `null`
  when blank). Extend `LabelSet`. Unknown/malformed → default, never an error.
  → data-model §1.
- **T002** `[P]` `src/lib/server/labels.ts` (or a small sibling): export
  `resolveDescription(raw, placement)` + the two fixed fallback constants
  (`PRIMARY_FALLBACK_DESCRIPTION`, `MANAGE_FALLBACK_DESCRIPTION`). No service/category
  name, no infra. → data-model §3.
- **T003** `src/lib/server/docker/projection.ts`: carry `placement` and `homeLabel` onto
  `ServiceProjection`; set `description` via `resolveDescription` so a projected service
  always has display text; expose the primary-card title rule (`homeLabel ?? name`) as a
  pure helper. → data-model §2.
- **T004** `src/lib/server/docker/dashboard.ts`: after projection, build
  `primary` (only `placement==='home'`, sorted `order` then name),
  `manage` (`groupIntoCategories` over only `placement==='manage'`), `manageCount`;
  keep `categories` over **all** services and `counts` over all services. `sourceOk`
  and both failure modes unchanged. → data-model §4.
- **T005** `src/lib/types.ts`: `ServiceProjection += placement, homeLabel`;
  `DashboardModel += primary, manage, manageCount`.
- **T006** `[P]` unit: `tests/unit/labels.spec.ts` + `projection.spec.ts` +
  `dashboard.spec.ts` — placement/home_label parsing incl. malformed; `resolveDescription`
  (raw wins, blank→constant, never `""`); primary title resolution; `primary`/`manage`
  partition (`∩ = ∅`, `∪` = all discovered), sort, `manageCount`; no-home →
  `primary: []`; both Docker failure modes still behave as Portal v1. Uses synthetic
  fixtures only — no private names, no `host:port` literals.

## FHV-WP2 — Landing view + components

- **T007** `src/lib/components/PrimaryActionCard.svelte` (NEW): large card — icon,
  action title (`homeLabel ?? name`), one description line, secondary status, quiet
  "LAN only" marker, full-card `<a target="_blank" rel="noopener noreferrer">` (or a
  non-link "link unconfigured" card when `href === null`). ≥ 44 px, `:focus-visible`,
  `aria-label` = title + service name.
- **T008** `src/lib/components/ManageMediaSection.svelte` (NEW): native
  `<details>`; `<summary>` = "Manage media" + tool count, styled ≥ 44 px; slot renders
  the `manage` categories via the existing `CategorySection`. Accepts an `open` prop the
  page controls for search.
- **T009** `src/lib/components/StatusIndicator.svelte` + `LanOnlyBadge.svelte`: add a
  visually-secondary presentation (smaller, lower emphasis) while keeping shape+colour+
  text and WCAG 2.1 AA contrast. Semantics/props unchanged.
- **T010** `src/routes/+page.svelte`: `<h1>Home media`; branch on the model —
  `sourceOk===false` → unchanged unavailable state; `primary.length===0` → render
  `categories` exactly as Portal v1 (fallback, no disclosure); else → `primary` cards
  then `<ManageMediaSection>` (omitted when `manageCount===0`). Search filters both
  regions; a `manage` match sets the section `open` and shows "showing X of Y";
  clearing the query restores `open=false`. Demote the refresh control; keep sign-out.
  `<svelte:head><title>Home media`.
- **T011** `src/routes/+page.server.ts`: unchanged (still returns the one model) —
  verify only.
- **T012** `src/app.css` + `src/app.html`: friendly landing styles (single column,
  360×780 one-handed, no h-scroll, reduced-motion removes the disclosure transition);
  document `<title>` → "Home media".
- **T013** `static/manifest.webmanifest`: `name` / `short_name` / `description` → the
  friendly identity. **Precache policy and `src/service-worker.ts` untouched.**

## FHV-WP3 — Icons (bundled, Apache-2.0)

- **T014** `src/lib/icons/`: add generic household-role glyph ids (e.g. watch, request,
  download, tools, monitoring) — each either copied verbatim from the re-pinned upstream
  commit or an original neutral glyph marked project-authored. Update `index.ts`
  registry + `bundledIconIds`.
- **T015** `src/lib/icons/PROVENANCE.md` + `NOTICE` + `ICON_SET_ATTRIBUTION.pinnedCommit`:
  re-pin, re-verify upstream `LICENSE` is Apache-2.0 at that commit (**stop and report if
  not**), update the id→upstream-path table. No service-name / inventory mapping. README
  credit already covers it.
- **T016** `[P]` unit: `tests/unit/icons.spec.ts` — every new id resolves to inlined
  markup; unknown id → `generic`; registry frozen; no `http`/`https`/`url(` in any
  bundled SVG.

## FHV-WP4 — e2e, a11y, regression

- **T017** `tests/harness/docker-mock.mjs`: fixture knobs for `homemedia.placement` /
  `homemedia.home_label` / missing description / no-home / unlabelled container
  (extend `setCurationFixture` / `/__control`).
- **T018** `tests/e2e/friendly-home-view.spec.ts` (mobile project): the 10 checks in
  quickstart §3 — two-region layout, 360×780 both cards fully visible, disclosure
  keyboard + count + toggle, search force-open + count + re-collapse, no-home fallback,
  unlabelled invisibility, description fallback, friendly identity, status/LAN-only
  retained, axe (normal + `reducedMotion:'reduce'`, one `<h1>`, accessible disclosure
  name, ≥44 px).
- **T019** update `tests/e2e/a11y.spec.ts` / `mobile.spec.ts` for the two-region landing
  (landmarks, one h1, focus-visible, no h-scroll at 360×780).
- **T020** `[P]` `tests/unit/service-worker.spec.ts` **must still pass verbatim** —
  add an explicit assertion that the precache list and fetch handler are unchanged.
- **T021** run the full suite: `npm run check` (0), `npm run lint` (clean),
  `npm test`, `npm run build`, `npm run test:e2e` (incl. `pwa` where the runner can
  launch Chrome for Testing), `scripts/disclosure-scan.sh` (`authored-tree clean`),
  `npm run test:all`. Fix failures; never skip or waive.

## FHV-WP5 — Docs

- **T022** `docs/deployment.md`: a short, generic "label rollout for Friendly Home View"
  note — mark two household-facing services `placement=home` with a `home_label` and a
  meaningful `description`; mark the rest `placement=manage` with meaningful
  `description`; apply one service at a time; recreate only the affected container; no
  restart of the portal or the stack; keep it out of tracked files. No infra values.
- **T023** `README.md`: extend "Curating the menu" with `placement` / `home_label` and
  the no-home fallback, placeholder examples only.

---

## Coverage matrix

| Requirement | Tasks |
|---|---|
| FR-101 primary cards on landing | T003, T004, T007, T010 |
| FR-102 collapsed Manage media, grouped | T004, T008, T010 |
| FR-103 no-home fallback = Portal v1 dashboard | T004, T010, T018 |
| FR-104 friendly identity incl. PWA name | T012, T013, T018 |
| FR-105 description + deterministic fallback | T002, T003, T006, T018 |
| FR-106 `homemedia.placement` + `homemedia.home_label` | T001, T003, label-contract delta |
| FR-107 no existing key changes; malformed safe | T001, T006 |
| FR-108 search across both regions + force-open + count | T010, T017, T018 |
| FR-109 status retained, secondary | T009, T018 |
| FR-110 LAN-only retained, quieter | T009, T018 |
| FR-111 unchanged auth/cookie/healthz/api/CSP/PWA cache | T011, T013, T020, T021 |
| FR-112 opt-in discovery invariant, both regions | T004, T010, T018 |
| FR-113 curated-labels acceptance gate | T022 (rollout), verification |
| FR-114 home service not duplicated in Manage | T004, T006, T018 |
| FR-115 360×780, ≥44 px, both cards no-scroll | T007, T012, T018, T019 |
| FR-116 keyboard disclosure, reduced-motion, axe | T008, T012, T018, T019 |
| FR-117 bundled Apache-2.0 icons, no fetch | T014, T015, T016 |
| SC-101..SC-111 | T018, T019, T020, T021 |

## Definition of done

- All tasks complete; coverage matrix satisfied.
- `check` 0, `lint` clean, `npm test` + `build` + `test:e2e` + `test:all` green; CI
  `validate` green on the PR; `publish` succeeds post-merge.
- `scripts/disclosure-scan.sh` → `authored-tree clean`; manual review finds no private
  names / inventory→id mappings / digests.
- Portal v1 e2e + unit continue to pass unchanged.
- `docs/deployment.md` + `README.md` updated; private runbook label-rollout note is an
  operator task (not tracked).
