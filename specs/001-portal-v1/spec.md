# Feature Specification: Portal v1

**Feature Branch**: `001-portal-v1`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Portal v1 — a curated, mobile-first internal service
directory for one private home server, reached from a phone through an existing
HTTPS reverse proxy: a polished login, a long-lived session, a searchable grouped
dashboard of explicitly-labelled services with status from container state, a
health endpoint, and installability as a PWA."

## Overview

The home server runs a number of self-hosted services, each on its own address and
port. Reaching one today means remembering host-and-port. Portal v1 replaces that
with a single, polished, phone-first page: the owner signs in once, sees the
services they have chosen to expose — grouped and searchable, each showing whether
it is currently running — and taps through to any of them. The page installs to the
phone home screen like an app.

The portal shows **only** services the operator has deliberately marked for it. It
reads service state in a read-only way and never controls anything.

## Clarifications

### Session 2026-08-30

The ambiguity scan surfaced eight decision points. They were carried into the
specification pull-request review and the product owner has now decided them. They
are recorded here and folded into the affected requirements; the acceptance gate
below is unchanged.

- Q: Does the HTTPS reverse-proxy route to the portal exist, and should this
  project provision it? → A: Intended architecture uses the **existing estate
  HTTPS reverse proxy**. Its route to the portal stays an **unverified external
  acceptance gate** — verify before accepting external access. If absent, do **not**
  provision or alter it here; stop deployment and report the blocker.
- Q: What hostname will serve the portal? → A: A **`home.` subdomain of the
  established estate domain**. The exact FQDN is stored only in untracked
  `PRIVATE-CONTEXT.md`, never in the public repository.
- Q: What happens when a LAN-only destination is opened from outside the home
  network? → A: The tile is **visibly marked "LAN only"**; it must not fail
  silently. The portal does not provide remote access to that destination.
- Q: What is the exact session lifetime? → A: **Exactly 30 days.**
- Q: What happens to existing sessions when the session signing secret is rotated?
  → A: Rotation **forces re-authentication for all existing sessions**.
- Q: What is the login throttle policy? → A: **Five failed attempts per client in a
  rolling 15-minute window, then refuse further attempts for a 15-minute cool-off.**
  Best-effort application protection, not a substitute for any future edge
  protection.
- Q: Is one shared household password sufficient for Portal v1? → A: **Yes**,
  subject to the HTTPS + login/authentication requirements already specified.
  Per-user accounts remain out of scope.
- Q: Which icon set is bundled, and how is licensing handled? → A: A **locally
  bundled subset of Dashboard Icons**. The Plan phase must verify its current
  licence and include the required attribution/licence notice. **No icon is fetched
  at runtime.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a service from my phone (Priority: P1)

An authenticated household member opens the portal on their phone, scans or
searches the list of services, sees which are up, and taps one to open it.

**Why this priority**: This is the product's entire reason to exist. If only this
works (assuming a session), the portal already replaces "remember the host and
port".

**Independent Test**: With a valid session, load the dashboard on a phone-sized
screen; confirm every owner-labelled service appears in its category with a status
indicator; tap a tile and confirm the configured destination opens.

**Acceptance Scenarios**:

1. **Given** an authenticated user on a phone, **When** they open the portal,
   **Then** they see the owner-selected services grouped by category, each with a
   name, icon, and current status, within one screen of scrolling for a typical
   set.
2. **Given** the dashboard is open, **When** the user types part of a service name
   into search, **Then** the list narrows to matching services as they type.
3. **Given** a service tile, **When** the user taps it, **Then** the service's
   configured destination opens (in a new tab/view), and the portal remains open.
4. **Given** a service whose container is stopped, **When** the dashboard loads,
   **Then** that service is shown with a clearly distinct "not running" status and
   is still listed (not hidden).
5. **Given** a container with no `homemedia.enable=true` label, **When** the
   dashboard loads, **Then** that service never appears anywhere in the UI or its
   data.

---

### User Story 2 - Sign in once and stay signed in (Priority: P1)

