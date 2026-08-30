# Phase 0 Research: Portal v1

All decisions below are resolved (no open `NEEDS CLARIFICATION`). Sources are
primary (framework docs, OWASP, MDN, upstream project repos). No private
addresses, hostnames, ports, server paths, or service names appear here.

---

## R1. SvelteKit Node adapter behind a reverse proxy

**Decision**

- Use `@sveltejs/adapter-node`; run the built server as a single Node process.
- Set, in the deployment environment:
  - `ORIGIN` = the portal's external HTTPS origin (value kept private).
  - `PROTOCOL_HEADER=x-forwarded-proto`
  - `HOST_HEADER=x-forwarded-host`
  - `ADDRESS_HEADER=x-forwarded-for`
  - `XFF_DEPTH=1` (exactly one trusted proxy in front).
  - `BODY_SIZE_LIMIT=64K` (portal only accepts a tiny login form; default is 512K).
  - `HOST` = all interfaces, `PORT` = `<CONTAINER_PORT>` (the Node adapter's
    documented default) inside the container. Concrete values live only in the
    operator's untracked notes.
- The reverse proxy MUST send `X-Forwarded-Proto`, `X-Forwarded-Host`, and a
  single-hop `X-Forwarded-For`. If it cannot, `ORIGIN` alone still fixes URL
  generation but client-IP attribution degrades (see R4).

**Rationale**

- The adapter reads `X-Forwarded-For` **from the right**, using `XFF_DEPTH` to skip
  exactly the trusted proxies; this prevents a client pre-seeding a spoofed chain.
- The adapter docs explicitly warn that `PROTOCOL_HEADER`/`HOST_HEADER` must only be
  set "if your server is behind a trusted reverse proxy; otherwise, it'd be
  possible for clients to spoof these headers." The portal's origin is not
  routable from the public internet, and the trusted-LAN caveat is recorded in the
  spec, so this condition holds.
- Getting `ORIGIN`/`PROTOCOL_HEADER`/`HOST_HEADER` right is also required for
  SvelteKit's built-in CSRF check (R3) and for `Secure`/`__Host-` cookies (R2).

**Alternatives considered**

- `adapter-node` with an in-app `handle` hook re-deriving the origin from headers:
  rejected — duplicates adapter behaviour, easy to get subtly wrong.
- Deno/Bun adapters or `adapter-static`: rejected — the portal needs server-side
  auth, SSR of the dashboard, and a server-only Docker read; a static build cannot
  do any of these.

Source: SvelteKit — Node adapter (`svelte.dev/docs/kit/adapter-node`), Configuration
(`svelte.dev/docs/kit/configuration`).

---

## R2. `__Host-` session cookie behaviour

**Decision**

- Session cookie name: `__Host-hmp_session`.
- Attributes: `Secure; Path=/; HttpOnly; SameSite=Lax`; **no `Domain`**.
- Set only over HTTPS (guaranteed in production via the reverse proxy + `ORIGIN`;
  validated locally / in CI behind a local TLS terminator — see R11).
- `Max-Age` = exactly 30 days (2 592 000 s); the signed payload also carries an
  absolute `exp` and is the authority (R5).

**Rationale**

- MDN: `__Host-` requires `Secure`, `Path=/`, **no `Domain`**, and to be set from a
  secure origin. This binds the cookie to the exact host, blocks subdomain
  injection, and prevents path-scoped override.
- `SameSite=Lax` (the browser default when omitted) still sends the cookie on
  top-level navigations to the portal (a bookmark, a link from another app), so a
  logged-in user returning to the portal is not forced to re-auth, while cross-site
  `POST` is not carried.
- `HttpOnly` keeps the token out of `document.cookie`, limiting XSS impact.

**Alternatives considered**

- `__Secure-` prefix: weaker (allows `Domain`); no reason to accept that here.
- `SameSite=Strict`: rejected — a user following a link/bookmark to the portal
  would land unauthenticated on first hit, then authenticated on reload; confusing
  on mobile.
- Server-side session store: rejected for v1 — adds state/storage the Constitution
  discourages; a signed stateless cookie meets every requirement including
  rotation-based revocation (R5).

Source: MDN — "Using HTTP cookies" / cookie prefixes.

