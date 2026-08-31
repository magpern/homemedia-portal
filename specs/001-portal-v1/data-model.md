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
| `homemedia.url` | string | derived (see §3) | absolute `http`/`https` URL; complete explicit destination, always wins over `port` |
| `homemedia.port` | integer | `undefined` | 1–65535; builds an **`http://`-only** link with `SERVICE_LINK_BASE` (never HTTPS — use `url` for that) |
| `homemedia.order` | integer | `100` | any integer; invalid → `100` |
| `homemedia.lan_only` | boolean | `false` | `true`/`1`/`yes` (ci) → `true` |
| `homemedia.placement` *(feature 002)* | enum `home`\|`manage` | `manage` | casefold; `home` → `home`; anything else → `manage` |
| `homemedia.home_label` *(feature 002)* | string | `null` | trimmed; used only when `placement=home`; primary-card title = `home_label` ?? `name` |

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

**`href` resolution (first match wins)** — product-owner decision 2026-08-30:

1. `LabelSet.url` present and a valid absolute `http`/`https` URL → use it
   verbatim. This is the complete explicit destination and always takes
   precedence. **Any non-default scheme (HTTPS, or anything other than plain
   `http`) requires this label** — it is never inferred.
2. `LabelSet.port` present (and no valid `url`) and the private `SERVICE_LINK_BASE`
   is configured → build **`http://<SERVICE_LINK_BASE>:<port>`** — always plain
   `http`. TLS is never guessed; a service reached over HTTPS must set
   `homemedia.url`.
3. Otherwise → `null` (tile shows "link unconfigured", not a guessed URL).

`SERVICE_LINK_BASE` is deployment configuration held only in untracked private
operator notes; it (and the resulting host/port) never appears in tracked files.

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
| **this container's** inspect call failed or timed out | `unknown` | "Status unavailable" |

### Failure modes (product-owner decision 2026-08-30, spec FR-030)

Two clearly separated cases:

1. **Discovery succeeded; one or more inspects / status derivations failed.**
   `sourceOk = true`. Every discovered labelled service is listed. Services whose
   state could not be determined show `status = 'unknown'` / "Status unavailable";
   the rest show their real status. (spec FR-030, SC-009)
2. **Discovery itself failed (or the proxy was unreachable / timed out on the
   list call).** `sourceOk = false`. `categories = []`, all `counts` zero. The UI
   renders an explicit "service directory is currently unavailable" state. The
   portal MUST NOT fabricate, cache, or retain a service list — v1 has no
   persistence, so there is simply nothing to show. (spec FR-030, SC-015)

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
  sourceOk: boolean,            // false ONLY when labelled-service DISCOVERY failed
  categories: Category[],       // [] when sourceOk=false, or when no labelled services exist
  counts: { services: number, up: number, down: number, unknown: number }
}
```

- `sourceOk = false` means **discovery failed** → no list is produced (case 2
  above). A failed *per-container* inspect does **not** set `sourceOk = false`; it
  only makes that one service `unknown` (case 1).
- `counts.unknown` includes services in case 1 whose status could not be derived.
- Never includes any container that lacks `homemedia.enable=true`. Never includes
  raw Docker fields, container ids, image names, or host/port internals beyond the
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
| `DOCKER_PROXY_URL` | yes | absolute `http(s)` URL | internal-network URL of the socket-proxy; concrete value in operator notes only |
| `SERVICE_LINK_BASE` | no | host (no scheme, no port) if present | with `homemedia.port` builds `http://<SERVICE_LINK_BASE>:<port>` — `http` only (§3); value stays in private operator notes |
| `ORIGIN` | yes (prod) | absolute `https` URL | adapter-node; local test = a local `https://` origin (research R11) |
| `PROTOCOL_HEADER` / `HOST_HEADER` / `ADDRESS_HEADER` / `XFF_DEPTH` | recommended | adapter-node forwarded-header config |
| `BODY_SIZE_LIMIT` | no | small default | |
| `PORT` / `HOST` | no | adapter-node defaults (loopback-testable) | concrete values in operator notes only |

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