A household member reaches the portal's hostname over HTTPS, is presented with a
polished mobile login, signs in, and is not asked again for 30 days.

**Why this priority**: Nothing in the portal is usable without authentication, and
a login that nags on every visit would kill everyday use on a phone.

**Independent Test**: Visit the portal URL unauthenticated; confirm redirect to a
styled login; submit a wrong password and confirm a generic failure plus
throttling after repeated attempts; submit the correct password and confirm access;
close and reopen the browser/app days later and confirm no re-prompt; use logout
and confirm the session ends.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** they request any portal page,
   **Then** they are shown a mobile-first login screen consistent with the
   portal's visual style, and no service information is revealed before login.
2. **Given** the login screen, **When** the user submits an incorrect password,
   **Then** they see a single generic "invalid credentials" message that does not
   indicate which field was wrong and does not reveal whether the username exists.
3. **Given** five failed attempts from the same client within a rolling 15-minute
   window, **When** a sixth is made, **Then** it is refused and further attempts
   stay refused for a 15-minute cool-off.
4. **Given** a successful login, **When** the user returns any time within 30 days
   without logging out, **Then** they are still authenticated; on day 31 they are
   asked to log in again.
5. **Given** an authenticated session, **When** the user chooses logout, **Then**
   the session is invalidated and the next request returns them to the login
   screen.
6. **Given** existing valid sessions, **When** the operator rotates the session
   signing secret, **Then** every existing session is invalidated and each user is
   asked to log in again.

---

### User Story 3 - Install the portal to my home screen (Priority: P2)

A household member adds the portal to their phone's home screen and launches it
like a native app.

**Why this priority**: Raises everyday convenience and perceived quality
significantly, but the portal is fully usable in a browser tab without it.

**Independent Test**: On a mobile browser, confirm the "install"/"add to home
screen" affordance is offered; install it; launch from the home screen and confirm
it opens standalone (no browser chrome) with its own name and icon.

**Acceptance Scenarios**:

1. **Given** the portal open in a supported mobile browser, **When** the user
   invokes "add to home screen", **Then** it installs with a dedicated name and
   icon.
2. **Given** the installed app, **When** launched from the home screen, **Then** it
   opens in standalone display.
3. **Given** the installed app is offline, **When** it is launched, **Then** only
   the static shell may appear from cache; no stale service list, status, or
   authenticated content is shown from cache.

---

### User Story 4 - Curate what appears, without a rebuild (Priority: P2)

The operator marks a service for the portal and controls how it is presented by
setting labels on that service; the change takes effect after the normal
apply/restart, with no portal rebuild.

**Why this priority**: Keeps the menu correct over time and is how the "curated"
promise is kept, but the initial set can ship hard-labelled.

**Independent Test**: Add `homemedia.enable=true` plus presentation labels to a
service, apply per the server's normal process, reload the portal, and confirm the
tile appears with the specified name, icon, category, description, link target, and
ordering.

**Acceptance Scenarios**:

1. **Given** a service with `homemedia.enable=true`, **When** the portal refreshes,
   **Then** the service appears using its label-provided name, icon, category,
   description, destination, and sort order, with sensible defaults for any label
   omitted.
2. **Given** a service whose `homemedia.enable` is removed or set false, **When**
   the portal refreshes, **Then** the tile disappears.
3. **Given** an `icon` label value that is not a known bundled icon, **When** the
   portal refreshes, **Then** a generic fallback icon is used and nothing external
   is fetched.

---

### User Story 5 - Confirm the portal is healthy (Priority: P3)

An internal proxy or container runtime checks a health endpoint to confirm the
portal process is serving.

**Why this priority**: Needed for clean operations and automated restart, but not
part of the human-facing experience.

**Independent Test**: Request the health endpoint without credentials and confirm a
success response when the portal is serving.

**Acceptance Scenarios**:

1. **Given** the portal is running, **When** the health endpoint is requested with
   no authentication, **Then** it returns a success status.
