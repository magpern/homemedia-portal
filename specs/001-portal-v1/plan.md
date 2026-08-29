# Implementation Plan: Portal v1

**Branch**: `feature/portal-v1-plan` (planning) · feature dir `specs/001-portal-v1/`
| **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md) (Status: Approved)

**Input**: Feature specification from `specs/001-portal-v1/spec.md`

**Note**: This plan produces design artifacts only. No application code,
Dockerfiles, Compose files, CI, deployment scripts, server changes, `tasks.md`, or
GitHub issues are created in this phase.

## Summary

Portal v1 is a single SvelteKit (adapter-node) service that: authenticates a
household against one shared Argon2id-hashed password; issues a stateless,
HMAC-signed `__Host-` session cookie fixed at 30 days; renders a mobile-first,
CSS-only dark dashboard of **only** the containers labelled
`homemedia.enable=true`, grouped by category, searchable, each showing
running/not-running/unknown status derived solely from Docker container state and
healthchecks read through a digest-pinned, read-only `docker-socket-proxy`; opens
each service's configured link (LAN-only ones visibly marked); installs as a PWA
whose service worker caches static build assets only; and exposes an
unauthenticated `/healthz`. It ships as a public GHCR image, deployed as its own
Compose project with digest-pinned images and a manual, rollback-capable
procedure. The external reverse-proxy route is an unverified acceptance gate.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 LTS (runtime base image
digest-pinned, not a mutable tag).

**Primary Dependencies**: SvelteKit 2 + Svelte 5 + Vite; `@sveltejs/adapter-node`;
`hash-wasm` (Argon2id, pure WASM — no native build toolchain); Node stdlib
`crypto` for session HMAC; native `fetch` for the Docker read (no Docker client
library). Dev/test: `vitest`, `@playwright/test`, `@axe-core/playwright`,
`svelte-check`, `eslint`, `prettier`. See [research.md](./research.md) §"Consolidated
dependency list".

**Storage**: None. No database, cache server, queue, or file store. The only
in-memory state is the login rate-limiter map (best-effort, rebuilt on restart).
Sessions are stateless (signed cookie).

**Testing**: `vitest` for unit (label parsing, status mapping incl. the two Docker
failure modes, session sign/verify, rate-limiter, env validation); Playwright for
e2e (auth flows, discovery isolation, PWA install signal, static-only cache) and
accessibility (`@axe-core/playwright`, run twice incl. `reducedMotion: 'reduce'`,
360 px viewport). **Auth/session e2e run over local HTTPS** behind a throwaway
local TLS terminator so the real `Secure` / `__Host-` cookie path is exercised —
plain-HTTP checks are limited to non-auth surface (`/healthz`, unauth redirect,
env fail-fast). See [research.md](./research.md) R11 and
[quickstart.md](./quickstart.md).

**Target Platform**: Linux/amd64 container (small x86 mini-PC). Single replica
behind a separately-operated HTTPS reverse proxy. Reached ~98% from mobile
browsers.

**Project Type**: Server-rendered web application (single SvelteKit project).

**Performance Goals**: Dashboard SSR response < 300 ms server time with the Docker
read completing within a 4 s overall budget (per-call 2 s timeout → `unknown` on
timeout). First contentful render < 2 s on home broadband. Payload: initial route
JS < 60 KB gzip (no heavy UI libs, CSS-only visuals).

**Constraints**: Mobile-first, one-handed at 360 px width, no horizontal scroll;
WCAG 2.1 AA contrast; interactive targets ≥ 44×44 px; honours
`prefers-reduced-motion`; CSS-only visuals (no WebGL/parallax); no runtime external
fetches (icons bundled; CSP forbids third-party origins); PWA service worker caches
static assets only; no secret or private infrastructure value in any tracked file
or the image; read-only Docker access with zero mutation capability.

**Scale/Scope**: One household (single shared credential). ~10–20 labelled
services, a handful of categories. ~15–20 route/component/server modules. No
horizontal scale requirement.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 (see end of section).*

Constitution version 1.0.0. Each principle → how this plan complies.

