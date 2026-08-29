# Quickstart & Validation Guide: Portal v1

This is a **validation guide**, not implementation. It lists the runnable checks
that prove Portal v1 meets its spec.

**No concrete infrastructure values appear here.** Placeholders — fill from the
operator's untracked `PRIVATE-CONTEXT.md`, never commit them:

| Placeholder | Meaning |
|---|---|
| `<LOCAL_PORT>` | loopback port the built server listens on for local testing |
| `<HTTPS_TEST_PORT>` | loopback port the local TLS terminator listens on |
| `<DOCKER_PROXY_URL>` | internal URL of the socket-proxy |
| `<PORTAL_IMAGE>` | `ghcr.io/magpern/homemedia-portal@sha256:<digest>` |
| `<HOME_FQDN>` | the portal's real hostname (a `home.` subdomain) |

---

## 0. Prerequisites

- Node 22 LTS, a package manager, Docker + Compose.
- **A local TLS terminator** for the auth tests: `caddy` (preferred — provisions
  and trusts a local CA automatically). Fallback: `npx local-ssl-proxy` +
  Playwright `ignoreHTTPSErrors: true`. Rationale in [research.md](./research.md)
  R11.
- A test Argon2id hash + a random `SESSION_SECRET`, generated locally:
  - hash: a one-off script using `hash-wasm` `argon2id` (`m=19456,t=2,p=1`).
  - secret: `openssl rand -base64 48`.
- Never paste the plaintext password into shell history, the repo, or CI.

The validation is **three tiers** (see R11):

1. **Plain-HTTP, non-auth checks** — liveness, redirects, env fail-fast, build.
   These never touch the session cookie.
2. **Local-HTTPS auth/session checks** — the built server behind a local TLS
   terminator; the real `Secure` / `__Host-` cookie path is exercised.
3. **Production acceptance gate** (§8) — full browser session on a real device via
   the estate HTTPS reverse proxy. This is where the real `__Host-` cookie on the
   real hostname is *confirmed*.

---

## 1. Tier 1 — plain-HTTP, non-auth checks

```
npm ci
npm run build
PORTAL_USERNAME=test \
PORTAL_PASSWORD_ARGON2='<argon2id-phc-string>' \
SESSION_SECRET='<>=32 bytes>' \
DOCKER_PROXY_URL='<DOCKER_PROXY_URL>' \
ORIGIN='http://localhost:<LOCAL_PORT>' \
PORT='<LOCAL_PORT>' node build
```

| Check | Expected | Ref |
|---|---|---|
| `curl -fsS localhost:<LOCAL_PORT>/healthz` | `{"status":"ok"}`, `Cache-Control: no-store`, no other fields | FR-025 |
| `curl -s localhost:<LOCAL_PORT>/` | `302` → `/login` | FR-001 |
| `curl -s localhost:<LOCAL_PORT>/api/services` (no cookie) | `401` JSON, no data | contract |
| start with `SESSION_SECRET` unset (or < 32 bytes) | process exits non-zero, clear message, does not serve | env fail-fast, Constitution IX |
| start with `PORTAL_PASSWORD_ARGON2` not a PHC string | same | env fail-fast |

> Do **not** attempt login here. A browser will not accept a `Secure` / `__Host-`
> cookie over plain HTTP (and `curl` will not resend it). Auth lives in Tier 2.

---

## 2. Tier 2 — auth / session over local HTTPS

Run the built server on `<LOCAL_PORT>` (as in §1 but with
`ORIGIN='https://localhost:<HTTPS_TEST_PORT>'`), then in front of it:

```
caddy reverse-proxy --from https://localhost:<HTTPS_TEST_PORT> --to localhost:<LOCAL_PORT>
```

Point Playwright (or a browser) at `https://localhost:<HTTPS_TEST_PORT>`. With
Caddy's local CA trusted, no `ignoreHTTPSErrors` is needed; with the
`local-ssl-proxy` fallback, set `ignoreHTTPSErrors: true` (the origin is still
`https://`, so the cookie path is still exercised).

| Check | Expected | Ref |
|---|---|---|
| `POST /login` wrong password | `200` re-render, single generic "Invalid credentials"; no field detail; unknown-vs-known-username timing within noise | FR-004 |
| 6th failed attempt within 15 min from one client | `429` "too many attempts"; further attempts (even correct password) refused until 15 min after the 6th | FR-005, SC-011 |
| after the cool-off | login works again | FR-005 |
| `POST /login` correct password | `303` → `/`; `Set-Cookie: __Host-hmp_session=…; Secure; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`; **no `Domain`**; browser stores it | FR-006/008, R2 |
| reuse cookie after server restart | still authenticated (stateless) | FR-006 |
| tamper one byte of the token | treated as unauthenticated → `/login` | data-model §7 |
| token `exp` in the past (test helper) | rejected at `now >= exp`; exactly `iat + 2592000` | SC-014 |
| restart with a **different** `SESSION_SECRET` | every previously issued cookie rejected; all users must log in again | FR-028, SC-013 |
| `POST /logout` with valid session | `303` → `/login`; cookie cleared (`Max-Age=0`) | FR-007 |
| `GET /logout` | `405` | contract |
| `GET /api/services` with valid session | `200` `DashboardModel`; `Cache-Control: no-store` | contract |