2. **Given** the portal cannot serve requests, **When** the health endpoint is
   requested, **Then** it does not return success.
3. **Given** the health endpoint, **When** it responds, **Then** it discloses no
   service inventory or session information.

### Edge Cases

- **Docker information source unavailable**: the portal cannot read container
  state — it presents an explicit "status unavailable" state rather than implying
  everything is down or hiding services.
- **A labelled service exposes several ports / no obvious port**: presentation
  falls back to an explicit label value; if still ambiguous the tile indicates the
  link is unconfigured rather than guessing.
- **Session cookie present but invalid or expired**: treated as unauthenticated;
  user is returned to login without an error dump.
- **LAN-only destination opened from outside the home network**: the tile carries a
  visible "LAN only" marker; opening it may not connect, and the portal offers no
  remote path to it — this is expected, not an error state to hide.
- **Duplicate categories with different casing / whitespace**: normalised so a
  service is not split across near-identical groups.
- **Very long service or category names**: truncated for layout without breaking
  one-handed use.
- **Search with no matches**: an explicit empty state, not a blank screen.
- **Reduced-motion preference set**: all non-essential animation is disabled.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & session**

- **FR-001**: The portal MUST require authentication before revealing any service
  information or any page other than the login screen and the health endpoint.
- **FR-002**: The portal MUST present a mobile-first login screen visually
  consistent with the rest of the portal.
- **FR-003**: The portal MUST authenticate against a single configured credential
  supplied at runtime, verified against an Argon2id hash; the plaintext MUST NOT
  exist anywhere in the repository, build, or image.
- **FR-004**: On any authentication failure the portal MUST return one generic
  message that does not distinguish "unknown user" from "wrong password" and does
  not indicate which field failed.
- **FR-005**: The portal MUST allow at most five failed authentication attempts per
  client within a rolling 15-minute window; once exceeded it MUST refuse further
  attempts from that client for a 15-minute cool-off. This is best-effort
  application-level protection and is not represented as a substitute for any
  future edge/proxy protection.
- **FR-006**: A successful login MUST establish a session that persists across
  browser and device restarts for exactly 30 days, after which the user MUST
  re-authenticate.
- **FR-007**: The portal MUST provide an explicit logout that ends the current
  session.
- **FR-008**: The session mechanism MUST be a browser cookie using the `__Host-`
  prefix with `Secure`, `HttpOnly`, and a `SameSite` policy set; it MUST be
  validated (integrity + expiry) on every request.
- **FR-028**: Rotating the session signing secret MUST invalidate all existing
  sessions, forcing every user to re-authenticate.

**Service discovery & curation**

- **FR-009**: The portal MUST display a service if and only if its container
  carries the label `homemedia.enable=true`.
- **FR-010**: The portal MUST NOT display, list, count, or otherwise reveal
  services that are not so labelled, in any view or API response.
- **FR-011**: The portal MUST read the following optional per-service labels and
  apply them to presentation, with documented defaults when absent:
  `homemedia.name`, `homemedia.icon` (a bundled icon identifier only),
  `homemedia.category`, `homemedia.description`, `homemedia.url` and/or
  `homemedia.port` (link destination), `homemedia.order` (sort weight), and
  `homemedia.lan_only` (marks the destination as reachable only on the home
  network).
- **FR-012**: The portal MUST resolve icons only from a locally bundled subset of
  Dashboard Icons; an unknown or malformed `homemedia.icon` value MUST fall back to
  a generic icon. No icon MUST be fetched at runtime from any external source. The
  Plan phase MUST verify the Dashboard Icons licence in force at build time and
  include the required attribution/licence notice with the bundled assets.
- **FR-013**: Changes to these labels MUST take effect on the next portal data
  refresh after the service is re-applied, with no rebuild or redeploy of the
  portal.

**Dashboard, status & navigation**

- **FR-014**: The portal MUST group services by category and MUST provide a
  text search/filter over service names (and description where present).
- **FR-015**: The portal MUST show each service's current status derived **only**
  from container state and container healthcheck results, with at minimum the
  distinct states: running/healthy, not running, and status-unavailable.