| # | Principle | Compliance in this plan |
|---|---|---|
| I | Curated mobile-first single-host directory, external only via existing HTTPS reverse proxy | Scope matches exactly; no multi-host, no monitoring; reverse proxy is external + separately operated (acceptance gate). |
| II | SvelteKit + TS + adapter-node; simplicity over infra | Exactly that stack; **no DB/queue/worker**; every dependency justified in research.md; visuals CSS-only. |
| III | Own Compose project; no media-stack lifecycle change beyond documented `homemedia.*` labels | Portal + socket-proxy run as a **separate Compose project** in their own directory. Only change to existing services = adding `homemedia.*` labels, applied via the server's documented process and logged there (implementation-phase task). See "Deviation note" below. |
| IV | Read-only Docker only via digest-pinned socket proxy; never raw socket or mutation | `docker-socket-proxy` digest-pinned, `CONTAINERS=1`, `POST=0`, all mutation groups at default `0`; raw socket mounted **only** into the proxy; portal reaches it over a private internal-network URL (`DOCKER_PROXY_URL`), GET only. Contract in [contracts/docker-api-contract.md](./contracts/docker-api-contract.md). |
| V | Opt-in `homemedia.enable=true` discovery; nothing else revealed | Discovery query filters on that label; projection, `/api/services`, SSR, and every empty/error state exclude non-labelled containers. [contracts/label-contract.md](./contracts/label-contract.md). |
| VI | No Watchtower; no mutable deployed tags; manual rollback-capable updates | Deploy design pins portal + proxy by `@sha256`; documented promote/rollback procedure mirrors the server runbook's update flow; no auto-updater. |
| VII | Public registry, no server-side credential | Image published to public GHCR; server pulls anonymously; nothing secret in the image. |
| VIII | No ufw/WireGuard/router/firewall changes; portal binds configured private origin | Plan changes none of these; portal binds the deployment-configured private origin:port; reverse proxy elsewhere. |
| IX | No secrets/plaintext in repo/specs/issues/CI/examples/image; Argon2id + `__Host-` cookie | Password supplied only as an env-var Argon2id hash; `SESSION_SECRET` env only; `env.ts` fails fast; `.gitignore` covers `PRIVATE-CONTEXT.md` + `*.local.*`; disclosure gate below. |
| X | PWA caches static assets only | Service worker precaches `build`+`files` only; fetch handler is network-only for everything else; verified in quickstart. |
| XI | v1 fences: no probing/polling/WebGL/parallax/OAuth/API-key/AI-control API; status from Docker state only | None present. Status = `State`/`State.Health` only, computed on load + manual refresh; the two Docker failure modes (FR-030) never fabricate/cache/retain a list. Future API rule restated in the spec, not implemented. |
| XII | Tests/verification evidence + doc updates; never `down -v` | Every implementation task will carry tests/evidence; `docs/deployment.md` uses `docker compose stop`; rollback documented; server-doc updates listed as implementation tasks. |

### Required validation gates (must be green at plan time and re-checked post-design)

1. **Public-repository disclosure** — no LAN IP, hostname/FQDN, port number,
   absolute server path, proxy topology, or enumerated service inventory in **any
   tracked file** (spec, plan, research, data-model, every `contracts/` file,
   quickstart, README — no file excluded). Concrete values live only in untracked
   `PRIVATE-CONTEXT.md`. Verified by a **whole-tracked-tree** scan
   ([quickstart.md](./quickstart.md) §"disclosure & secrets gate") with no
   `:!path` exclusion, plus pre-commit review. → **PASS**.
2. **Secrets** — no plaintext password, session secret, hash, or token in any
   tracked file, commit message, or image layer; password and `SESSION_SECRET`
   are runtime env only; `env.ts` refuses to start without them. → **PASS**.
3. **Static-only PWA caching** — service worker precache list = `build` + `files`
   only; fetch handler never caches navigations, `/api/*`, auth routes, `/healthz`,
   or authenticated HTML. → **PASS** (design in research.md R8; test in quickstart).
