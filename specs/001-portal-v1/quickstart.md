# Quickstart & Validation Guide: Portal v1

This is a **validation guide**, not implementation. It lists the runnable checks
that prove Portal v1 meets its spec. Commands use placeholders for anything
private; fill real values from untracked `PRIVATE-CONTEXT.md` on the operator
machine only — never commit them.

Placeholders: `<ORIGIN>` (https URL), `<PORT>` (published port), `<HOST>` (origin
host/IP), `<PROXY_URL>` (internal `http://…:2375`).

---

## 0. Prerequisites

- Node 22 LTS, a package manager, Docker + Compose (for the proxy and image test).
- A test Argon2id hash + random `SESSION_SECRET` generated locally:
  - hash: a one-off script using `hash-wasm` `argon2id` (params `m=19456,t=2,p=1`).
  - secret: `openssl rand -base64 48`.
- Never paste the plaintext password into a shell history file, the repo, or CI.

---

## 1. Local run + health endpoint

```
npm ci
npm run build
PORTAL_USERNAME=test \
PORTAL_PASSWORD_ARGON2='<argon2id-phc-string>' \
SESSION_SECRET='<>=32 bytes>' \
DOCKER_PROXY_URL='<PROXY_URL>' \
ORIGIN='http://localhost:3000' \
node build
```

Checks:

- `curl -fsS localhost:3000/healthz` → `{"status":"ok"}`, `Cache-Control: no-store`,
  no other fields. ✅ FR-025
- `curl -s localhost:3000/` → `302` to `/login`. ✅ FR-001
- Start with `SESSION_SECRET` unset → process exits non-zero with a clear message,
  does not serve. ✅ FR (env fail-fast), Constitution IX

---

## 2. Authentication, session, throttle, expiry, rotation

Use a cookie jar (`curl -c/-b`, or Playwright).

| Check | Expected | Ref |
|---|---|---|
| `POST /login` wrong password | `200` re-render, single generic "Invalid credentials"; no field detail; response timing for unknown vs known username within noise | FR-004 |
| 6th failed attempt within 15 min from one client | `429` "too many attempts"; further attempts (even correct password) refused until 15 min after the 6th | FR-005, SC-011 |
| after the cool-off | login works again | FR-005 |
| `POST /login` correct password | `303` → `/`; `Set-Cookie: __Host-hmp_session=…; Secure; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`; **no `Domain`** | FR-006/008, R2 |
| reuse cookie after process restart | still authenticated (stateless) | FR-006 |
| tamper one byte of the token | treated as unauthenticated → `/login` | data-model §7 |
| set token `exp` to the past (test helper) or wait | rejected at `now >= exp`; exactly 30 days from `iat` | SC-014 |
| restart server with a **different** `SESSION_SECRET` | every previously issued cookie now rejected; all users must log in again | FR-028, SC-013 |
| `POST /logout` with valid session | `303` → `/login`; cookie cleared (`Max-Age=0`) | FR-007 |
| `GET /logout` | `405` | contract |
| `GET /api/services` with no/invalid session | `401` JSON, no redirect, no data | contract |

---

## 3. Opt-in discovery + no leakage of unlabelled services

Set up a few throwaway containers: some with `homemedia.enable=true` (+ assorted
`homemedia.*`), some with **no** `homemedia.*` labels, one with
`homemedia.enable=false`.

| Check | Expected | Ref |
|---|---|---|
| dashboard SSR HTML | contains only the `enable=true` containers; grep the raw HTML + any embedded JSON for the unlabelled container names → **0 hits** | FR-010, SC-003 |
| `GET /api/services` body | same: only labelled services; no container ids, image names, or host/port internals beyond resolved `href` | contract, data-model §6 |
| remove `homemedia.enable` from a live service, re-apply, reload | tile disappears | FR-013, US4 |
| `homemedia.icon` = nonsense | generic icon, **no network request for an icon** (check devtools/HAR) | FR-012 |
| `homemedia.lan_only=true` | visible "LAN only" badge on that tile | FR-029, SC-012 |
| service with neither `url` nor usable `port` | tile shows "link unconfigured", is not a link | FR-018 |
| two categories differing only by case/space | merge into one section | edge case |
| search term with no matches | explicit empty state, not blank | edge case |

---

## 4. Docker status mapping + unavailable source

| Scenario | Expected portal status | Ref |
|---|---|---|
| labelled container running, no healthcheck | "Running" (`up`) | data-model §4 |
| labelled container stopped | "Not running" (`down`) after refresh | SC-010 |
| container with healthcheck = `starting` | "Starting" (`unknown`) | §4 |
| container with healthcheck = `unhealthy` | "Not running" (`down`) | §4 |
| point `DOCKER_PROXY_URL` at a dead address | dashboard renders "Status unavailable"; **no crash**, no stack trace, within the 4 s budget; still no unlabelled-service leak | SC-009, contract |
| attempt `POST`/start/stop/exec through the proxy manually | `403` from the proxy | docker-api-contract, Constitution IV |
| grep portal source for a non-`GET` Docker call | 0 hits | docker-api-contract |

---

