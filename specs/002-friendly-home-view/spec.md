# Feature Specification: Friendly Home View

**Feature Branch**: `002-friendly-home-view`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "A friendly home view for the portal. The current portal is
technically correct but feels like an operations dashboard. The new experience should feel
like a small, friendly household media hub: a human-facing title ('Home media'); a default
landing view showing only the two main household actions (watch the library; find/request
something to watch); all technical or administrative services in a collapsed 'Manage media'
section; a short plain-language description for every service driven by its labels; a
locally bundled, licence-compliant subset of service-specific icons; status kept available
but visually secondary; the LAN-only information kept but presented quietly. Preserve
mobile-first accessibility, existing search, security, Docker isolation, auth, static-only
PWA caching, and public-repository disclosure rules. Do not add favourites, hide/show
preferences, local persistence, preference cookies, a database, an API, or individual
accounts — those are deferred."

## Overview

Portal v1 (feature `001-portal-v1`) delivers a correct, curated, mobile-first directory:
every opted-in service is rendered flat, grouped into uppercase category sections, with a
status indicator on each tile and a refresh control at the top. It works, but it presents
like a control room. A household member who just wants to put something on the television
has to read past indexers, download clients, and container-management tools to find it.

Friendly Home View re-shapes the **same data and the same guarantees** into a household
media hub:

- The product presents itself as **"Home media"**.
- The default authenticated landing view shows **only the primary household actions** —
  normally two: open the media library to watch, and open the request/discovery service to
  ask for something new — as large, plainly-labelled cards.
- Everything an operator uses to keep the system running is moved into a single
  **"Manage media"** section that is **collapsed by default** and expandable.
- **Every** service — in either place — shows a short, plain-language description.
- Service tiles use **service-specific icons** from the existing locally-bundled set
  instead of a generic glyph.
- Status and the "LAN only" marker remain present and accurate, but visually secondary.

Nothing about authentication, the read-only Docker discovery model, opt-in visibility,
status derivation, the health endpoint, the security headers, or the static-only PWA cache
changes. No data is stored. No new per-person state, preference, account, or programmatic
interface is introduced.

## Clarifications

### Session 2026-08-31

- Q: How does the landing view decide which services are the primary household actions?
  → A: **A new opt-in label plus a fallback.** The operator marks a service with
  `homemedia.placement=home`; those services become the large landing cards and everything
  else is placed in the collapsed "Manage media" section. If **no** service is marked
  `home`, the landing view falls back to the existing Portal v1 grouped dashboard
  unchanged. This keeps the explicit-opt-in, label-driven model and gives a clean,
  deterministic fallback and rollback path.
- Q: Does a service placed on the home view also appear inside the collapsed "Manage
  media" list? → A: **Home only.** A `placement=home` service renders solely as a large
  landing card, never duplicated into "Manage media". It stays fully searchable, and a
  search match still reveals and scrolls to it.
- Q: Is the plain-language description a new label, or the existing one? → A: **The
  existing `homemedia.description`**, made effectively required in normal operation, with a
  new deterministic fallback (see FR-105) used only as a safety net for a malformed,
  blank, or not-yet-labelled service.
- Q: What is the exact mobile acceptance viewport and no-scroll condition? → A:
  **360 × 780 px.** For the normal two-primary-action case, **both complete primary action
  cards MUST be fully visible without vertical scrolling** at that viewport (each card
  whole, not merely its top edge).
- Q: Is the friendly identity purely visual, or does it change the installed app name?
  → A: **It changes the installed identity too.** The visible title, the document title,
  and the PWA manifest `name` / `short_name` all become the friendly identity. The PWA
  **caching policy is unchanged** — only the manifest's descriptive text changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Put something on to watch, straight away (Priority: P1)

An authenticated household member opens the portal on their phone and, without reading past
anything technical, taps one of two clearly-labelled cards — "watch the library" or
"find something to watch" — and the corresponding service opens.

**Why this priority**: This is the entire point of the feature. If only this works, the
portal already stops feeling like an operations console.

**Independent Test**: With a valid session, load the landing view at a 360 × 780 px
viewport with two services marked `homemedia.placement=home`. Confirm the two primary
action cards are the only service cards shown, both are fully visible without vertical
scrolling, each shows an action-phrased title and a plain-language line, and tapping one
opens its configured destination in a new tab while the portal stays open.

