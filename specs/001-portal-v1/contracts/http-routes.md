# HTTP Route Contract: Portal v1

Base origin is the deployment's configured HTTPS origin (value private). All paths
are relative to it. Behaviour below is normative for implementation and tests.

---

## `GET /healthz`

- **Auth**: none.
- **Request**: no body, no required headers.
- **Response 200** `application/json`: `{"status":"ok"}` — returned only while the
  HTTP server is up and the app booted (env validated). No other fields.
- **Response 503**: if the app is running but not ready to serve (should be rare;
  process usually just not listening).
- **Headers**: `Cache-Control: no-store`.
- **MUST NOT**: include service inventory, counts, container ids, versions, session
  state, or environment values. (FR-025, SC "health discloses nothing".)

---

## `GET /login`

- **Auth**: none.
- **Behaviour**: if the request carries a valid session cookie → `302` to `/`.
  Otherwise render the mobile-first login page (single password field + submit;
  `PORTAL_USERNAME` may be a hidden/prefilled field or fixed).
- **Headers**: `Cache-Control: no-store`.

## `POST /login`  (SvelteKit form action)

- **Auth**: none; **rate-limited** per client IP (5 fails / rolling 15 min → 15 min
  block; see [../data-model.md](../data-model.md) §8).
- **Content type**: `application/x-www-form-urlencoded` (CSRF-checked by SvelteKit
  against `ORIGIN`).
- **Request fields**: `password` (required); `username` if the form includes it.
- **On success**: set `Set-Cookie: __Host-hmp_session=<token>; Secure; Path=/;
  HttpOnly; SameSite=Lax; Max-Age=2592000`; redirect `303` to `/` (or to a safe,
  same-origin `redirectTo` form value if present).
- **On failure (bad credentials)**: `200` re-render with a single generic message
  ("Invalid credentials"). No field-level detail, no "unknown user" vs "wrong
  password" distinction. Constant-time verify path (real or dummy hash).
- **On throttle**: `429` with a generic "Too many attempts, try again later"
  message; no countdown that leaks precise timing beyond "later".
- **Headers**: `Cache-Control: no-store`.

---

## `POST /logout`  (SvelteKit form action)

- **Auth**: valid session required; CSRF-checked.
- **Behaviour**: clear the cookie
  (`Set-Cookie: __Host-hmp_session=; Max-Age=0; Secure; Path=/; HttpOnly; SameSite=Lax`),
  redirect `303` to `/login`.
- **GET /logout**: not supported (`405`); logout must be a POST.

---

## `GET /`  (dashboard, SSR)

- **Auth**: valid session; otherwise `302` to `/login?redirectTo=/`.
- **Behaviour**: server `load` performs the Docker read (discovery + per-container
  status) within the time budget, builds `DashboardModel`
  ([../data-model.md](../data-model.md) §6), renders:
  - search field, category sections, service cards (name, icon, status dot with
    text, description, "LAN only" badge where `lanOnly`), each card an `<a>` to
    `href` opening in a new browsing context; cards with `href === null` render as
    non-links marked "link unconfigured".
  - a service whose status could not be derived (discovery succeeded, its inspect
    failed) is **still listed**, with the status shown as "Status unavailable"
    (spec FR-030, SC-009).
  - states (spec FR-030):
    - **no labelled services exist** → friendly "nothing here yet" copy that does
      not name or count non-labelled containers.
    - **`sourceOk === false`** (labelled-service discovery itself failed) → an
      explicit "The service directory is currently unavailable" state, **no service
      list at all**; nothing fabricated, cached, or retained (SC-015).
- **Headers**: `Cache-Control: no-store`; CSP + security headers.
- **MUST**: exclude every container without `homemedia.enable=true` from markup and
  embedded data (no hidden `<script>` payload leak).

---

## `GET /api/services`

- **Auth**: valid session; otherwise `401` `application/json` `{"error":"unauthorized"}`
  (no redirect; this is a fetch endpoint).
- **Purpose**: let the open dashboard refresh its data on an explicit user action
  (a "refresh" control) without a full navigation. **Not polled**; the client makes
  this call only in response to a user gesture (FR-016).
- **Response 200** `application/json`: the `DashboardModel` object. When discovery
  succeeded, `sourceOk:true` and every discovered labelled service appears; any
  whose status could not be derived carry `status:"unknown"` (SC-009).
- **Response 200 with `sourceOk:false`**: labelled-service **discovery** failed;
  `categories: []`, `counts` all zero. HTTP is still 200 (the portal is fine; the
  source is not). No list is fabricated, cached, or retained (SC-015).
- **Headers**: `Cache-Control: no-store`.
- **MUST NOT**: be cached by the service worker; MUST NOT include non-labelled
  containers or raw Docker fields.

---

## Static assets

- `GET /_app/immutable/*` — content-hashed; `Cache-Control: public, max-age=31536000,
  immutable`.
- `GET /manifest.webmanifest`, `/icons/*`, `/robots.txt`, favicon, `/service-worker.js`
  — served from `static/` / build; cacheable; no auth; contain no service data.
- `robots.txt` disallows all crawling.

---

## Status-code summary

| Situation | Code |
|---|---|
| healthy liveness | 200 |
| unauth HTML route | 302 → `/login` |
| unauth `GET /api/services` | 401 |
| bad credentials | 200 (re-render) |
| throttled login | 429 |
| successful login / logout | 303 |
| `GET /logout` | 405 |
| unknown route | 404 (generic; no inventory) |
| unhandled server error | 500 (generic; no stack, no env, no inventory) |
