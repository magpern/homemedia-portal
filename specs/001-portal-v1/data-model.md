# Phase 1 Data Model: Portal v1

No persistent storage. Every structure below is either derived per-request from the
Docker API or held briefly in process memory. No private infrastructure values
appear here.

---

## 1. `RawContainer` — input from the Docker read

Shape consumed from the socket-proxy (subset of the Docker Engine API). See
[contracts/docker-api-contract.md](./contracts/docker-api-contract.md).

| Field | Source | Used for |
|---|---|---|
| `id` | `/containers/json[].Id` | inspect key, dedupe |
| `names` | `.Names` | display-name fallback |
| `image` | `.Image` | icon guess |
| `stateString` | `.State` (`running`, `exited`, …) | status fallback |
| `labels` | `.Labels` (string→string map) | discovery + presentation |
| `health` | `/containers/{id}/json .State.Health.Status` (`healthy`/`unhealthy`/`starting`/absent) | status |
| `stateStatus` | `/containers/{id}/json .State.Status` | status |

**Discovery filter**: only containers where `labels["homemedia.enable"] === "true"`
(case-insensitive value match on `true`/`1`/`yes`). Enforced in the API query
(`filters={"label":["homemedia.enable=true"]}`) **and** re-checked in code.

---

## 2. `LabelSet` — parsed `homemedia.*` labels

Parsed from `RawContainer.labels`. See
[contracts/label-contract.md](./contracts/label-contract.md) for the authoritative
table; summary:

| Key | Type | Default | Validation |
|---|---|---|---|
| `homemedia.enable` | boolean | — (required `true`) | `true`/`1`/`yes` (ci) → enabled; anything else → excluded |
| `homemedia.name` | string | de-slugified container name | trimmed; length-capped for layout (display truncates, value retained) |
| `homemedia.icon` | string (bundled id) | image-name guess → `generic` | must match a bundled icon id; unknown → `generic`, no fetch |
| `homemedia.category` | string | `"Services"` | trimmed; whitespace collapsed; grouping key = casefold |
| `homemedia.description` | string | `undefined` | trimmed; optional |
| `homemedia.url` | string | derived (see §3) | must parse as absolute `http(s)` URL |
| `homemedia.port` | integer | `undefined` | 1–65535 |
| `homemedia.order` | integer | `100` | any integer; invalid → `100` |
| `homemedia.lan_only` | boolean | `false` | `true`/`1`/`yes` (ci) → `true` |

Parsing rules:

- Unknown `homemedia.*` keys are ignored (forward-compatible).
- A malformed value falls back to the default and is **not** an error (the tile
  still renders); parsing notes are logged at debug level only (never labels'
  literal secret-like values — labels are not expected to hold secrets).

---

## 3. `ServiceProjection` — one dashboard tile

Derived from `RawContainer` + `LabelSet` + status mapping. Ephemeral; never stored.

| Field | Type | Derivation |
|---|---|---|
| `slug` | string | slugified `name`; stable per container name; used as list key + search |
| `name` | string | `LabelSet.name` |
| `iconId` | string | `LabelSet.icon` resolved against the bundled set, else `generic` |
| `category` | string | `LabelSet.category` (display casing = first occurrence) |
| `categoryKey` | string | casefold of `category` (grouping/dedupe) |
| `description` | string \| undefined | `LabelSet.description` |
| `href` | string \| null | see resolution below; `null` → "link unconfigured" (FR-018) |
| `lanOnly` | boolean | `LabelSet.lan_only` |
| `order` | integer | `LabelSet.order` |
| `status` | `'up' \| 'down' \| 'unknown'` | §4 |
| `statusLabel` | string | human text: "Running", "Not running", "Starting", "Status unavailable" |

**`href` resolution (first match wins):**

1. `LabelSet.url` present and a valid absolute `http(s)` URL → use it.
2. `LabelSet.port` present and a link-base host template is configured for the
   deployment → compose `<scheme>://<base-host>:<port>`.
3. Otherwise → `null` (tile shows "link unconfigured", not a guessed URL).

The link-base host template is deployment configuration (private); it never appears
in tracked files.

---

## 4. Status mapping (Docker state + healthcheck only)

Single pure function `deriveStatus(inspect | error) → { status, statusLabel }`.

| Condition | `status` | `statusLabel` |
|---|---|---|
| `Health.Status === 'healthy'` | `up` | "Running" |
| `Health.Status === 'unhealthy'` | `down` | "Not running" |
| `Health.Status === 'starting'` | `unknown` | "Starting" |
| no healthcheck & `State.Status === 'running'` | `up` | "Running" |
| no healthcheck & `State.Status` ∈ {`exited`,`dead`,`created`,`paused`,`restarting`} | `down` | "Not running" |
| discovery/inspect call failed, timed out, or proxy unreachable | `unknown` | "Status unavailable" |