4. **No Docker mutation capability** — socket-proxy grants `CONTAINERS` read only,
   `POST=0`; portal has no code path that issues a non-GET Docker request; raw
   socket never reaches the portal container. → **PASS** (contract + test).

### Deviation note (not a violation)

The server runbook's "add a service" guidance describes adding a block to the
existing media Compose stack. This plan instead runs the portal as a **separate
Compose project**, which is what Constitution III *requires* (isolation so the
portal cannot affect the media stack lifecycle). The runbook does not prohibit a
second project. Action: during implementation, add a short "portal" section to the
server's private runbook and migration log recording this project and its
digest-update procedure (Principle XII). No product-owner decision or Constitution
amendment is required.

### Server-document conflict check

The server's private operational documents (the host setup notes and the
operations runbook) were reviewed against the approved Constitution and spec.
Findings:

- No mutable tags / no Watchtower / manual digest updates / `docker compose stop`
  (never `down -v`) / no `ufw` — **all consistent** with Constitution VI, VIII, XII.
- Config-dir and restart-policy conventions — followed by the portal project.
- The "add a service" pattern — **documented deviation** handled above, not a
  conflict.
- DHCP-lease origin address — captured as a spec Assumption; making it a
  reservation is explicitly a server-ops task outside this project.

**No blocking conflict. Proceeding.**

### Post-Phase-1 re-check

After the design artifacts below were produced — and again after the 2026-08-30
plan-review corrections (whole-tree disclosure gate, local-HTTPS cookie validation
per research R11, and the FR-030 discovery-vs-status split) — the table above and
the four gates were re-evaluated. No new violations introduced: the
route/authorization model (contracts) keeps `/healthz` the only unauthenticated
non-static route and never emits non-labelled services; the data model holds no
persistent store and never fabricates/caches/retains a service list; the Docker
contract is GET-only on `CONTAINERS`; the session cookie keeps its production
`Secure`/`__Host-` attributes (local HTTPS is a test-harness concern only). **The
whole-tracked-tree disclosure + secrets scan is clean.** **Constitution Check:
PASS (pre- and post-design).** Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-portal-v1/
├── spec.md              # Approved specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R11
├── data-model.md        # Phase 1 — entities, parsing, state mapping, session
├── contracts/           # Phase 1 — interface contracts
│   ├── README.md            # index + authorization matrix + "no public API" note
│   ├── http-routes.md       # browser routes + /api/services + /healthz
│   ├── label-contract.md    # homemedia.* label vocabulary, defaults, normalisation
│   └── docker-api-contract.md  # exact Docker Engine API calls + socket-proxy config
├── quickstart.md        # Phase 1 — end-to-end validation guide
└── checklists/
    └── requirements.md  # spec quality checklist (from spec phase)
