---
description: "Dependency-ordered implementation breakdown for Portal v1"
---

# Tasks: Portal v1

**Input**: Design documents in `specs/001-portal-v1/` — [spec.md](./spec.md)
(Approved), [plan.md](./plan.md), [research.md](./research.md) (R1–R11),
[data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Governance: `.specify/memory/constitution.md`.

**Tests**: **Required.** Constitution XII mandates tests / verification evidence
for every change. Test tasks are first-class here, not optional.

**Organization**: grouped into **Work Packages (WP)**. **Each WP is one narrow,
independently reviewable pull request.** There is deliberately *no* single "big
implementation" PR. Task IDs (`T001…`) are stable and sequential **in execution
order** (every "depends on" points to a lower-numbered task); `[P]` =
parallelisable (different files, deps satisfied); `[US#]` maps a task to a spec
user story (used only inside user-story phases).

## Hard guardrails (apply to every task — non-negotiable)

Never, in any task or PR:

- mount or reach the raw Docker socket from the portal; only the digest-pinned
  socket-proxy, `CONTAINERS=1`, `POST=0` (Constitution IV, `contracts/docker-api-contract.md`).
- issue any non-`GET` Docker request or any create/start/stop/restart/exec/delete.
- add HTTP/uptime probing of services, background polling, or status streaming
  (FR-016).
- add WebGL, parallax, OAuth/SSO, an API key, or an AI-control API (spec Non-Goals).
- use a mutable image tag in a deployed compose file, add Watchtower, or use
  `docker compose down -v` (Constitution VI, XII).
- weaken the session cookie (`__Host-` + `Secure` unchanged; local HTTPS only for
  tests — research R11).
- commit a secret, password, hash, IP, hostname/FQDN, port, absolute server path,
  or the service inventory. Concrete values live only in untracked
  `PRIVATE-CONTEXT.md`.
- create GitHub Issues, DNS / router / firewall / VPN / reverse-proxy config, or
  edit the media Compose stack beyond deliberate `homemedia.*` labels applied via
  the server's own change process.

## Per-WP mandatory closeout (each WP's final task)

For **every** WP, before opening its PR:

- **Disclosure/secrets scan** — run the authored-tree scan from
  [quickstart.md](./quickstart.md) §9; attach output to the PR. Must be clean.
- **Evidence capture** — attach: commands run + output, test results, and (for
  UI/behaviour WPs) screenshots / Playwright artifacts. Unverified changes MUST
  NOT be merged (Constitution XII).
- **Constitution check note** — map the change to the principles it touches; any
  deviation stops for product-owner decision.

---

## Phase 1: Setup

### WP0 — Project scaffold & tooling → PR "chore: scaffold SvelteKit project"

**Traces**: plan.md Technical Context & Project Structure; Constitution II.

- [ ] T001 Initialise a SvelteKit 2 + Svelte 5 + TypeScript project with Vite and
  `@sveltejs/adapter-node` at the repo root (`package.json`, `svelte.config.js`,
  `vite.config.ts`, `tsconfig.json`), pinned exact versions.
- [ ] T002 [P] Add `.editorconfig`, `eslint` + `prettier` + `svelte-check` configs
  and `npm` scripts (`build`, `check`, `lint`, `test`, `test:e2e`).
- [ ] T003 [P] Add `src/lib/types.ts` — shared types (`ServiceProjection`,
  `Category`, `DashboardModel`, `SessionPayload`) from
  [data-model.md](./data-model.md); types only, no logic.
- [ ] T004 [P] Add `static/robots.txt` (disallow all), a minimal `src/app.html`
  shell, an empty `src/app.css`.
- [ ] T005 Extend root `.gitignore` for build output (`/build`, `/.svelte-kit`,
  `/node_modules`, coverage, Playwright artifacts); keep `PRIVATE-CONTEXT.md` and
  `*.local.*`.
- [ ] T006 WP0 closeout: disclosure scan + evidence; open PR.

**Checkpoint**: `npm run build` succeeds on an empty app; `npm run check` clean.

---

## Phase 2: Foundational (Blocking Prerequisites)

> Every Phase-2 WP depends only on WP0 (WP4 also on WP1). No user-story WP starts
> until Phase 2 is merged.

### WP1 — Runtime config + security headers → PR "feat: env validation and security headers"

**Traces**: FR-003, FR-008, FR-024, FR-027; `contracts/README.md`; Constitution
IX, X.

- [ ] T007 `src/lib/server/env.ts` — parse & validate `RuntimeConfig`
  ([data-model.md](./data-model.md) §9); throw + exit non-zero on any missing /
  malformed required value (`PORTAL_USERNAME`; `PORTAL_PASSWORD_ARGON2` must parse
  as a PHC Argon2id string; `SESSION_SECRET` ≥ 32 bytes; `DOCKER_PROXY_URL`
  absolute URL). Never log values.
- [ ] T008 [P] `src/lib/server/security-headers.ts` — strict CSP
  (`default-src 'self'`, no third-party origins, no inline script), `nosniff`,
  `Referrer-Policy: same-origin`, `frame-ancestors 'none'`, minimal
  `Permissions-Policy`.
- [ ] T009 `src/hooks.server.ts` (base) — apply security headers to every
  response; `Cache-Control: no-store` on all HTML + machine endpoints; static
  routes stay cacheable ([contracts/README.md](./contracts/README.md)).
- [ ] T010 [P] Unit tests `tests/unit/env.spec.ts` — missing / short / malformed
  each required var → startup fails; valid → parsed shape.
- [ ] T011 [P] Unit test `tests/unit/security-headers.spec.ts` — full header set;
  CSP has no `unsafe-inline` / external origin.
- [ ] T012 WP1 closeout: disclosure scan + evidence; open PR.

### WP11a — Local-HTTPS test harness + Playwright base → PR "test: local-HTTPS harness"

**Depends on**: WP0. **Traces**: research R11; Constitution XII. Lands early so
every later e2e WP can use it.

- [ ] T013 Add the **local-HTTPS test harness**: a documented `caddy
  reverse-proxy` (local CA) invocation, a `local-ssl-proxy` fallback, wired into
  Playwright `webServer` / project config pointing at the local `https://` origin,
  with `ORIGIN` set to that origin. **Test tooling only — never shipped, never in
  the image.**
- [ ] T014 [P] Playwright base config: a 360 × 780 project + a second project with
  `reducedMotion: 'reduce'`; `@axe-core/playwright` wired; `npm run test:e2e`.
- [ ] T015 [P] A smoke e2e `tests/e2e/harness.spec.ts` — the harness serves the
  built app over `https://`, a browser accepts a `Secure` cookie set by a stub
  route (proves the cookie path works before auth exists).
- [ ] T016 WP11a closeout: disclosure scan + evidence; open PR.

### WP4 — Read-only Docker client + isolation contract → PR "feat: read-only docker client"

**Depends on**: WP1. **Traces**: FR-026, FR-016; `contracts/docker-api-contract.md`;
research R6, R10; Constitution IV, XI.

- [ ] T017 `src/lib/server/docker/client.ts` — `fetch` wrapper for
  `DOCKER_PROXY_URL`; **`GET` only** (method asserted in code); per-call + overall
  timeouts; typed errors distinguishing "list failed" from "inspect failed".
- [ ] T018 [P] `src/lib/server/docker/discovery.ts` — call
  `GET /containers/json?all=1&filters={"label":["homemedia.enable=true"]}`;
  re-check `Labels["homemedia.enable"]` truthiness in code; return
  `RawContainer[]` or a discovery-failure signal.
- [ ] T019 [P] `src/lib/server/docker/status.ts` — pure
  `deriveStatus(inspect | error) → {status,statusLabel}` per
  [data-model.md](./data-model.md) §4 (health → state → `unknown` on per-inspect
  failure).
- [ ] T020 [P] Unit tests `tests/unit/docker-client.spec.ts`,
  `tests/unit/status-mapping.spec.ts` — non-`GET` impossible; every status row;
  timeout → `unknown`; list-failure vs inspect-failure typing.
- [ ] T021 Integration test `tests/e2e/docker-isolation.spec.ts` — against a
  socket-proxy configured per contract: `POST`/start/stop/exec → `403`; a source
  grep asserts zero non-`GET` Docker calls (depends on T013).
- [ ] T022 WP4 closeout: disclosure scan + evidence; open PR.

### WP7 — Bundled icons + licensing → PR "feat: bundled dashboard-icons subset"

**Depends on**: WP0. **Traces**: FR-012; research R7; Constitution IX, XII.

- [ ] T023 Re-verify the `homarr-labs/dashboard-icons` `LICENSE` at a chosen
  pinned commit; record commit + licence in `src/lib/icons/PROVENANCE.md`. **If it
  is no longer Apache-2.0, stop and report — do not proceed.**
- [ ] T024 [P] Add `src/lib/icons/LICENSE` (verbatim upstream licence) and
  `src/lib/icons/NOTICE` (attribution to the upstream copyright holders + the
  upstream trademark / identification-only disclaimer).
- [ ] T025 [P] Add the curated SVG subset + `src/lib/icons/index.ts`
  (`id → inline SVG`, plus a `generic` fallback). The **set of ids** derives from
  the owner-selected service list in untracked `PRIVATE-CONTEXT.md`; the repo file
  uses neutral ids only (no service inventory in comments).
- [ ] T026 [P] Unit test `tests/unit/icons.spec.ts` — unknown id → `generic`; no
  `index.ts` entry references a URL / remote; `LICENSE` + `NOTICE` present.
- [ ] T027 Create a minimal repo root `README.md` (overview + links to `specs/`)
  with an icon-attribution line; add a UI "About"/footer attribution stub.
- [ ] T028 WP7 closeout: disclosure scan + evidence; open PR.

**Checkpoint**: Foundation ready — WP2 can begin (then WP3, WP5).

---

## Phase 3: User Story 2 — Sign in once and stay signed in (Priority: P1)

**Goal**: A household member logs in over HTTPS, stays logged in 30 days, can log
out; brute force is throttled.

**Independent test**: [quickstart.md](./quickstart.md) Tier 2 auth table passes
end-to-end over the local-HTTPS harness.

### WP2 — Authentication core + login/logout → PR "feat: password auth and stateless session"

**Depends on**: WP1, WP11a. **Traces**: FR-002…FR-008, FR-028; SC-002, SC-011,
SC-013, SC-014; `contracts/http-routes.md` (`/login`, `/logout`); research R2, R3,
R4, R5; Constitution IX.

- [ ] T029 [P] [US2] `src/lib/server/auth/password.ts` — `hash-wasm` Argon2id
  verify; always run a verify (real hash or a fixed dummy PHC hash) so timing is
  constant for unknown usernames; boolean only.
- [ ] T030 [P] [US2] `src/lib/server/auth/session.ts` — sign/verify the
  `base64url(payload).base64url(HMAC-SHA256)` token ([data-model.md](./data-model.md) §7);
  `exp = iat + 2_592_000` exactly; `crypto.timingSafeEqual`; reject on bad
  signature / `now >= exp` / `v != 1` / `sub != PORTAL_USERNAME`.
- [ ] T031 [P] [US2] `src/lib/server/auth/rate-limit.ts` — in-memory
  `Map<ip,{fails:number[],blockedUntil?}>`; 5 fails / rolling 15 min → 15-min
  block; clear on success; opportunistic + periodic prune ([data-model.md](./data-model.md) §8).
- [ ] T032 [US2] `src/routes/login/+page.server.ts` — form action: client IP via
  `getClientAddress()`; throttle → `429`; verify → generic `200` re-render on
  failure, `303` + `Set-Cookie __Host-hmp_session=…; Secure; Path=/; HttpOnly;
  SameSite=Lax; Max-Age=2592000` (no `Domain`) on success; safe same-origin
  `redirectTo` (depends on T029–T031).
- [ ] T033 [P] [US2] `src/routes/login/+page.svelte` — mobile-first styled login
  (single password field, one generic error region, ≥44 px targets).
- [ ] T034 [US2] `src/routes/logout/+server.ts` — `POST` only (`GET` → `405`),
  origin/CSRF-checked, clears the cookie (`Max-Age=0`), `303 /login` (depends on
  T030).
- [ ] T035 [P] [US2] Unit tests `tests/unit/session.spec.ts`,
  `tests/unit/rate-limit.spec.ts`, `tests/unit/password.spec.ts` — sign/verify,
  tamper, expiry boundary, secret-rotation rejection, throttle window + cool-off,
  constant-time dummy path.
- [ ] T036 [US2] E2E `tests/e2e/auth.spec.ts` (local-HTTPS harness): wrong
  password → generic; 6th attempt → `429`; cool-off; correct → cookie attributes
  exactly as specified; restart-persistence; `SESSION_SECRET` change → forced
  re-login; logout clears (depends on T013, T032–T034).
- [ ] T037 [US2] WP2 closeout: disclosure scan + evidence (incl. the `Set-Cookie`
  header capture); open PR.

### WP3 — Session route guard & authorization model → PR "feat: session route guard"

**Depends on**: WP2. **Traces**: FR-001, FR-010; `contracts/README.md`
authorization matrix; `contracts/http-routes.md`; Constitution V.

- [ ] T038 [US2] Extend `src/hooks.server.ts` — verify `__Host-hmp_session` via
  `session.ts`, attach `locals.session`; non-public routes without a valid session
  → `302 /login?redirectTo=<safe-path>`; `GET /api/services` unauth → `401` JSON;
  `/healthz` + `/login` + static stay public (depends on T030).
- [ ] T039 [P] [US2] `src/routes/+layout.server.ts` — expose only session presence
  (boolean); never service data.
- [ ] T040 [US2] E2E `tests/e2e/authz.spec.ts` — every protected route
  redirects/401s without a session; `/healthz` + static do not; no protected-route
  body leaks service data pre-auth.
- [ ] T041 [US2] WP3 closeout: disclosure scan + evidence; open PR.

**Checkpoint**: US2 fully testable via the local-HTTPS harness.

---

## Phase 4: User Story 1 — Open a service from my phone (Priority: P1) 🎯 MVP

**Goal**: Authenticated user sees only labelled services, grouped + searchable,
with status, and taps to open them.

**Independent test**: [quickstart.md](./quickstart.md) §3 (discovery isolation) +
§4 (status / failure modes) pass; a phone-sized session lists and opens services.

### WP5 — Label parsing + service projection + failure modes → PR "feat: service projection"

**Depends on**: WP4, WP7. **Traces**: FR-009…FR-013, FR-015, FR-018, FR-029,
FR-030; SC-003, SC-009, SC-010, SC-015; `contracts/label-contract.md`;
[data-model.md](./data-model.md) §§2–6.

- [ ] T042 [P] [US1] `src/lib/server/labels.ts` — parse `homemedia.*` → `LabelSet`
  with defaults & normalisation per `contracts/label-contract.md` (incl.
  `homemedia.lan_only`, category casefold, order default 100, unknown keys
  ignored, malformed value → default not error).
- [ ] T043 [US1] `src/lib/server/docker/projection.ts` — `RawContainer` +
  `LabelSet` + `deriveStatus` → `ServiceProjection`; `href` order per
  [data-model.md](./data-model.md) §3: valid absolute `homemedia.url` (verbatim,
  wins, and is the **only** way to get HTTPS) → else `homemedia.port` +
  `SERVICE_LINK_BASE` → **`http://<SERVICE_LINK_BASE>:<port>` (plain `http` only,
  TLS never inferred)** → else `null`; slug; icon id resolved against the bundled
  set else `generic` (depends on T019, T025, T042).
- [ ] T044 [US1] `src/lib/server/docker/dashboard.ts` — group into `Category[]`,
  compute `counts`, build `DashboardModel`; **two failure modes**: discovery ok +
  some inspects fail → `sourceOk:true`, all discovered services listed, affected
  `unknown`; discovery fails → `sourceOk:false`, `categories:[]`, no list, nothing
  cached/retained (depends on T018, T043).
- [ ] T045 [P] [US1] Unit tests `tests/unit/labels.spec.ts`,
  `tests/unit/projection.spec.ts`, `tests/unit/dashboard.spec.ts` — every label
  default/normalisation; `href` order incl. `null`; **`homemedia.port` always
  yields a plain `http://` link and never `https`; an HTTPS destination requires
  `homemedia.url`; a valid `homemedia.url` wins over `homemedia.port`**; both
  FR-030 modes; no non-labelled container ever appears in the model.
- [ ] T046 [US1] WP5 closeout: disclosure scan + evidence; open PR.

### WP6 — Dashboard UI → PR "feat: dashboard, search, cards, states"

**Depends on**: WP3, WP5. **Traces**: FR-014, FR-017, FR-018, FR-029, FR-030,
FR-020; SC-004, SC-009, SC-012, SC-015; US1, US4; `contracts/http-routes.md`
(`GET /`, `GET /api/services`).

- [ ] T047 [US1] `src/routes/+page.server.ts` — guarded `load`: build
  `DashboardModel` within the load budget; never embed non-labelled containers in
  markup or serialized data (depends on T044).
- [ ] T048 [P] [US1] Components: `ServiceCard.svelte` (link opens a new browsing
  context; `href===null` → non-link "link unconfigured"), `StatusDot.svelte` (text
  + shape + colour), `LanOnlyBadge.svelte`, `CategorySection.svelte`,
  `SearchBar.svelte`, `EmptyState.svelte` (no-services / discovery-unavailable /
  no-search-results — discovery-unavailable shows **no list**).
- [ ] T049 [US1] `src/routes/+page.svelte` + `src/app.css` — dashboard: category
  groups, client-side filter over name + description, dark CSS-only control-room
  theme (design tokens), sticky search (depends on T047, T048).
- [ ] T050 [P] [US1] `src/routes/api/services/+server.ts` — guarded `GET` JSON
  `DashboardModel`; `Cache-Control: no-store`; identical projection rules; invoked
  only by an explicit "refresh" control (no polling).
- [ ] T051 [P] [US1] E2E `tests/e2e/dashboard.spec.ts` +
  `tests/e2e/discovery-isolation.spec.ts` — grouped + searchable; tap opens
  configured `href`; stopped service → "not running"; LAN-only badge; unlabelled
  names → 0 hits in HTML/JSON; failure mode A (list all, mark unknown) and B
  (explicit unavailable, no list, reload = no stale list).
- [ ] T052 [US1] WP6 closeout: disclosure scan + evidence (screenshots at 360 px);
  open PR.

**Checkpoint (MVP)**: WP0–WP7 merged → a logged-in user on a phone can see and
open the labelled services with correct status. Demoable MVP.

---

## Phase 5: User Story 4 — Curate what appears, without a rebuild (Priority: P2)

**Goal**: Operator adds/edits `homemedia.*` labels; portal reflects them on next
load with no rebuild.

**Independent test**: add labels to a container, re-apply, reload → tile
appears/updates; remove `enable` → tile gone.

### WP8 — Curation lifecycle hardening → PR "test: label curation lifecycle"

**Depends on**: WP6. **Traces**: FR-011, FR-013; US4 acceptance scenarios.

- [ ] T053 [US4] E2E `tests/e2e/curation.spec.ts` — label add/change/remove takes
  effect on next load with no portal restart; unknown icon id → generic, no
  fetch; category case/space variants merge.
- [ ] T054 [P] [US4] Docs: add a "Curating the menu" section to `README.md`
  pointing to `contracts/label-contract.md` (no service inventory).
- [ ] T055 [US4] WP8 closeout: disclosure scan + evidence; open PR.

---

## Phase 6: User Story 3 — Install to home screen (Priority: P2)

**Goal**: Installable PWA, standalone launch, static-only caching.

**Independent test**: [quickstart.md](./quickstart.md) §5 PWA rows + §6 static-only
cache pass.

### WP9 — PWA manifest + service worker → PR "feat: installable PWA, static-only cache"

**Depends on**: WP6. **Traces**: FR-023, FR-024; SC-008; research R8;
Constitution X.

- [ ] T056 [US3] `static/manifest.webmanifest` (name, `display: standalone`,
  theme/background colours) + PWA icons 192 / 512 / maskable under `static/icons/`.
- [ ] T057 [US3] `src/service-worker.ts` — precache **only** `...build, ...files`
  keyed by `version`; fetch handler: cache-first for precached asset URLs,
  **network-only for everything else** (navigations, `/api/*`, `/login`,
  `/logout`, `/healthz`, authed HTML); delete non-current caches on `activate`.
- [ ] T058 [P] [US3] E2E `tests/e2e/pwa.spec.ts` — Lighthouse installable audit
  passes; `caches.keys()`→`cache.keys()` every entry matches the `build`/`files`
  allowlist; offline reload never shows stale service data; `no-store` on `/` and
  `/api/services`.
- [ ] T059 [US3] WP9 closeout: disclosure scan + evidence; open PR.

---

## Phase 7: User Story 5 — Confirm the portal is healthy (Priority: P3)

### WP10 — Health endpoint → PR "feat: unauthenticated /healthz"

**Depends on**: WP1. **Traces**: FR-025; US5 acceptance scenarios;
`contracts/http-routes.md`.

- [ ] T060 [US5] `src/routes/healthz/+server.ts` — unauthenticated `GET`,
  `{"status":"ok"}` only while serving, `503` if not ready; `Cache-Control:
  no-store`; **no** inventory / counts / session / env in the body.
- [ ] T061 [P] [US5] Unit + E2E `tests/e2e/healthz.spec.ts` — 200 shape, no auth,
  discloses nothing; returns `ok` even when the socket-proxy is down (portal
  liveness ≠ Docker source).
- [ ] T062 [US5] WP10 closeout: disclosure scan + evidence; open PR.

---

## Phase 8: Polish & Cross-Cutting

### WP11b — Accessibility & mobile suite → PR "test: accessibility and mobile suite"

**Depends on**: WP11a, WP6. **Traces**: FR-019, FR-021, FR-022; SC-005, SC-006,
SC-007; research R9; Constitution XII.

- [ ] T063 [P] E2E `tests/e2e/a11y.spec.ts` — axe 0 serious/critical on `/login`
  and `/`; one `h1`; landmarks; labelled search; keyboard tab order + visible
  focus; `Enter`/`Space` activate tiles; greyscale status still legible.
- [ ] T064 [P] E2E `tests/e2e/mobile.spec.ts` — no horizontal scroll at 360 px;
  every interactive control ≥ 44 × 44 px; reduced-motion run shows no non-essential
  animation.
- [ ] T065 Add `npm run test:all` aggregating unit + e2e + a11y; document running
  the local-HTTPS harness in `README.md`.
- [ ] T066 WP11b closeout: disclosure scan + evidence (axe + Lighthouse reports);
  open PR.

### WP12 — Container image → PR "build: multi-stage Dockerfile"

**Depends on**: WP0. **Traces**: plan.md Dockerfile line; Constitution VI, IX;
[quickstart.md](./quickstart.md) §7.

- [ ] T067 `Dockerfile` — multi-stage; base image **pinned by digest**
  (`FROM node@sha256:…` with a `# Node 22 LTS Alpine` comment), not a mutable tag;
  build stage `npm ci && npm run build` (WASM Argon2 needs no build toolchain);
  runtime stage copies `build/` + prod deps, runs as non-root `node`, `EXPOSE` the
  adapter port, `HEALTHCHECK` via BusyBox `wget` on `/healthz`,
  `CMD ["node","build"]`. No credential build args.
- [ ] T068 [P] `.dockerignore` — exclude `.git`, `node_modules`, tests, `*.md`
  except what the image needs, `PRIVATE-CONTEXT.md`, `.env*`.
- [ ] T069 Manual/E2E: build the image; `dive` / `docker history` shows no secret
  / no `.env` / no `PRIVATE-CONTEXT.md`; runs non-root; `/healthz` green.
- [ ] T070 WP12 closeout: disclosure scan + evidence (layer inspection output);
  open PR.

### WP13 — CI: build & publish public GHCR image → PR "ci: build and publish image"

**Depends on**: WP12, WP11b. **Traces**: Constitution VI, VII; plan.md CI section.

- [ ] T071 `.github/workflows/build.yml` — triggers: push to `main`, push of a
  `v*` tag, `workflow_dispatch`; `permissions: {contents: read, packages: write}`;
  `docker/login-action` with `github.actor` + `secrets.GITHUB_TOKEN` (no PAT);
  build `linux/amd64`; **`main` push → publish the immutable `sha-<short>` tag
  only**; **`v<semver>` tag push → publish the matching `v<semver>` image (plus
  `sha-<short>`)**; **never `latest`**; layer cache `type=gha`. **CI MUST NOT
  create any git tag** — it only reacts to a tag the owner has pushed (product-owner
  decision 2026-08-30).
- [ ] T072 [P] CI job: run `npm run test:all` (unit + e2e via the local-HTTPS
  harness) and the disclosure scan as a **required gate** before any publish.
- [ ] T073 One-time, documented (not automated in-repo): set the GHCR package
  visibility to **public** so the server pulls anonymously (no server-side
  registry credential).
- [ ] T074 Workflow-header + `docs/deployment.md` notes: (a) no CI secret is
  needed for the portal's own auth (password / session secret are runtime-only);
  (b) the **release flow** — the owner manually creates a `v<semver>` git tag from
  an accepted `main` commit **only after WP16a acceptance has passed** and pushes
  it to trigger the semver image; CI never creates tags; deployed compose pins the
  resulting `@sha256:` digest.
- [ ] T075 WP13 closeout: disclosure scan + evidence (a green run + a published
  test digest); open PR.

### WP14 — Deployment documentation → PR "docs: deployment and rollback"

**Depends on**: WP12, WP13. **Traces**: Constitution III, VI, XII; plan.md
Deployment design; [quickstart.md](./quickstart.md) §§7–8.

- [ ] T076 `docs/deployment.md` — public-safe: the two-container Compose project
  (portal + socket-proxy) in its own directory / own network; both images
  `@sha256`-pinned; socket-proxy `CONTAINERS=1`, `POST=0`, `read_only`,
  `no-new-privileges`, `cap_drop: [ALL]`, no host ports, raw socket only here;
  env-var **names** only (values from operator notes); `restart: unless-stopped`;
  promote = edit one `@sha256:` line + `docker compose up -d portal`; rollback =
  restore previous digest; **never `docker compose down -v`**; media stack changed
  only by adding `homemedia.*` labels via the server's own process.
- [ ] T077 [P] `docs/deployment.md` (fenced block) — an **illustrative** compose
  skeleton with placeholders only (`<…>`), marked "reference, fill from private
  notes", not a runnable file.
- [ ] T078 [P] `docs/deployment.md` §"External access" — the reverse-proxy route
  is an unverified acceptance gate handled in WP16b; this project provisions no
  DNS / router / firewall / VPN / proxy config.
- [ ] T079 WP14 closeout: disclosure scan (must catch any stray value) + evidence;
  open PR.

### WP15 — Private-runbook update (operator machine — NOT this repo)

**Traces**: Constitution III, XII; plan.md deviation note. **No repo file changes.**

- [ ] T080 On the server's private operational docs (not committed here): add a
  short "portal" section — separate Compose project location, digest-update /
  rollback procedure, which existing services received `homemedia.*` labels, and a
  pointer to this repo. Record it in the private migration log.
- [ ] T081 Verify the label additions to the existing media stack were applied via
  the server's documented change process (recreate = deliberate) and that the
  media stack's lifecycle was otherwise untouched.
- [ ] T082 WP15 closeout: in the tracking PR (e.g. WP14's), record a one-line
  "done, logged privately" confirmation for T080–T081 — **no private details**.

### WP16a — Full local/CI acceptance verification → PR "test: full acceptance run"

**Depends on**: all prior WPs merged. **Traces**: every FR + SC; all contracts;
the four validation gates.

- [ ] T083 Execute [quickstart.md](./quickstart.md) Tiers 1–2 and §§3–7 end to
  end; attach a completed pass/fail table mapping each SC-001…SC-015 to evidence.
- [ ] T084 [P] Run the Coverage Matrix in this file and confirm every FR / SC /
  contract / gate has a merged task and passing evidence.
- [ ] T085 [P] Run the authored-tree disclosure/secrets scan over the whole repo
  at the merge point; attach clean output.
- [ ] T086 Re-run the spec-quality checklist and the plan Constitution Check;
  record "PASS" with links to evidence.
- [ ] T087 WP16a closeout: open PR with the full evidence bundle.

### WP16b — External HTTPS reverse-proxy acceptance gate (SEPARATELY AUTHORISED, POST-IMPLEMENTATION)

**Not started until explicitly authorised by the product owner.** **No changes in
this repository.** **No DNS / router / firewall / VPN / reverse-proxy
configuration is performed as part of this project** — that infrastructure is
owned and operated elsewhere.

- [ ] T088 Confirm (with the infra owner) that the estate HTTPS reverse proxy has
  a route for the `home.` subdomain → the portal origin, forwarding
  `X-Forwarded-Proto`, `X-Forwarded-Host`, single-hop `X-Forwarded-For`.
- [ ] T089 From an external network: `https://<private-fqdn>/healthz` → `ok` over
  valid TLS (record pass/fail only — never the FQDN — in any tracked artifact).
- [ ] T090 On a real mobile device over that hostname: login sets & returns the
  `__Host-` cookie; navigate away/back stays authenticated; logout clears it;
  `getClientAddress()` shows the real client IP; install to home screen; standalone
  launch.
- [ ] T091 Record the gate result in the private operational docs. If the route is
  absent: **stop**, report the blocker, provision nothing.

---

## Dependencies & Execution Order

```
WP0 (setup)
 ├─> WP1 (env + headers) ──┬─> WP2 (auth) ──> WP3 (guard) ──┐
 │                         │                                 ├─> WP6 (dashboard) ─┬─> WP8 (curation)
 │       WP11a (harness) ──┘   WP4 (docker) ─> WP5 (proj.) ──┘                     └─> WP9 (PWA)
 ├─> WP11a (harness)  [needs WP0; feeds every e2e WP]
 ├─> WP4 (docker client)  [needs WP1]
 ├─> WP7 (icons)  [needs WP0] ─────────────────────> WP5
 ├─> WP10 (healthz)  [needs WP1]
 ├─> WP11b (a11y/mobile)  [needs WP11a + WP6]
 └─> WP12 (image) ─> WP13 (CI) ─> WP14 (deploy docs)
WP15 (private runbook)   [after labels applied; parallels WP14]
WP16a (acceptance)       [after everything above merged]
WP16b (reverse-proxy)    [separately authorised, after WP16a]
```

### Phase gates

- Phase 2 (WP1, WP11a, WP4, WP7) blocks all user-story WPs. WP4 needs WP1; WP11a
  and WP7 need only WP0.
- WP2 needs WP1 + WP11a (its e2e uses the harness). WP3 sequences after WP2;
  together they are the P1 auth story.
- **MVP = WP0–WP7 merged** (auth + dashboard + icons). WP8–WP10 add the P2/P3
  stories. WP12–WP14 make it deployable. WP16b is gated and external.

### Parallel opportunities

- WP0: T002, T003, T004.
- After WP1: WP11a, WP4, WP7, WP10 all proceed independently of WP2.
- Within WP2: T029, T030, T031, T033, T035 `[P]`.
- Within WP5: T042, T045 `[P]`.
- WP12 in parallel with WP11b once the app builds.

---

## Coverage Matrix (every approved requirement / criterion / gate → task)

| Item | Task(s) |
|---|---|
| FR-001 auth required | T038, T040 |
| FR-002 mobile login screen | T033 |
| FR-003 single credential, Argon2id, no plaintext | T007, T029 |
| FR-004 generic failure | T029, T032, T036 |
| FR-005 throttle 5/15min + cool-off | T031, T032, T035, T036 |
| FR-006 exactly-30-day session | T030, T032, T036 |
| FR-007 logout | T034, T036 |
| FR-008 `__Host-` cookie attributes | T030, T032, T036 |
| FR-028 secret rotation → global logout | T030, T035, T036 |
| FR-009 opt-in discovery | T018, T042, T045 |
| FR-010 no non-labelled disclosure | T018, T038, T044, T047, T051 |
| FR-011 label vocabulary + defaults | T042, T045, T053 |
| FR-012 bundled icon id only, no fetch | T023–T026, T043 |
| FR-013 label change, no rebuild | T044, T053 |
| FR-014 group + search | T049 |
| FR-015 status from state/health only | T019, T020 |
| FR-030 two failure modes | T019, T044, T045, T051 |
| FR-016 no probing/polling/streaming | T017, T019, T050 (asserts) |
| FR-017 tile links, opens new context | T048, T051 |
| FR-018 link-unconfigured state | T043, T048, T051 |
| FR-029 LAN-only marker | T042, T048, T051 |
| FR-019 mobile-first, 44 px targets | T033, T049, T064 |
| FR-020 CSS-only control-room theme | T049 |
| FR-021 WCAG 2.1 AA + assistive tech | T063 |
| FR-022 reduced motion | T014, T064 |
| FR-023 installable PWA | T056, T058 |
| FR-024 static-only cache | T009, T057, T058 |
| FR-025 unauthenticated `/healthz`, no disclosure | T060, T061 |
| FR-026 read-only proxied Docker, no mutation | T017, T021 |
| FR-027 no secret logging | T007, T029, T030 |
| SC-001 open in ≤2 taps | T049, T083 |
| SC-002 no re-auth ≤30 days | T036, T083 |
| SC-003 100% labelled only | T045, T051 |
| SC-004 find+open <15 s | T049, T083 |
| SC-005 one-handed 360 px, no h-scroll | T064 |
| SC-006 AA contrast, ≥44 px | T063, T064 |
| SC-007 reduced motion none | T064 |
| SC-008 installable PWA check | T058 |
| SC-009 partial failure → list all, mark unknown | T044, T045, T051 |
| SC-010 stopped → "not running" on refresh | T019, T051 |
| SC-011 wrong pw + 6th refused | T036 |
| SC-012 LAN-only badge shown | T048, T051 |
| SC-013 rotation → re-login | T036 |
| SC-014 session stops exactly at 30 days | T030, T036 |
| SC-015 discovery fail → explicit unavailable, no list | T044, T051 |
| Contract: http-routes | T009, T032, T034, T038, T047, T050, T060 |
| Contract: label-contract | T042, T045 |
| Contract: docker-api-contract | T017, T018, T021 |
| Contract: README authorization matrix | T038, T040 |
| Gate: public-repo disclosure | every WP closeout + T085 |
| Gate: secrets | T007, WP closeouts, T069, T085 |
| Gate: static-only PWA cache | T057, T058 |
| Gate: no Docker mutation | T017, T021 |
| Constitution III (separate project, no stack lifecycle change) | T076, T080, T081 |
| Constitution VI (digest pin, no Watchtower, manual rollback) | T067, T071, T076 |
| Constitution VII (public image, no server cred) | T071, T073 |
| Constitution XII (evidence + docs, no `down -v`) | every WP closeout, T076, T083–T087 |
| Acceptance gate: reverse-proxy route | WP16b (T088–T091) — separately authorised |

---

## Product-Owner Decisions (recorded 2026-08-30)

Decided at the tasks-PR (#4) review; folded into `data-model.md`,
`contracts/label-contract.md`, and the tasks above.

| # | Decision | Applied in |
|---|----------|-----------|
| A | **`homemedia.port` link scheme.** `homemedia.url` (valid absolute `http`/`https`) is the complete explicit destination and always wins; it is the **only** way to reach an HTTPS service. Otherwise `homemedia.port` builds **`http://<SERVICE_LINK_BASE>:<port>` — plain `http` only, TLS is never guessed or inferred**. `SERVICE_LINK_BASE` stays in untracked private operator notes; no real host/port/hostname/inventory in tracked files. | data-model.md §3 + label table; label-contract.md `homemedia.url` / `homemedia.port`; T043, T045 |
| B | **Release-tag authority.** Release tags are created **manually by the owner**, from an accepted `main` commit, **only after WP16a acceptance passes**. **CI never creates tags** — it publishes the `v<semver>` image only in response to the owner's pushed `v<semver>` tag. A normal `main` push publishes only the immutable `sha-<short>` tag. | T071, T074 |

## Ambiguities still open (reported, not decided here)

1. **Node base image minor + digest** — T067 must pin a digest; the exact Node 22
   minor and its digest are chosen at implementation time and recorded in the
   Dockerfile comment. Deliberate choice required, not a blocker.
2. **Icon subset membership** — T025's *list* of icon ids is driven by the
   owner-selected service inventory in `PRIVATE-CONTEXT.md`; confirm that list is
   final before bundling. The list stays private.
3. **US1 AC "within one screen of scrolling for a typical set"** — not precisely
   measurable; treated as covered by SC-004 (find+open < 15 s). No hard cap unless
   the product owner asks.
4. **"About"/footer attribution placement** (T027) — exact UI location is a design
   choice; any always-reachable location satisfies FR-012 / R7.

Do not invent answers to 1–2; raise them in the relevant WP's PR if still open.

---

## Notes

- `[P]` = different files, dependencies satisfied.
- Every WP = one PR; commit after each task or logical group; each PR carries its
  disclosure-scan output and verification evidence.
- Verify tests fail before implementing the behaviour they cover, where practical.
- No GitHub Issues are created from this file yet — that is a later, separate step.