Rules:

- Failure is **per whole read**: if the discovery call fails, the dashboard still
  renders every *previously known*? No — v1 has no persistence, so on a failed
  discovery call the dashboard shows a single top-level "status unavailable"
  notice and no tiles (there is nothing to list). If discovery succeeds but a
  per-container inspect fails, that service is `unknown`; others are unaffected
  (SC-009).
- No value is ever inferred from an HTTP probe of the service (FR-016).

---

## 5. `Category` — display grouping

| Field | Type | Derivation |
|---|---|---|
| `key` | string | `categoryKey` |
| `label` | string | first-seen display casing |
| `services` | `ServiceProjection[]` | members, sorted by `order` asc then `name` (locale, ci) |
| `order` | integer | min `order` among members (so categories sort predictably) |

Categories are sorted by `order` then `label`. Near-identical categories (case /
whitespace differences) collapse into one via `key` (edge case in spec).

---

## 6. `DashboardModel` — the SSR payload / `/api/services` body

```
{
  generatedAt: string (ISO 8601),
  sourceOk: boolean,            // false → discovery read failed
  categories: Category[],       // empty when sourceOk=false or no labelled services
  counts: { services: number, up: number, down: number, unknown: number }
}
```

Never includes any container that lacks `homemedia.enable=true`. Never includes raw
Docker fields, container ids, image names, or host/port internals beyond the
resolved `href`.

---

## 7. `SessionPayload` — stateless auth token

```
payload = { v: 1, sub: <username>, iat: <unix seconds>, exp: <iat + 2_592_000> }
token   = base64url(JSON.stringify(payload)) + "." + base64url(HMAC_SHA256(that, SESSION_SECRET))
```

| Field | Rule |
|---|---|
| `v` | schema version; only `1` accepted in v1 |
| `sub` | must equal configured `PORTAL_USERNAME` |
| `iat` | issue time |
| `exp` | exactly `iat + 2_592_000` (30 days); request rejected when `now >= exp` |
| signature | `crypto.timingSafeEqual`; mismatch → unauthenticated |

- Delivered as cookie `__Host-hmp_session` — `Secure; Path=/; HttpOnly; SameSite=Lax`,
  `Max-Age=2592000`, no `Domain`.
- **Rotation**: a new `SESSION_SECRET` changes every signature → all tokens fail →
  global forced re-auth (FR-028). No revocation list needed.
- No refresh/sliding window in v1: at 30 days the user re-authenticates (SC-014).

---

## 8. `RateLimitState` — in-memory, best-effort

```
Map<clientIp, { fails: number[] /* unix ms, last 15 min */, blockedUntil?: number }>
```

| Rule | Value |
|---|---|
| window | rolling 15 min |
| threshold | 5 failed attempts in window |
| on 6th | set `blockedUntil = now + 15 min`; refuse all attempts (even correct password) until then |
| on success (not blocked) | delete the entry |
| pruning | opportunistic on access + periodic timer sweep |
| scope | this process only; lost on restart; documented best-effort (FR-005) |

Client IP from `event.getClientAddress()` (honours `ADDRESS_HEADER` + `XFF_DEPTH`).

---

## 9. `RuntimeConfig` — validated at boot (`env.ts`)

| Name | Required | Validation | Notes |
|---|---|---|---|
| `PORTAL_USERNAME` | yes | non-empty | shared login name |
| `PORTAL_PASSWORD_ARGON2` | yes | parses as a PHC Argon2id string | never logged |
| `SESSION_SECRET` | yes | ≥ 32 bytes after decoding | never logged; rotate → global logout |
| `DOCKER_PROXY_URL` | yes | absolute `http(s)` URL | e.g. internal `http://host:2375` |
| `SERVICE_LINK_BASE` | no | host template if present | enables `homemedia.port` links |
| `ORIGIN` | yes (prod) | absolute `https` URL | adapter-node |
| `PROTOCOL_HEADER` / `HOST_HEADER` / `ADDRESS_HEADER` / `XFF_DEPTH` | recommended | adapter-node forwarded-header config |
| `BODY_SIZE_LIMIT` | no | default `64K` | |
| `PORT` / `HOST` | no | defaults `3000` / `0.0.0.0` | |

`env.ts` throws and the process exits non-zero if any required value is missing or
invalid — no silent defaulting of secrets.

---

## Entity relationships

```
RawContainer ─(parse labels)─> LabelSet ─┐
        │                                 ├─> ServiceProjection ─(group)─> Category ─> DashboardModel
        └─(inspect State/Health)──────────┘
SessionPayload  ── independent (auth) ──> gates access to DashboardModel
RateLimitState  ── independent (login) ──> gates POST /login
RuntimeConfig   ── read by all server modules at startup
```