- **FR-016**: The portal MUST NOT perform HTTP or uptime probing of services and
  MUST NOT poll in the background or stream status in v1; status reflects the state
  at page load, refreshable by an explicit user action.
- **FR-017**: Each service tile MUST link to that service's configured destination
  and MUST open it without navigating the portal away from itself.
- **FR-018**: When a service's link destination cannot be determined, the tile MUST
  indicate the link is unconfigured rather than opening an incorrect location.
- **FR-029**: A service whose destination is reachable only on the home network
  MUST be shown with a visible "LAN only" marker. The portal MUST NOT attempt to
  proxy, tunnel, or otherwise provide remote access to such a destination; it only
  links to it.

**Presentation & accessibility**

- **FR-019**: The interface MUST be designed mobile-first and be fully operable
  one-handed on a small phone screen, with primary actions reachable and touch
  targets at least 44×44 CSS pixels.
- **FR-020**: The visual style MUST be a polished, dark "control-room" aesthetic
  achieved with CSS only (no WebGL, no parallax).
- **FR-021**: The interface MUST meet WCAG 2.1 AA colour-contrast for text and
  essential UI, and MUST be navigable and labelled for assistive technology.
- **FR-022**: The interface MUST honour the user's reduced-motion preference by
  disabling non-essential animation.

**PWA**

- **FR-023**: The portal MUST be installable as a PWA with a dedicated name and
  icon and MUST launch in standalone display.
- **FR-024**: Offline/precache behaviour MUST be limited to static build assets.
  Service data, API responses, authentication routes, and authenticated HTML MUST
  NEVER be cached.

**Operations**

- **FR-025**: The portal MUST expose an unauthenticated health endpoint that
  returns success only while the portal can serve requests and that reveals no
  service inventory or session data.
- **FR-026**: The portal MUST obtain container information only through a read-only,
  digest-pinned Docker socket proxy and MUST have no capability to create, modify,
  start, stop, or remove any container, image, volume, or network.
- **FR-027**: The portal MUST NOT log secrets, session tokens, or full credentials.

### Key Entities

- **Service (portal projection)**: a single labelled container as the portal
  presents it — display name, icon id, category, optional description, link
  destination, sort order, and current status. Derived at read time; the portal
  stores none of it persistently.
- **Category**: a display grouping derived from `homemedia.category` values
  (normalised); ordering by service `homemedia.order` then name.
- **Session**: proof that the single shared credential was presented; represented
  only as a signed, expiring browser cookie; no server-side session store in v1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From launching the installed app with a valid session, a user can
  open any listed service in at most two taps.
- **SC-002**: A logged-in user is not asked to authenticate again for at least 30
  days of normal use without logging out.
- **SC-003**: 100% of services shown are services the operator labelled for the
  portal; a service without the enable label appears in 0 views and 0 API
  responses.
- **SC-004**: A first-time user can find and open a specific named service in under
  15 seconds without instruction.
- **SC-005**: The dashboard is fully operable one-handed on a 360 px-wide viewport
  with no horizontal scrolling.
- **SC-006**: All text and essential controls meet WCAG 2.1 AA contrast; all
  interactive targets are ≥44×44 px.
- **SC-007**: With reduced-motion enabled, no non-essential animation plays.
- **SC-008**: The portal passes standard mobile "installable PWA" checks.
- **SC-009**: When the container-state source is unavailable, the portal still
  lists every labelled service and shows a status-unavailable state (it never
  shows a false "all down" or hides services).
- **SC-010**: Stopping a labelled service is reflected as "not running" after an
  explicit refresh of the dashboard.
- **SC-011**: A wrong-password attempt returns a generic failure; a sixth failed
  attempt from one client within 15 minutes is refused, and attempts stay refused
  for a 15-minute cool-off.
- **SC-012**: Every service labelled `homemedia.lan_only` shows a visible "LAN
  only" marker on its tile.