---

## 3. Opt-in discovery + no leakage of unlabelled services

Throwaway containers: some with `homemedia.enable=true` (+ assorted `homemedia.*`),
some with **no** `homemedia.*` labels, one with `homemedia.enable=false`.

| Check | Expected | Ref |
|---|---|---|
| dashboard SSR HTML | only the `enable=true` containers; grep raw HTML + embedded JSON for the unlabelled names → **0 hits** | FR-010, SC-003 |
| `GET /api/services` body | only labelled services; no container ids, image names, or host/port internals beyond resolved `href` | contract, data-model §6 |
| remove `homemedia.enable` from a live service, re-apply, reload | tile disappears | FR-013, US4 |
| `homemedia.icon` = nonsense | generic icon; **no network request for an icon** (HAR) | FR-012 |
| `homemedia.lan_only=true` | visible "LAN only" badge | FR-029, SC-012 |
| service with neither `url` nor usable `port` | "link unconfigured", not a link | FR-018 |
| two categories differing only by case/space | merge into one section | edge case |
| search term with no matches | explicit empty state, not blank | edge case |

---

## 4. Docker status mapping + the two failure modes (FR-030)

### Per-service mapping

| Scenario | Expected portal status | Ref |
|---|---|---|
| labelled container running, no healthcheck | "Running" (`up`) | data-model §4 |
| labelled container stopped | "Not running" (`down`) after refresh | SC-010 |
| healthcheck = `starting` | "Starting" (`unknown`) | §4 |
| healthcheck = `unhealthy` | "Not running" (`down`) | §4 |

### Failure mode A — discovery OK, some inspects fail (SC-009)

Simulate per-container inspect failures (proxy up, list works, inspects error/time
out — e.g. a network fault to specific ids, or a proxy stub).

- Expected: **every discovered labelled service is still listed.** Affected ones
  show "Status unavailable" (`unknown`); unaffected ones show real status.
  `sourceOk: true`. No crash, no leak.

### Failure mode B — discovery itself fails (SC-015)

Point `DOCKER_PROXY_URL` at a dead address, or stop the proxy.

- Expected: dashboard shows an **explicit "service directory is currently
  unavailable"** state with **no service list**. `sourceOk: false`,
  `categories: []`, `counts` zero. **Nothing fabricated, cached, or retained.**
  No crash, no stack trace, within the load budget. Reload while still down → same
  (no stale list appears).

### Mutation impossible

| Check | Expected | Ref |
|---|---|---|
| manual `POST` / start / stop / exec through the proxy | `403` | docker-api-contract, Constitution IV |
| grep portal source for a non-`GET` Docker call | 0 hits | docker-api-contract |

---

## 5. Mobile, accessibility, contrast, reduced motion, PWA

Playwright project at **360 × 780**, plus a second run with
`reducedMotion: 'reduce'`.

| Check | Method | Ref |
|---|---|---|
| no horizontal scroll on `/login` and `/` | `scrollWidth <= clientWidth` at 360 px | SC-005 |
| all interactive controls ≥ 44 × 44 px | bounding-box assertion | FR-019, SC-006 |
| WCAG 2.1 AA contrast, names/roles, landmarks, one `h1` | `@axe-core/playwright`, 0 serious/critical | FR-021, SC-006 |
| status not conveyed by colour alone | axe + greyscale screenshot still legible | FR-021 |
| reduced motion | second run: assert no non-essential animation runs; stable visual diff | FR-022, SC-007 |
| keyboard | tab through login + dashboard; visible focus ring; `Enter`/`Space` activate tiles | FR-019/021 |
| PWA installable | Lighthouse "installable" audit passes; manifest has name, `display: standalone`, 192 + 512 (+ maskable) icons | FR-023, SC-008 |
| standalone launch | install on a real iOS + Android device; launches without browser chrome, own name + icon | US3 |

---

## 6. Static-only cache verification (Constitution X / FR-024)

Production build, service worker active:

1. Load `/` authenticated, then go offline and reload: the static shell may load
   from cache; **the dashboard data must not** — offline/empty, never a stale
   service list or statuses.