---

## R3. CSRF for login/logout

**Decision**

- Implement login and logout as SvelteKit **form actions** (content type
  `application/x-www-form-urlencoded`).
- Rely on SvelteKit's built-in origin check; leave `csrf.trustedOrigins` empty.
- No cross-origin state-changing endpoint exists. `GET /api/services` and
  `GET /healthz` are read-only.

**Rationale**

- SvelteKit, in production, checks the `Origin` header on `POST/PUT/PATCH/DELETE`
  for `application/x-www-form-urlencoded`, `multipart/form-data`, and `text/plain`,
  and rejects mismatches against the server origin. Form-action login/logout are
  therefore CSRF-protected with no extra code, provided `ORIGIN` is correct (R1).
- Note: the built-in check does **not** cover `application/json`. The portal
  deliberately exposes no JSON mutation endpoint, so this gap is not reachable.

**Alternatives considered**

- Double-submit CSRF token: unnecessary given the built-in check + no JSON
  mutations.

Source: SvelteKit — Configuration (`csrf.checkOrigin`, `csrf.trustedOrigins`).

---

## R4. Login throttle / client-IP attribution

**Decision**

- In-memory sliding-window limiter, keyed by client IP from
  `event.getClientAddress()` (which honours `ADDRESS_HEADER` + `XFF_DEPTH`).
- Policy: allow 5 failed attempts per IP per rolling 15 min; on the 6th, refuse all
  attempts from that IP for a 15-min cool-off. Successful auth clears the counter.
- Documented as **best-effort** (single instance, memory-only, resets on restart);
  the spec already states it is not a substitute for edge protection.
- Data structure: `Map<ip, { fails: number[]; blockedUntil?: number }>`, pruned
  opportunistically and on a periodic timer.

**Rationale**

- Meets FR-005 / SC-011 exactly with no dependency.
- `getClientAddress()` is the framework-blessed accessor and already applies the
  right-to-left XFF parsing from R1.

**Alternatives considered**

- Persistent/Redis-backed limiter: rejected — introduces storage the Constitution
  discourages, for a single-user portal.
- Global (not per-IP) counter: rejected — one failing client would lock the
  household out.

Source: SvelteKit — `RequestEvent.getClientAddress`, Node adapter `ADDRESS_HEADER`
/ `XFF_DEPTH`.

---

## R5. Argon2id password hashing + stateless signed session

**Decision**

- **Hashing**: Argon2id, parameters `m = 19456 KiB (19 MiB)`, `t = 2`, `p = 1`
  (OWASP minimum). Store the PHC-format hash string in an environment variable;
  never store or log the plaintext.
- **Library**: `hash-wasm` (pure WebAssembly `argon2id` + `argon2Verify`), so the
  container needs no native build toolchain and the image stays small.
- **Verify path**: always run a verify — against the real hash if the username
  matches, otherwise against a fixed dummy Argon2id hash — so timing and work are
  constant regardless of username validity. One generic failure response (FR-004).
- **Session token**: `base64url(JSON) + "." + base64url(HMAC-SHA256(JSON, SESSION_SECRET))`
  where `JSON = { v: 1, sub, iat, exp }` and `exp = iat + 2 592 000`. Verify with
  `crypto.timingSafeEqual`; reject if signature invalid or `now >= exp`.
- **Rotation**: changing `SESSION_SECRET` changes every HMAC → all existing tokens
  fail verification → global forced re-auth (FR-028 / SC-013), no store needed.
- **Config**: `SESSION_SECRET` MUST be ≥ 32 bytes of randomness; `env.ts` fails
  startup if it is missing or too short.

**Rationale**

- OWASP names Argon2id first choice with that exact minimum; `m=19456,t=2,p=1` is
  the lowest-RAM row of the equivalent-defence set and fits a small mini-PC.
- `hash-wasm` avoids `node-gyp`/prebuild-download supply-chain surface and works
  identically across build and runtime.
- Node's built-in `crypto` (HMAC + `timingSafeEqual`) covers signing with zero
  dependencies; a JWT library would add surface for no gain at this scale.

**Alternatives considered**

- `@node-rs/argon2` (native, prebuilt): viable and faster, but pulls a
  platform-specific binary; kept as a fallback if WASM perf is inadequate.
