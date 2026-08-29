# Docker Read Contract: Portal v1

The portal reads container state **only** through a `docker-socket-proxy`
(digest-pinned). It never connects to the Docker socket directly and never issues a
non-`GET` request. This contract is normative and testable.

---

## Calls the portal makes

All against `${DOCKER_PROXY_URL}` (an internal-network `http://` URL; concrete
host/port is deployment config, not recorded here), `GET` only.

### 1. Discovery

```
GET /containers/json?all=1&filters={"label":["homemedia.enable=true"]}
```

- `all=1` so stopped containers are included (they must still be listed, SC-010).
- `filters` label-scopes the result server-side; code **also** re-checks
  `Labels["homemedia.enable"]` truthiness (defence in depth for Constitution V).

Fields read per element: `Id`, `Names`, `Image`, `State`, `Labels`.

### 2. Status (per discovered container)

```
GET /containers/{id}/json
```

Fields read: `State.Status`, `State.Health.Status` (absent when the container
defines no healthcheck). Nothing else is consumed.

### Timeouts and failure modes (spec FR-030)

- Short per-call timeout and an overall dashboard-load budget (concrete values are
  an implementation tuning detail); the response never blocks beyond the budget.
- **Discovery call (step 1) fails, times out, non-2xx, or proxy unreachable** →
  `sourceOk = false`. The portal returns **no service list** and the UI shows an
  explicit "directory unavailable" state. Nothing is fabricated, cached, or
  retained. (SC-015)
- **Discovery succeeds but a step-2 inspect fails/times out for a container** →
  `sourceOk = true`; that one service is `status = 'unknown'` ("Status
  unavailable"); all other discovered services are listed with their real status.
  (SC-009)

### Not used

`/containers/{id}/stats`, `/containers/{id}/logs`, `/events`, `/images/*`,
`/networks/*`, `/volumes/*`, `/exec/*`, `/version`, `/info`, `/_ping` — the portal
issues none of these. No `POST`, `PUT`, `DELETE`, or `HEAD` to any path.

---

## Required `docker-socket-proxy` configuration

| Env | Value | Why |
|---|---|---|
| `CONTAINERS` | `1` | enables `GET /containers/json` and `GET /containers/{id}/json` |
| `POST` | `0` | explicit; only `GET`/`HEAD` reach the daemon — the API becomes read-only |
| `IMAGES`, `NETWORKS`, `VOLUMES`, `EXEC`, `BUILD`, `COMMIT`, `SERVICES`, `TASKS`, `SWARM`, `NODES`, `SECRETS`, `CONFIGS`, `AUTH`, `SYSTEM`, `PLUGINS`, `DISTRIBUTION`, `SESSION`, `GRPC`, `ALLOW_START`, `ALLOW_STOP`, `ALLOW_RESTARTS`, `ALLOW_PAUSE`, `ALLOW_UNPAUSE` | `0` (default) | not needed; keep denied |
| `EVENTS`, `VERSION` | `0` (override the default `1`) | portal does not use them |
| `PING` | `1` (default) | used only for the proxy container's own healthcheck |

Proxy container hardening: `read_only: true`, `security_opt: [no-new-privileges:true]`,
`cap_drop: [ALL]`, no published host ports, dedicated internal network shared only
with the portal, raw Docker socket bind-mounted **only** here.

---

## Assertions (verified by tests — see [../quickstart.md](../quickstart.md))

1. The portal source contains **no** code path issuing a Docker request with a
   method other than `GET`.
2. With the proxy configured as above, a manual `POST`/`start`/`stop`/`exec`
   attempt through the proxy returns `403`.
3. Removing `homemedia.enable=true` from a container removes it from
   `GET /containers/json?filters=…` and from the portal on next load — and the
   portal never calls any endpoint that would reveal it.
4. Stopping the proxy (or pointing `DOCKER_PROXY_URL` at nothing) makes the
   dashboard render the explicit "directory unavailable" state (no list) within the
   load budget, with no crash and no leak (SC-015).
5. Failing only the per-container inspects (proxy up, `CONTAINERS` list works,
   inspect returns errors) makes the dashboard list every discovered service with
   status "Status unavailable" (SC-009).