**Acceptance Scenarios**:

1. **Given** an authenticated user on a phone and two services marked
   `homemedia.placement=home`, **When** they open the portal, **Then** the landing view
   shows exactly those two services as large cards — each with a service-specific icon, an
   action-phrased title, and a one-line plain-language description — and shows no other
   service tiles above the "Manage media" section.
2. **Given** the landing view at 360 × 780 px for the normal two-action case, **When** it
   renders, **Then** both complete primary action cards are visible without vertical
   scrolling.
3. **Given** a primary action card, **When** the user taps it, **Then** the service's
   configured destination opens in a new tab/view and the portal remains open.
4. **Given** a primary action service whose link destination cannot be determined, **When**
   the card renders, **Then** it indicates the link is unconfigured rather than opening an
   incorrect location (unchanged Portal v1 behaviour).
5. **Given** more than two, or exactly one, service marked `homemedia.placement=home`,
   **When** the landing view renders, **Then** it shows one large card per such service,
   ordered by `homemedia.order` then name, with no grouping.

---

### User Story 2 - Keep the tools available but out of the way (Priority: P1)

A household member is not confronted with the operator's tools, but an operator can still
reach every one of them in a click, on the same page, without a separate mode or login.

**Why this priority**: The portal must not lose any capability it has today; the tools
simply stop competing for attention on the landing view.

**Independent Test**: On the landing view, confirm a single "Manage media" section exists,
is collapsed by default, opens on click or keyboard activation, and when open shows every
non-`home` service grouped exactly as the Portal v1 dashboard does (same categories, same
sort, same tile content).

**Acceptance Scenarios**:

1. **Given** the landing view, **When** it first renders, **Then** a "Manage media" section
   is present and collapsed, and its control states how many tools it contains.
2. **Given** the collapsed "Manage media" section, **When** the user activates it by touch
   or keyboard, **Then** it expands to show every service not marked
   `homemedia.placement=home`, grouped by `homemedia.category` with the Portal v1
   normalisation and sort order.
3. **Given** an expanded "Manage media" section, **When** the user activates its control
   again, **Then** it collapses.
4. **Given** no service is marked `homemedia.placement=home`, **When** the landing view
   renders, **Then** there is no separate "Manage media" section and the full Portal v1
   grouped dashboard is shown unchanged.
5. **Given** every discovered service is marked `homemedia.placement=home`, **When** the
   landing view renders, **Then** the primary cards are shown and no empty "Manage media"
   section appears.

---

### User Story 3 - Find any service, including the hidden tools (Priority: P2)

A member types part of a service's name into search and finds it wherever it lives —
including a tool inside the collapsed section.

**Why this priority**: Search is how the portal keeps working as a directory once the
default view is deliberately sparse.

**Independent Test**: With the "Manage media" section collapsed, type text matching only a
tool inside it; confirm the section auto-expands, shows only the matching tiles with a
"showing N of M" line, and that clearing the search re-collapses it.

**Acceptance Scenarios**:

1. **Given** a non-empty search query, **When** it matches a primary action service,
   **Then** the matching primary card(s) remain visible and non-matching ones are hidden.
2. **Given** a non-empty search query that matches a service inside "Manage media",
   **When** the results update, **Then** the "Manage media" section is expanded
   automatically and shows only the matching tiles, with a visible count of matches shown
   out of the total.
3. **Given** a search query with no matches anywhere, **When** the results update,
   **Then** an explicit "no matches" empty state is shown (not a blank screen).
4. **Given** an active search that expanded "Manage media", **When** the user clears the
   query, **Then** the primary cards are restored and "Manage media" returns to its
   collapsed default.
5. **Given** any search, **When** it runs, **Then** it triggers no new server request and
   no Docker read — it filters the already-loaded data only (unchanged Portal v1
   behaviour).

---

### User Story 4 - Curate the friendly view with labels, no rebuild (Priority: P2)

The operator decides which services are primary, what each card says, and what description
each service shows, purely by setting labels on the containers — no portal rebuild.

**Why this priority**: This is how the "friendly" promise is kept accurate over time and is
the mechanism behind the acceptance gate in FR-113.