```

### Source Code (repository root) — *intended layout, created during implementation*

```text
src/
├── app.html
├── app.css                        # design tokens, reset, control-room theme
├── hooks.server.ts                # session guard, security headers, CSP, cache-control
├── service-worker.ts              # precache build+files only; network-only otherwise
├── lib/
│   ├── types.ts                   # shared types (ServiceProjection, Category, …)
│   ├── server/
│   │   ├── env.ts                 # validate + expose runtime config; fail fast
│   │   ├── auth/
│   │   │   ├── password.ts        # hash-wasm Argon2id verify + fixed dummy hash
│   │   │   ├── session.ts         # sign / verify HMAC cookie; 30-day exp
│   │   │   └── rate-limit.ts      # in-memory sliding-window per client IP
│   │   ├── docker/
│   │   │   ├── client.ts          # fetch wrapper for DOCKER_PROXY_URL (GET only)
│   │   │   ├── discovery.ts       # list containers filtered by homemedia.enable
│   │   │   └── status.ts          # State/Health → up|down|unknown mapping
│   │   ├── labels.ts              # parse homemedia.* → LabelSet + defaults
│   │   └── security-headers.ts    # CSP + headers helper
│   └── components/
│       ├── LoginForm.svelte
│       ├── SearchBar.svelte
│       ├── CategorySection.svelte
│       ├── ServiceCard.svelte
│       ├── StatusDot.svelte       # text + shape + colour (not colour alone)
│       ├── LanOnlyBadge.svelte
│       └── EmptyState.svelte      # no-results / status-unavailable / no-services
├── routes/
│   ├── +layout.svelte
│   ├── +layout.server.ts          # expose session presence to layout
│   ├── +page.server.ts            # guard → load projection + status (SSR)
│   ├── +page.svelte               # dashboard
│   ├── login/
│   │   ├── +page.svelte
│   │   └── +page.server.ts        # form action: verify, throttle, set cookie
│   ├── logout/
│   │   └── +server.ts             # POST only, CSRF-checked, clears cookie
│   ├── api/
│   │   └── services/
│   │       └── +server.ts         # GET JSON projection; Cache-Control: no-store
│   └── healthz/
│       └── +server.ts             # GET, unauthenticated, no inventory/session
├── lib/icons/                     # bundled SVG subset
│   ├── index.ts                   # id → inline SVG map; generic fallback
│   ├── LICENSE                    # Apache-2.0 verbatim
│   ├── NOTICE                     # attribution + trademark disclaimer
│   └── PROVENANCE.md              # upstream repo + pinned commit + selected ids
static/
├── manifest.webmanifest
├── icons/                         # PWA icons 192/512 + maskable
└── robots.txt                     # disallow all
tests/
├── unit/                          # labels, session, status-mapping, rate-limit, env
└── e2e/                           # auth, dashboard, discovery-isolation, pwa, a11y
docs/
└── deployment.md                  # public-safe deploy + digest promote/rollback
Dockerfile                         # multi-stage, non-root, digest-pinned base, HEALTHCHECK
README.md                          # overview + icon attribution + links to specs/
```

**Structure Decision**: Single SvelteKit project (Project Type = web app, one
deployable). `src/lib/server/**` holds everything that must never reach the client
(Docker read, auth, env). Routes are thin; logic lives in `lib/server`. Tests split
unit vs. e2e. `docs/deployment.md` carries operator guidance in public-safe wording;
real values stay in untracked `PRIVATE-CONTEXT.md`.

## Deployment design (public-safe wording)

- **Two containers, one Compose project** (own directory, own internal network):
  1. `socket-proxy` — `docker-socket-proxy`, image digest-pinned; env
     `CONTAINERS=1`, `POST=0`; `read_only: true`, `no-new-privileges`,
     `cap_drop: [ALL]`; raw Docker socket mounted read-side **only here**; no host
     ports.
  2. `portal` — public GHCR image digest-pinned; env: `ORIGIN`,
     `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER=x-forwarded-for`,
     `XFF_DEPTH=1`, `BODY_SIZE_LIMIT` (small), `PORT`/`HOST` (adapter-node
     defaults), `DOCKER_PROXY_URL`, `PORTAL_USERNAME`, `PORTAL_PASSWORD_ARGON2`,
     `SESSION_SECRET`, `SERVICE_LINK_BASE` (host template for `homemedia.port`).
     Publishes its port to the configured private origin address only.
     `restart: unless-stopped`. Concrete addresses/ports live only in the
     operator's untracked notes.
- **Secrets** come from an operator-managed env file that is **not** in the repo.
- **Images**: built by CI, pushed to public GHCR as `:sha-<short>` and a semver
  tag; the deployed Compose file pins `@sha256:…`. No `:latest` in deployment.
- **Promote**: pull the new tag, resolve its digest, update the one `@sha256:` line,
  `docker compose up -d portal`, watch `/healthz` and logs.
- **Rollback**: restore the previous `@sha256:` line (kept as a comment/anchor),
  `docker compose up -d portal`. Never `docker compose down -v`.
- **`homemedia.*` labels** on existing services are added via the server's
  documented change process and recorded in its private runbook/migration log.
- **External access** is gated: not accepted until the estate HTTPS reverse-proxy
  route to the portal origin is verified end-to-end with correct forwarded headers.
  This project does not create or modify that route.

Full step-by-step (with placeholders) is in [quickstart.md](./quickstart.md).

## Complexity Tracking

No Constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