2. Devtools → Application → Cache Storage: only hashed `/_app/immutable/*` and
   `static/` entries. **Absent**: `/`, `/login`, `/logout`, `/api/services`,
   `/healthz`, any HTML, any JSON.
3. Automated: Playwright enumerates `caches.keys()` → `cache.keys()` and asserts
   every entry URL matches the `build` / `files` allowlist.
4. `GET /api/services` and `/` carry `Cache-Control: no-store`.

---

## 7. Image, digest deployment, rollback

```
docker run --rm \
  -e PORTAL_USERNAME=test -e PORTAL_PASSWORD_ARGON2='…' \
  -e SESSION_SECRET='…' -e DOCKER_PROXY_URL='<DOCKER_PROXY_URL>' \
  -e ORIGIN='http://localhost:<LOCAL_PORT>' -e PORT='<LOCAL_PORT>' \
  -p '<LOCAL_PORT>:<LOCAL_PORT>' <PORTAL_IMAGE>
curl -fsS localhost:<LOCAL_PORT>/healthz
```

| Check | Expected | Ref |
|---|---|---|
| container runs as non-root | `docker inspect` / `id` in exec | hardening |
| image layers | `docker history` / `dive`: no env value, no secret, no `.env`, no `PRIVATE-CONTEXT.md` in any layer | Constitution IX |
| deployed Compose | pins **both** images by `@sha256:`; no mutable tag; no Watchtower service | Constitution VI |
| promote | change the single portal `@sha256:` line → `docker compose up -d portal` → `/healthz` green → watch logs; media stack shows no restarts (`docker compose ps` on that project) | Constitution III/VI |
| rollback | restore previous `@sha256:` (kept as a comment anchor) → `docker compose up -d portal`; never `docker compose down -v` | Constitution XII |
| socket-proxy container | `read_only`, `no-new-privileges`, `cap_drop ALL`, no published ports; raw socket mounted only into it | Constitution IV |

---

## 8. Tier 3 — external HTTPS reverse-proxy acceptance gate

**Blocker until satisfied — external access is not "done" without this, and it is
the authoritative check of the real `__Host-` cookie.**

1. Confirm the estate HTTPS reverse proxy has a route for the `home.` subdomain →
   the portal origin.
2. From an external network: `https://<HOME_FQDN>/healthz` → `{"status":"ok"}` over
   valid TLS.
3. On a **real mobile device**, over that hostname: log in; confirm the browser
   accepts and stores `__Host-hmp_session` (`Secure`, no `Domain`); navigate away
   and back → still authenticated; logout clears it; a debug log shows
   `getClientAddress()` returning the real client IP (not the proxy's) — i.e. the
   proxy forwards `X-Forwarded-Proto: https`, `X-Forwarded-Host`, single-hop
   `X-Forwarded-For`.
4. Install to the device home screen; launch standalone.
5. If the route does **not** exist: **stop.** Do not create or modify the reverse
   proxy, DNS, firewall, or router (Constitution VIII, spec Dependencies). Report
   the blocker. Tiers 1–2 and §§3–7 may still proceed.

---

## 9. Disclosure & secrets gate — every authored artifact, run before every commit

Runs over an **allowlist of every path this project authors** — no plan artifact is
excluded (`specs/` includes this file). It does not scan the vendored Spec Kit
tooling under `.specify/` and `.claude/`, which is third-party and carries its own
example IDs/timestamps; review those on `specify` upgrades, not here.

```
git grep -nIE \
  -e '([0-9]{1,3}[.]){3}[0-9]{1,3}' \
  -e '[:][0-9]{2,5}([^0-9]|$)' \
  -e '(^|[[:space:]"()])[/](srv|etc|opt|mnt|var/run)[/]' \
  -e '[-]{5}BEGIN [A-Z ]*PRIVATE KEY' \
  -e '[$]argon2(id|i|d)[$]' \
  -- 'specs/' 'src/' 'tests/' 'docs/' 'scripts/' '.github/' 'README.md' 'Dockerfile' 'compose*.y*ml' \
  && { echo 'REVIEW: potential disclosure/secret above'; exit 1; } || echo 'authored-tree clean'

git check-ignore -q PRIVATE-CONTEXT.md && echo 'PRIVATE-CONTEXT.md ignored ✓' || { echo 'NOT IGNORED'; exit 1; }
git ls-files | grep -qi 'private-context' && { echo 'LEAK: tracked'; exit 1; } || echo 'not tracked ✓'
```

The five patterns catch: IPv4 literals, `:` + port, absolute host paths, PEM key
headers, PHC Argon2 hashes. `ghcr.io/magpern/homemedia-portal` (the portal's own
public image name) is expected and not a violation. Any other hit is reviewed and
resolved before commit; concrete values belong only in untracked
`PRIVATE-CONTEXT.md`.