**Independent Test**: Add `homemedia.placement=home` and `homemedia.home_label` to a
service, apply it via the server's normal process, reload the portal, and confirm the
service moves to a primary card showing the given label; remove the label and confirm it
returns to "Manage media".

**Acceptance Scenarios**:

1. **Given** a service with `homemedia.placement=home` and a `homemedia.home_label`,
   **When** the portal refreshes, **Then** it appears as a primary card whose title is the
   `home_label` value, using its `homemedia.description` (or the FR-105 fallback) as the
   plain-language line, with no portal rebuild.
2. **Given** a `placement=home` service with no `homemedia.home_label`, **When** the portal
   refreshes, **Then** the primary card title falls back to `homemedia.name` (or the
   de-slugified container name).
3. **Given** a service whose `homemedia.placement` is absent, blank, or an unrecognised
   value, **When** the portal refreshes, **Then** it is treated as `manage` and appears in
   the "Manage media" section.
4. **Given** a `placement=home` service, **When** the portal refreshes, **Then** it does
   **not** also appear in the "Manage media" list.

---

### User Story 5 - A friendly identity on the home screen (Priority: P3)

A household member sees a warm, human name for the portal in the browser tab and, if they
install it, on their home screen.

**Why this priority**: Reinforces the product's shift in tone; the portal is fully usable
without it.

**Independent Test**: Load the portal and confirm the browser tab and on-page title read
"Home media"; install the PWA and confirm the installed name and short name use the
friendly identity; confirm the service worker still precaches static assets only.

**Acceptance Scenarios**:

1. **Given** any portal page, **When** it loads, **Then** the visible page title and the
   document title use the friendly identity ("Home media") rather than the repository /
   technical name.
2. **Given** the portal installed as a PWA, **When** it is added to the home screen,
   **Then** its name and short name use the friendly identity.
3. **Given** the installed app is offline, **When** it launches, **Then** only the static
   shell may appear from cache; no service list, status, or authenticated content is served
   from cache (unchanged Portal v1 behaviour).

### Edge Cases

- **No `placement=home` service**: the landing view is exactly the Portal v1 grouped
  dashboard; the feature is inert and nothing regresses.
- **All discovered services are `placement=home`**: only primary cards render; no empty
  "Manage media" section is shown.
- **A `placement=home` service is stopped / status unavailable**: the primary card still
  renders and shows its status quietly; it is not hidden.
- **`homemedia.description` missing, blank, or malformed**: the card shows the deterministic
  placement-based fallback sentence (FR-105) — never a blank line, never a raw label value,
  never a category name presented as prose.
- **Labelled-service discovery fails (`sourceOk` false)**: unchanged Portal v1 behaviour —
  an explicit "service directory unavailable" state, no list, nothing fabricated, cached,
  or retained; no primary cards and no "Manage media" section.
- **Discovery succeeds but a status read fails**: unchanged — the service is still listed
  (as a primary card or in "Manage media") with "status unavailable".
- **Search matches services in both regions**: primary cards filter in place and
  "Manage media" expands to its matches simultaneously.
- **Reduced-motion preference set**: the expand/collapse of "Manage media" is instantaneous
  with no animation; all other non-essential animation stays disabled.
- **Very long `home_label` or description**: truncated for layout without breaking
  one-handed use; the full value is kept for search and assistive-technology labels.
- **Keyboard-only / screen-reader user**: the "Manage media" control is reachable and
  operable by keyboard, exposes its expanded/collapsed state, and has an accessible name.

## Requirements *(mandatory)*

### Functional Requirements

**Landing view & information hierarchy**

- **FR-101**: The authenticated landing view MUST present, above any other service tiles,
  one large "primary action" card for each service marked `homemedia.placement=home`,
  ordered by `homemedia.order` then name, not grouped by category.
- **FR-102**: All services not marked `homemedia.placement=home` MUST be presented only
  inside a single "Manage media" section that is collapsed by default and can be expanded
  and re-collapsed by touch or keyboard. When expanded it MUST group services by
  `homemedia.category` using the same normalisation and sort order as Portal v1.
- **FR-103**: When no discovered service is marked `homemedia.placement=home`, the landing
  view MUST fall back to the Portal v1 grouped dashboard unchanged, with no "Manage media"
  section and no primary cards.