- `argon2` (node-gyp): rejected — build toolchain in the image.
- JWT (`jose`): rejected — more spec surface (alg confusion, claims) than a
  single-purpose HMAC blob needs.
- bcrypt/scrypt: rejected — OWASP prefers Argon2id; only fall back if Argon2id
  unavailable.

Sources: OWASP Password Storage Cheat Sheet (Argon2id parameters); Node.js `crypto`
docs (`createHmac`, `timingSafeEqual`); `hash-wasm` project README.

---

## R6. Docker socket-proxy: list/inspect only, no mutation

**Decision**

- Put a **Tecnativa `docker-socket-proxy`** container between the portal and the
  Docker socket, digest-pinned.
- Environment on the proxy:
  - `CONTAINERS=1` (enables `GET /containers/json` and `GET /containers/{id}/json`)
  - `POST=0` (explicit; also the default) → only `GET`/`HEAD` reach the daemon,
    "meaning any section of the API is read-only"
  - Leave `IMAGES`, `NETWORKS`, `VOLUMES`, `EXEC`, `BUILD`, `COMMIT`, `SWARM`,
    `SERVICES`, `TASKS`, `SECRETS`, `CONFIGS`, `AUTH`, `SYSTEM`, `ALLOW_START`,
    `ALLOW_STOP`, `ALLOW_RESTARTS`, `PLUGINS`, `DISTRIBUTION`, `SESSION`, `NODES`,
    `GRPC` at their default `0`.
  - `EVENTS`, `PING`, `VERSION` are `1` by default; they are harmless read-only
    endpoints. The portal only calls the container endpoints; the proxy manifest
    lists these three explicitly in the operator's deployment notes so the posture
    is auditable, and `EVENTS`/`VERSION` MAY be set to `0` since the portal does
    not use them (`PING` is convenient for the proxy's own healthcheck).
- The proxy container: `read_only: true`, `no-new-privileges`, `cap_drop: [ALL]`,
  no ports published to the host, on a dedicated internal network shared only with
  the portal. The **raw Docker socket is mounted only into the proxy**, read-side.
- The portal connects via `DOCKER_PROXY_URL` (an internal `http://` URL on a
  private Docker network; no TLS). The concrete host and port are deployment
  configuration and live only in the operator's untracked notes.

**Rationale**

- `CONTAINERS=1` + `POST=0` is the minimal grant that satisfies discovery
  (label-filtered list) and status (per-container inspect for health) while making
  create/start/stop/exec structurally impossible (FR-026, Principle IV).
- `IMAGES` is **not** required: the container JSON already carries the `Image`
  string used for icon guessing.
- Hardening flags on the proxy limit blast radius if the proxy itself were
  compromised.

**Alternatives considered**

- Mounting `/var/run/docker.sock` into the portal directly (even `:ro`): rejected —
  a filesystem `:ro` mount does not make the API read-only; full daemon control
  remains. Constitution IV forbids it.
- `linuxserver/docker-socket-proxy`: equivalent; Tecnativa chosen as the
  widely-audited reference implementation.
- A full container-management UI's own API: rejected — heavier, and grants far
  more than list/inspect.

Source: Tecnativa `docker-socket-proxy` README (environment variables, "read-only"
behaviour, its TCP listen port); Docker Engine API reference (`/containers/json`,
`/containers/{id}/json`).

---

## R7. Dashboard Icons licence and bundling

**Decision**

- Source icons from **`homarr-labs/dashboard-icons`**, currently licensed
  **Apache License 2.0** (verified at build time — the plan's Constitution Check
  requires re-verifying the `LICENSE` file for the pinned commit before shipping).
- Bundle only a **small curated subset of SVGs**, committed under
  `src/lib/icons/` and pinned to a specific upstream commit recorded in
  `src/lib/icons/PROVENANCE.md`.
- Include, with the bundled assets:
  - `src/lib/icons/LICENSE` — verbatim Apache-2.0 text.
  - `src/lib/icons/NOTICE` — attribution: "Icons from homarr-labs/dashboard-icons
    (© 2024 Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs), Apache
    License 2.0", plus the upstream trademark disclaimer: "All product names,
    trademarks and registered trademarks are the property of their respective
    owners; icons are used for identification purposes only and do not imply
    endorsement."
  - A short credit line in the repo root `README.md` and in the portal's UI
    "About"/footer.
- **No icon is fetched at runtime** (FR-012); the service worker never needs a
  network icon.

**Rationale**

- Apache-2.0 §4 requires retaining copyright/attribution notices and, where a
  NOTICE exists, reproducing it. Upstream has no root `NOTICE` file today, so we
  author an attribution `NOTICE` from the `LICENSE` copyright holders and the
  README's trademark statement.
- Pinning to a commit makes the licence state auditable and reproducible; the
  Constitution Check re-verifies because upstream licences can change.

**Alternatives considered**

- Simple Icons (CC0): many brand marks but monochrome only and its own trademark
  caveat; dashboard-icons already indexes it. Rejected for v1 to keep one source.
- Icon font / sprite from a CDN: rejected — violates "no runtime fetch" and the
  CSP.
- Emoji fallback only: kept as the ultimate generic fallback, not the primary set.

Sources: `homarr-labs/dashboard-icons` — `LICENSE` (Apache-2.0) and `README`
(trademark disclaimer); Apache License 2.0 §4, §6.

---

## R8. PWA / service-worker strategy (static assets only)

**Decision**

- Use SvelteKit's `src/service-worker.ts`. Precache exactly
  `...build, ...files` from the `$service-worker` module (hashed app chunks +
  `static/`), keyed by `version`.
- Fetch handler:
  - Same-origin `GET` for a precached asset URL → cache-first.
  - **Everything else → network only, never cached.** No runtime caching of
    navigations, `/api/*`, `/login`, `/logout`, `/healthz`, or any authenticated
    HTML (FR-024 / Constitution X).
  - On `activate`, delete caches whose key != current `version`.
- `static/manifest.webmanifest`: `display: standalone`, name/short_name, theme and
  background colours, maskable + any-purpose icons at 192/512 (FR-023).
- No offline page for authenticated content; if offline and not precached, the
  browser's normal offline error is acceptable.

**Rationale**

- `build` and `files` are the only URL sets the framework marks as safe to cache;
  they are content-hashed so cache-first is correct.
- Explicitly scoping the fetch handler to the precache list makes "static only"
  verifiable (see `quickstart.md`): any dynamic URL must show a cache miss.
- SvelteKit auto-registers the worker and leaves it unbundled in dev, so dev does
  not accidentally serve stale assets.

**Alternatives considered**

- `@vite-pwa/sveltekit` / Workbox `runtimeCaching`: rejected — its ergonomics push
  toward caching navigations/APIs; hand-writing ~30 lines keeps the guarantee
  auditable.
- No service worker (manifest-only installable): installability works, but iOS
  standalone launch and reliable icon/name are better with a minimal worker.

Source: SvelteKit — Service workers (`$service-worker`: `build`, `files`,
`version`; auto-registration; dev behaviour).

---

## R9. Accessibility & mobile testing approach

**Decision**

- **Contrast**: design tokens chosen so body text ≥ 4.5:1 and large text / essential
  non-text UI ≥ 3:1 against their backgrounds (WCAG 2.1 AA — 1.4.3 / 1.4.11).
  Verified with `@axe-core/playwright` in CI-style e2e and a manual contrast check
  list in `quickstart.md`.
- **Target size**: every interactive control ≥ 44 × 44 CSS px (spec FR-019). Note
  this exceeds WCAG 2.1 AA's 2.5.8 (24 px) and meets the stricter 2.5.5 (AAA) /
  common mobile-platform guidance. Enforced by component styles + a Playwright
  bounding-box assertion.
- **Reduced motion**: all non-essential transitions/animations wrapped in
  `@media (prefers-reduced-motion: no-preference)`; nothing animates when the user
  asks for reduced motion (FR-022 / SC-007). Playwright runs the a11y suite twice,
  once with `reducedMotion: 'reduce'`.
- **Viewport**: primary target 360 px wide; Playwright project uses a 360 × 780
  viewport; assert no horizontal scroll (`scrollWidth <= clientWidth`) on login and
  dashboard (SC-005).
- **Semantics**: landmark regions, a single `h1`, labelled search input, status
  conveyed by text + shape + colour (not colour alone), `aria-live` polite region
  for "refreshed" and empty/error states.
- **Keyboard**: full tab order, visible focus ring meeting contrast, `Enter`/`Space`
  activate tiles (native `<a>`/`<button>`).

**Rationale**

- axe-core catches the machine-checkable subset (contrast, names/roles, landmarks);
  the `quickstart.md` manual list covers the rest (focus order, motion, one-handed
  reach).
- Doubling the a11y run under `reducedMotion: 'reduce'` turns FR-022 into an
  automated check.

**Alternatives considered**

- Lighthouse-only: rejected — good for PWA installability signal (kept for that),
  weaker than axe for DOM a11y assertions.
- Manual-only accessibility QA: rejected — not repeatable; Constitution XII wants
  verification evidence per change.

Sources: W3C WCAG 2.1 (1.4.3 Contrast Minimum, 1.4.11 Non-text Contrast, 2.5.5 /
2.5.8 Target Size, 2.3.3 Animation from Interactions); MDN
`prefers-reduced-motion`; Playwright test config (`viewport`, `reducedMotion`);
`@axe-core/playwright`.

---

## R10. Docker status derivation (state + healthcheck only)

**Decision**

- Discovery call: `GET /containers/json?all=1&filters={"label":["homemedia.enable=true"]}`.
- Status call (per discovered container): `GET /containers/{id}/json`, read
  `.State.Status` and `.State.Health.Status`.
- Per-service status mapping (spec FR-015):
  | Inspect result | Portal status |
  |---|---|
  | `Health.Status = healthy` | `up` |
  | `Health.Status = unhealthy` | `down` |
  | `Health.Status = starting` | `unknown` (labelled "starting") |
  | no healthcheck, `State.Status = running` | `up` |
  | no healthcheck, `State.Status` ∈ {exited, dead, created, paused, restarting} | `down` |
  | this container's inspect call fails / times out | `unknown` (labelled "Status unavailable") — this service is still listed |
- **Two distinct failure modes** (product-owner decision 2026-08-30, spec FR-030):
  - **Discovery succeeds, some inspects/status-derivations fail** → list every
    discovered labelled service; the affected ones show `unknown` /
    "Status unavailable"; unaffected ones show their real status (`sourceOk = true`).
  - **Discovery itself fails / proxy unreachable** → `sourceOk = false`: the
    dashboard shows an explicit "service directory is currently unavailable" state
    and **no service list**. The portal MUST NOT fabricate, cache, or retain a
    list (v1 has no persistence).
- Status is computed at page load (`+page.server.ts`) and on demand via
  `GET /api/services`. **No polling, no background loop, no HTTP probe of the
  service itself** (FR-016).
- Short server-side timeouts (per call and an overall dashboard-load budget) so a
  hung daemon does not hang the dashboard — on timeout, the same two-mode rule
  applies (discovery timeout → `sourceOk = false`; per-inspect timeout → that
  service `unknown`).

**Rationale**

- `State` + `State.Health` are exactly the signals the spec allows and are present
  on the standard inspect payload; no extra endpoints or capabilities needed.
- Failing a single inspect closed to `unknown` (not `down`) while still listing the
  service satisfies FR-030 / SC-009 and avoids a false "everything's down" alarm.
- Failing discovery closed to "no list" (rather than an empty or stale list)
  satisfies FR-030 / SC-015 and never misrepresents the directory.

**Alternatives considered**

- `/events` stream for live updates: rejected for v1 (FR-016 forbids streaming);
  revisit later.
- Single `/containers/json` without inspect (it carries `State` as a string but not
  `Health`): rejected — cannot distinguish healthy vs. unhealthy.

Source: Docker Engine API reference — `GET /containers/json` (filters),
`GET /containers/{id}/json` (`State`, `State.Health`).

---

## R11. Validating the `Secure` / `__Host-` session cookie locally and in CI

**Problem**

The production session cookie is `__Host-hmp_session` with `Secure` (R2). A real
browser will not store or return a `Secure` / `__Host-` cookie over plain `http://`
except on the special `http://localhost` trustworthy origin — and even there the
behaviour is browser-version dependent and `curl` will refuse to send it. So
authentication and session flows **cannot** be validated over plain HTTP without
weakening the cookie, which is forbidden.

**Decision**

Split validation into two tiers, and add a third as part of the existing gate:

1. **Non-auth checks over plain HTTP** (`curl`, scripts): liveness (`/healthz`),
   the unauthenticated redirect from `/`, env fail-fast, build/image sanity,
   static-cache inspection. These never touch the session cookie.
2. **Auth / session checks over local HTTPS**: run the built adapter-node server on
   a loopback port, put a **throwaway local TLS reverse proxy in front of it**, and
   point the browser test runner at the `https://` origin. Primary tool:
   **Caddy** (`caddy reverse-proxy --from https://localhost --to <loopback:port>`),
   which provisions and installs a local CA automatically, so the browser trusts
   the cert with no flags. Set the server's `ORIGIN` to that `https://localhost`
   origin. Playwright then exercises the real `Secure` / `__Host-` cookie path
   (set on login, sent back on navigation, cleared on logout, rejected after
   `exp`, rejected after `SESSION_SECRET` rotation).
   - Fallback if Caddy is unavailable: `npx local-ssl-proxy` (self-signed) plus
     Playwright `ignoreHTTPSErrors: true` — the origin is still `https://`, so it is
     a secure context and the cookie path is still exercised; only cert trust is
     bypassed.
3. **Production truth**: full browser-session validation on a real device is also
   an explicit item of the **HTTPS reverse-proxy acceptance gate**
   ([quickstart.md](./quickstart.md) §"reverse-proxy acceptance gate"). The real
   `__Host-` cookie over the real hostname is only *confirmed* there.

No production exception, no insecure-cookie mode, no alternate cookie name or
weakened attributes are introduced. Local HTTPS is a test-harness concern only.

**Rationale**

- A local TLS terminator reproduces the exact production topology (HTTPS proxy →
  plain-HTTP adapter-node) so the forwarded-header + `Secure` cookie behaviour is
  tested as it will actually run.
- Caddy's automatic local CA keeps the harness to one command with no committed
  cert material (nothing to leak, nothing to expire in the repo).
- Keeping tier 1 explicitly cookie-free removes the temptation to "just test login
  over http on localhost", which is exactly the fragile path to avoid.

**Alternatives considered**

- `vite dev --https` / `@vitejs/plugin-basic-ssl`: works for the dev server but not
  for validating the **built** adapter-node output; kept only for component-level
  dev.
- Relaxing to `__Secure-` or dropping `Secure` for a "dev mode": rejected —
  forbidden by the task and by Constitution IX; also would not test the real path.
- Committing an `mkcert` cert/key into the repo: rejected — key material in a public
  repo.

Sources: MDN — cookie prefixes / `Secure` and "potentially trustworthy origins";
Caddy docs — `caddy reverse-proxy` and automatic local HTTPS / local CA; Playwright
docs — `ignoreHTTPSErrors`, `webServer`.

---

## Consolidated dependency list (for the plan)

| Purpose | Choice | Note |
|---|---|---|
| Framework | SvelteKit 2 + Svelte 5 + TypeScript + Vite | |
| Server runtime | `@sveltejs/adapter-node`, Node 22 LTS | base image digest-pinned |
| Password hash | `hash-wasm` (Argon2id) | no native toolchain |
| Session signing | Node `crypto` (stdlib) | HMAC-SHA256 |
| Docker read | native `fetch` → socket-proxy over `DOCKER_PROXY_URL` | no client library |
| Env validation | hand-rolled `env.ts` | `valibot` acceptable alternative |
| Unit tests | `vitest` | |
| E2E + a11y | `@playwright/test` + `@axe-core/playwright` | + Lighthouse for PWA signal |
| Local HTTPS for auth e2e | `caddy` (CLI, local CA) or `local-ssl-proxy` fallback | **test harness only** — not a runtime dependency, not in the image (R11) |
| Types/lint | `svelte-check`, `eslint`, `prettier` | |

No database, cache server, queue, or background worker (Constitution II). The local
TLS terminator is a developer/CI tool, never shipped or deployed.