- **SC-013**: After the operator rotates the session signing secret, every
  previously logged-in user is required to log in again on their next visit.
- **SC-014**: A logged-in session stops being accepted exactly 30 days after login
  (not sooner, not later) absent logout or secret rotation.

## Dependencies & Acceptance Gate

- **External dependency (unverified):** external access depends on the existing,
  separately operated estate HTTPS reverse proxy routing a `home.` subdomain of the
  estate domain to the portal's private origin and forwarding the standard
  forwarded-for / forwarded-proto / forwarded-host headers. The server runbook
  currently lists a reverse proxy as a not-yet-done item, so this route is treated
  as not yet present until proven.
- **This project does not provision it.** If the route is absent, this project MUST
  NOT create or modify the reverse proxy, DNS, or any network path. Deployment for
  external use stops and the blocker is reported to the product owner.
- **Acceptance gate:** external access MUST NOT be accepted as working until the
  route is confirmed end-to-end (HTTPS `home.` hostname → portal login) with correct
  forwarded headers. Portal design, build, and local verification may proceed in
  parallel; this gate is a dependency, not an assumption, and is not listed under
  Assumptions.

## Assumptions

- The portal's private origin address remains stable for the life of a deployment.
  It is currently a dynamic lease rather than a reservation; making it a
  reservation is a server-operations task tracked in the server runbook, outside
  this project.
- Household members reach service destinations from their phones over the home
  network or an existing remote-access path; the portal does not provide remote
  access to the services themselves (LAN-only destinations are marked as such — see
  FR-029).
- The exact portal FQDN (a `home.` subdomain of the estate domain) and the v1
  service inventory are recorded only in the operator's untracked private notes,
  not in this public specification.
- Icons are shipped bundled with the portal (a subset of Dashboard Icons); no icon
  is fetched from a third party at runtime.

## Out of Scope (v1 Non-Goals)

- HTTP or uptime probing of services; background polling; live status streaming.
- WebGL, parallax, or other heavy visual effects.
- Google / OAuth / SSO / per-user accounts or per-user views.
- Editing labels, configuration, or Docker objects from the portal UI.
- Any create/start/stop/restart/delete capability over containers.
- Discovering or surfacing unlabelled services.
- Multi-host or multi-server support.
- Standing up, configuring, or changing the reverse proxy, DNS, firewall, router,
  or VPN.
- **Any API key or programmatic ("AI-control") API.**

### Deferred: future programmatic API

If a programmatic API is ever wanted, it MUST be specified as its own feature and
MUST: use per-client tokens that can be revoked independently; be scoped narrowly
to named read operations; and NEVER provide generic shell/command execution,
Docker mutation, or raw Docker socket access.

## Product-Owner Decisions (recorded 2026-08-30)

All prior open questions are resolved; details and the exact wording are in
**Clarifications** and folded into the requirements above. Summary:

| # | Decision |
|---|----------|
| 1 | Use the existing estate HTTPS reverse proxy. Its route to the portal is an **unverified acceptance gate**; if absent, this project does not provision it — deployment stops and the blocker is reported. |
| 2 | Hostname is a **`home.` subdomain of the estate domain**; exact FQDN only in untracked `PRIVATE-CONTEXT.md`. |
| 3 | LAN-only tiles are **visibly marked "LAN only"** (FR-029); no silent failure, no remote access provided. |
| 4 | Session lifetime is **exactly 30 days** (FR-006). |
| 5 | Rotating the session signing secret **forces re-authentication for all sessions** (FR-028). |
| 6 | Login throttle: **5 failures / rolling 15 min / client, then 15-min cool-off** (FR-005); best-effort, not a substitute for edge protection. |
| 7 | **One shared household password** is sufficient for v1; per-user accounts remain out of scope. |
| 8 | Icons are a **locally bundled subset of Dashboard Icons** (FR-012); the Plan phase verifies the licence and adds the required attribution; no runtime fetch. |

No open questions remain for Portal v1. The reverse-proxy route stays an external
acceptance gate to be verified before external access is accepted.