- **FR-104**: The product's visible page title, document title, and PWA manifest `name`
  and `short_name` MUST use the friendly identity ("Home media"). The PWA caching policy
  MUST NOT change (FR-111).
- **FR-114**: A service marked `homemedia.placement=home` MUST NOT also appear in the
  "Manage media" section.

**Descriptions**

- **FR-105**: Every service card, in either region, MUST show a short plain-language
  description. It MUST be `homemedia.description` when that label is present and non-blank.
  When `homemedia.description` is absent, blank, or malformed, the card MUST show a fixed,
  deterministic fallback sentence chosen **solely by the service's placement** (one generic
  sentence for a primary/home service, one for a manage tool). The fallback MUST name no
  service, no category value, and no infrastructure detail, and MUST never be a blank line
  or a raw label value.
- **FR-113** *(implementation / deployment acceptance gate)*: Friendly Home View MUST NOT
  be accepted in practice until **every** service currently opted in with
  `homemedia.enable=true` has been given a curated label set: a `homemedia.placement`
  value, a meaningful `homemedia.description`, and — for services placed on the home view —
  a `homemedia.home_label`. These curated label values are recorded only in the operator's
  private notes and applied through the server's normal change process; they MUST NOT
  appear in any tracked repository file, commit message, or pull-request text. The FR-105
  fallback exists only to cover a malformed, incomplete, or newly-added service and MUST
  NOT be the normal household experience.

**Labels (additive `homemedia.*` contract amendment)**

- **FR-106**: The portal MUST read two additional optional per-service labels, additive to
  the existing `homemedia.*` contract and subject to its existing "unknown keys are
  ignored" rule:
  - `homemedia.placement` — accepted values `home` or `manage` (case-insensitive);
    default `manage`; any unrecognised or malformed value is treated as `manage`.
  - `homemedia.home_label` — free text; the action-phrased title of a primary card; used
    only when `placement=home`; when absent the primary card title falls back to
    `homemedia.name`, then to the de-slugified container name. Long values are truncated
    for display; the full value is retained for search and assistive-technology labels.
- **FR-107**: No existing `homemedia.*` key changes meaning. A malformed value for either
  new key MUST NOT drop the service or cause an error — the documented default applies and
  the tile still renders. Only `homemedia.enable` can exclude a container (unchanged).

**Search**

- **FR-108**: Search MUST cover services in both regions. While a search query is active
  and matches one or more services inside "Manage media", that section MUST be expanded
  automatically and MUST show only the matching tiles together with a visible count of
  matches out of the total. Clearing the query MUST restore the primary cards and return
  "Manage media" to its collapsed default. Search MUST remain client-side over the
  already-loaded data, triggering no new server request, Docker read, or polling.

**Presentation, status & accessibility**

- **FR-109**: Per-service status MUST remain visible and accurate on every card in both
  regions, derived only from container state and healthchecks exactly as in Portal v1, but
  presented as visually secondary (smaller / lower emphasis) while still meeting WCAG 2.1
  AA contrast and never relying on colour alone.
- **FR-110**: The "LAN only" marker MUST remain present and accurate for every service
  marked `homemedia.lan_only`, presented more quietly than in Portal v1. The portal MUST
  still not proxy or tunnel to such destinations.
- **FR-115**: The landing view MUST remain mobile-first and fully operable one-handed at a
  360 × 780 px viewport with no horizontal scrolling; touch targets, including the
  "Manage media" control, MUST be at least 44 × 44 CSS pixels. For the normal
  two-primary-action case, both complete primary action cards MUST be fully visible without
  vertical scrolling at that viewport.
- **FR-116**: The "Manage media" control MUST be keyboard operable, MUST expose its
  expanded/collapsed state to assistive technology, and MUST have an accessible name. The
  landing view MUST honour `prefers-reduced-motion` by removing the expand/collapse
  animation and all other non-essential animation. The landing view MUST have no
  serious or critical accessibility violations at the acceptance viewport.

**Icons**