## 5. Mobile, accessibility, contrast, reduced motion, PWA

Playwright project at **360 × 780**, plus a second run with
`reducedMotion: 'reduce'`.

| Check | Tool / method | Ref |
|---|---|---|
| no horizontal scroll on `/login` and `/` | `scrollWidth <= clientWidth` assertion at 360 px | SC-005 |
| all interactive controls ≥ 44 × 44 px | bounding-box assertion over links/buttons/inputs | FR-019, SC-006 |
| WCAG 2.1 AA contrast, names/roles, landmarks, one `h1` | `@axe-core/playwright`, 0 serious/critical violations | FR-021, SC-006 |
| status conveyed by text + shape, not colour alone | axe + manual: greyscale screenshot still legible | FR-021 |
| reduced motion | second Playwright run: assert no non-essential animation/transition runs; visual diff stable | FR-022, SC-007 |
| keyboard | tab through login and dashboard; visible focus ring; `Enter`/`Space` activate tiles | FR-019/021 |
| PWA installable | Lighthouse PWA / "installable" audit passes; `manifest.webmanifest` has name, `display: standalone`, 192 + 512 (+ maskable) icons | FR-023, SC-008 |
| standalone launch | install on a real iOS + Android device; launches without browser chrome, own name + icon | US3 |

---

## 6. Static-only cache verification (Constitution X / FR-024)

With the service worker active (production build):

1. Load `/` while authenticated, then go offline and reload:
   - the static shell may load from cache; **the dashboard data must not** — the
     page shows offline/empty, never a stale service list or stale statuses.
2. In devtools → Application → Cache Storage: the only cache holds hashed
   `/_app/immutable/*` and `static/` entries. Assert **absent**: `/`, `/login`,
   `/logout`, `/api/services`, `/healthz`, any HTML document, any JSON.
3. Automated: a Playwright test enumerates `caches.keys()` → `cache.keys()` and
   asserts every entry URL matches the `build`/`files` allowlist.
4. `GET /api/services` and `/` responses carry `Cache-Control: no-store`.

---

## 7. Image, digest deployment, rollback

```
# build + run the published image locally
docker run --rm -e PORTAL_USERNAME=test -e PORTAL_PASSWORD_ARGON2='…' \
  -e SESSION_SECRET='…' -e DOCKER_PROXY_URL='<PROXY_URL>' -e ORIGIN='http://localhost:3000' \
  -p 3000:3000 ghcr.io/magpern/homemedia-portal@sha256:<digest>
curl -fsS localhost:3000/healthz
```

Checks:

- Image runs as a **non-root** user (`docker inspect` / `id` in an exec) — but
  note the portal container needs no exec capability in production.
- `docker history` / `dive`: no env value, no secret, no `PRIVATE-CONTEXT.md`,
  no `.env` in any layer. ✅ Constitution IX
- Deployed Compose file pins **both** images by `@sha256:` — no `:latest`,
  no Watchtower service present. ✅ Constitution VI
- **Promote**: change the single portal `@sha256:` line → `docker compose up -d
  portal` → `/healthz` green → watch logs. Media stack untouched
  (`docker compose ps` on the media project shows no restarts).
- **Rollback**: restore the previous `@sha256:` (kept as a comment anchor) →
  `docker compose up -d portal`. Never `docker compose down -v`. ✅ Constitution XII
- Socket-proxy container: `read_only`, `no-new-privileges`, `cap_drop ALL`, no
  published ports; raw socket mounted only into it.

---

## 8. External reverse-proxy acceptance gate

**Blocker until satisfied — external access is not "done" without this.**

1. Confirm the estate HTTPS reverse proxy has a route for the `home.` subdomain →
   the portal origin `<HOST>:<PORT>`.
2. From an external network, `https://<home-fqdn>/healthz` → `{"status":"ok"}` over
   valid TLS.
3. The proxy forwards `X-Forwarded-Proto: https`, `X-Forwarded-Host: <home-fqdn>`,
   and a single-hop `X-Forwarded-For`. Verify: login sets a `Secure` `__Host-`
   cookie (browser accepts it) and `event.getClientAddress()` in a debug log shows
   the real client IP, not the proxy's.
4. If the route does **not** exist: **stop**. Do not create or modify the reverse
   proxy, DNS, firewall, or router (Constitution VIII, spec Dependencies). Report
   the blocker to the product owner. Local/LAN validation (sections 1–7) may still
   proceed.

---

## 9. Disclosure & secrets gate (run before every commit)

```
git grep -nE '(\b\d{1,3}(\.\d{1,3}){3}\b)|<real-fqdn>|<real-domain>|:8[0-9]{3}\b|/srv/|BEGIN [A-Z ]*PRIVATE KEY|argon2\$' -- . ':!specs/001-portal-v1/quickstart.md'
git check-ignore PRIVATE-CONTEXT.md            # must print the path (ignored)
git ls-files | grep -i 'private-context'       # must print nothing
```

No IP, real FQDN/domain, real port, server path, key material, or password hash in
any tracked file. Concrete values live only in untracked `PRIVATE-CONTEXT.md`.
