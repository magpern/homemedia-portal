# Phase 1 Contracts: Portal v1

Portal v1 is an **internal, single-tenant web application**. It exposes **no public
API** and no programmatic interface for other systems (Constitution XI). The
"contracts" here are:

| File | What it fixes |
|---|---|
| [http-routes.md](./http-routes.md) | Every browser route + the two machine endpoints (`/api/services`, `/healthz`): method, auth, request, response, status codes, headers, cache-control. |
| [label-contract.md](./label-contract.md) | The `homemedia.*` container-label vocabulary the operator uses to curate the dashboard — names, types, defaults, normalisation. This is the portal's real configuration surface. |
| [docker-api-contract.md](./docker-api-contract.md) | The exact Docker Engine API calls the portal makes through the socket-proxy, the fields it reads, and the socket-proxy permission set. Asserts zero mutation capability. |

## Authorization matrix

| Route | Auth required | Reveals labelled-service data? | Notes |
|---|---|---|---|
| `GET /healthz` | no | no | liveness only; no inventory, no session info |
| static assets (`/_app/*`, `/icons/*`, `/manifest.webmanifest`, service worker, `/robots.txt`, favicon) | no | no | content-hashed build output + `static/` |
| `GET /login` | no | no | renders login; if already authed → 302 `/` |
| `POST /login` | no (rate-limited) | no | form action; generic failure; sets session cookie on success |
| `POST /logout` | valid session | no | form action, CSRF-checked; clears cookie |
| `GET /` | valid session → else 302 `/login` | yes (SSR dashboard) | never lists non-labelled containers |
| `GET /api/services` | valid session → else 401 | yes (JSON `DashboardModel`) | `Cache-Control: no-store`; manual-refresh only |

**Invariant (Constitution V):** no route, in any response body, header, error page,
or empty state, discloses the existence of a container that lacks
`homemedia.enable=true`.

## Cross-cutting response rules

- All HTML and both machine endpoints: `Cache-Control: no-store` except the static
  asset routes (immutable, long-lived) — enforced in `hooks.server.ts`.
- Security headers on every response: a strict `Content-Security-Policy`
  (`default-src 'self'`; no third-party origins; no `unsafe-inline` scripts —
  SvelteKit nonces/hashes), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` /
  `frame-ancestors 'none'`, `Permissions-Policy` minimal.
- No response includes a `Server`/framework version banner beyond what Node emits
  by default (documented; not a hard requirement).