- **FR-117**: Service cards MUST use service-specific icons resolved only from the
  portal's locally bundled icon set; an unknown or malformed `homemedia.icon` value MUST
  fall back to the generic glyph. No icon MUST be fetched at runtime from any external
  source. Expanding the bundled subset MUST keep the set commit-pinned, MUST re-verify the
  upstream licence is still Apache-2.0 at the pinned commit (and stop and report if it is
  not), and MUST keep the existing provenance and attribution records (`LICENSE`,
  `NOTICE`, `PROVENANCE.md`, the README credit, and the in-UI attribution notice) accurate
  and sufficient. No new attribution mechanism is required while the upstream licence
  stays Apache-2.0.

**Unchanged surfaces**

- **FR-111**: This feature MUST NOT change: authentication, the login throttle, the
  exactly-30-day `__Host-` session cookie, or secret-rotation forced re-authentication;
  the unauthenticated health endpoint and its non-disclosure guarantee; the
  `/api/services` refresh endpoint semantics; the route guard and reverse-proxy /
  forwarded-header behaviour; the Content-Security-Policy and other security headers;
  status derivation and the two discovery/status failure modes; the prohibition on
  probing, background polling, and status streaming; or the service worker's
  static-asset-only precache (no service data, API responses, authentication routes, or
  authenticated HTML cached).
- **FR-112**: The opt-in discovery invariant is unchanged and applies to both regions and
  every empty, collapsed, or error state: a container without `homemedia.enable=true` MUST
  NOT be displayed, listed, counted, or hinted at anywhere.

### Key Entities

- **Primary action (view concept)**: a service with `homemedia.placement=home`, rendered
  as one large landing card — icon, action-phrased title (`homemedia.home_label` →
  `homemedia.name` → de-slugified container name), plain-language description
  (`homemedia.description` → FR-105 fallback), secondary status, optional quiet "LAN only"
  marker, and a link to its configured destination. Derived per request; never stored.
- **Manage media section (view concept)**: the collapsible container holding every
  `placement=manage` service, grouped into the Portal v1 **Category** structure unchanged.
- **Service (portal projection)**: unchanged from Portal v1, plus a resolved `placement`
  and, when relevant, a resolved primary-card title. Still derived at read time and stored
  nowhere.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: From the authenticated landing view with the normal two primary actions, a
  household member can reach either primary media action in **one tap**, with **both
  complete primary action cards fully visible without vertical scrolling at a 360 × 780 px
  viewport**.
- **SC-102**: On the default landing view, the only service tiles shown above the
  "Manage media" section are the `placement=home` cards; every `placement=manage` service
  is inside the collapsed section and reachable by one activation of its control (touch or
  keyboard).
- **SC-103**: 100% of service cards shown — in either region, in every state except a
  full discovery failure — display a plain-language description; with a fully curated label
  set (FR-113) 0% of them display the FR-105 fallback sentence.
- **SC-104**: A search term matching only a service inside the collapsed "Manage media"
  section causes that section to expand and show the matching tile(s) with a match count;
  clearing the term re-collapses it. A search term with no matches shows an explicit empty
  state.
- **SC-105**: A container without `homemedia.enable=true` appears in 0 primary cards, 0
  "Manage media" entries, 0 counts, and 0 hints, including the collapsed-section control
  text and every empty/error state.
- **SC-106**: No favourites, hidden-state persistence, preference cookie, `localStorage`
  use, database, programmatic API, background polling, or background client persistence is
  present in the feature.
- **SC-107**: Every service icon is served from the local bundle with no runtime network
  request; an unknown `homemedia.icon` value renders the generic glyph; the bundled set's
  licence, provenance, and attribution records are present and accurate.
- **SC-108**: The landing view is operable one-handed at 360 × 780 px with no horizontal
  scroll, is fully keyboard operable including the "Manage media" control, plays no
  non-essential animation under `prefers-reduced-motion`, and has no serious or critical
  automated accessibility violations.
- **SC-109**: With no service marked `homemedia.placement=home`, the landing view is
  byte-for-behaviour identical to the Portal v1 grouped dashboard.
- **SC-110**: Authentication, session cookie lifetime and attributes, the health endpoint
  response and non-disclosure, reverse-proxy/forwarded-header handling, status semantics
  and failure modes, and the static-asset-only PWA cache policy are unchanged from Portal
  v1 (verified by the existing Portal v1 checks continuing to pass).
- **SC-111**: The visible title, document title, and installed PWA name/short name use the
  friendly identity.

## Dependencies & Acceptance Gate

- **Depends on** feature `001-portal-v1` (merged): the discovery model, label parsing,
  status derivation, `ServiceProjection`/`Category` structures, the bundled icon set, the
  auth/session/route-guard stack, and the PWA/service-worker design are all reused as-is.
- **Additive contract amendment**: `homemedia.placement` and `homemedia.home_label` are
  added to the `homemedia.*` label contract. This is the only cross-feature contract
  change; it removes or alters no Portal v1 requirement and is covered by the contract's
  existing forward-compatibility clause. The contract file itself is amended in this
  feature's plan phase, not in the specification pull request.
- **Deployment acceptance gate (FR-113)**: the feature is not accepted in practice until
  every currently opted-in service carries a curated `homemedia.placement`, a meaningful
  `homemedia.description`, and (where placed on the home view) a `homemedia.home_label`,
  applied through the server's normal change process and recorded only in the operator's
  private notes.
- The Portal v1 external reverse-proxy route is unaffected; this feature neither depends on
  nor changes it.

## Assumptions

- The household reaches service destinations over the home network or an existing
  remote-access path; this feature does not add remote access (LAN-only destinations stay
  marked — FR-110).
- Normally exactly two services are placed on the home view; the design also handles one or
  three without breaking the acceptance conditions.
- The concrete assignment of `placement`, `description`, and `home_label` values to real
  services lives only in the operator's untracked private notes, never in the public
  repository.
- Expanding the bundled icon subset will find the upstream project still under Apache-2.0
  at the chosen pinned commit; if not, the icon work stops and is reported (FR-117).

## Out of Scope (Non-Goals)

- Favourites, pinning, or per-person ordering.
- Hide/show or "don't show me this" preferences.
- Any client-side persistence for preferences (`localStorage`, `sessionStorage`,
  IndexedDB) or preference cookies.
- A preferences database or any server-side per-user or per-device state.
- Individual accounts, per-user views, or any login change.
- A programmatic / "AI-control" API, a read API beyond the existing `/api/services`
  refresh endpoint, background polling, or status streaming.
- Editing labels or configuration from the portal UI; any container control capability.
- Changes to Docker/Compose, the reverse proxy, DNS, router, firewall, VPN, the deployed
  image or its pinning, or the CI/publish pipeline.

### Deferred: per-person personalisation

Per-person favourites and hide/show preferences are a genuinely valuable future capability,
but the portal has **one shared household login** and cannot safely attribute a preference
to a person. Delivering them requires its own identity and preferences design — an
authentication model that distinguishes household members, a place to store their choices,
and a privacy analysis of that store on a shared device — and very likely a Constitution
and/or Portal v1 specification amendment. It is recorded here as **deferred**, not as a
partial implementation. Friendly Home View deliberately ships one curated household default
view plus the expandable "Manage media" section, which is sufficient to make the portal
friendly and useful with zero persistence.

## Product-Owner Decisions (recorded 2026-08-31)

| # | Decision |
|---|----------|
| 1 | Landing view is driven by an opt-in `homemedia.placement=home` label; with no such service it falls back to the Portal v1 grouped dashboard. |
| 2 | A `placement=home` service appears only as a primary card, never also in "Manage media"; it stays searchable. |
| 3 | "Manage media" is one collapsible section, collapsed by default, grouping `placement=manage` services with the Portal v1 category structure. |
| 4 | Plain-language descriptions reuse `homemedia.description`; a deterministic placement-based fallback is a safety net only (FR-105), and every opted-in service must be curated before acceptance (FR-113). |
| 5 | Mobile acceptance viewport is **360 × 780 px**; success = both complete primary cards visible without vertical scrolling for the normal two-action case. |
| 6 | The friendly identity ("Home media") also changes the installed PWA name/short name; the PWA caching policy does not change. |
| 7 | Service-specific icons come from the existing locally-bundled Apache-2.0 set; expansion keeps it commit-pinned with re-verified licence and the existing attribution records; no runtime fetch. |
| 8 | Favourites, hide/show, local persistence, preference cookies, a database, accounts, and any API/polling/background persistence remain **deferred**, not partially built. |

No open questions remain for Friendly Home View.
