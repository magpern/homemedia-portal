# Phase 0 Research: Friendly Home View

All decisions below are resolved (no open `NEEDS CLARIFICATION`). No private addresses,
hostnames, ports, server paths, service names, or image digests appear here. Portal v1
research R1–R11 is unchanged and still in force; only the deltas for this feature are
recorded here.

---

## FHV-R1. How the landing view selects primary services

**Decision**

- Add one optional label `homemedia.placement` with accepted values `home` and `manage`
  (case-insensitive), **default `manage`**. Any unrecognised or malformed value resolves
  to `manage`.
- The landing view renders a large "primary action" card for each `placement=home`
  service and puts every `placement=manage` service inside one collapsed "Manage media"
  section.
- **Fallback**: if the projected list contains **zero** `placement=home` services, the
  landing view renders exactly the Portal v1 grouped dashboard (no primary region, no
  disclosure). This is a pure function of the model, so it is deterministic and needs no
  flag.

**Rationale**

- Keeps the Constitution's explicit-opt-in, label-driven model: the operator decides what
  is promoted, nothing is inferred from image names or heuristics.
- `manage` as the default means an un-migrated deployment behaves exactly like Portal v1
  until the operator opts a service in — safe rollout, safe rollback.
- The fallback removes any "half-configured" broken state and gives a one-move rollback
  (remove the `home` labels).

**Alternatives considered**

- A fixed two-slot model (`homemedia.home=watch|request`): rejected — rigid, breaks with
  one or three primary apps, and couples the spec to a specific household's app choices.
- Portal-level config (env/build): rejected — splits the curation surface away from
  labels and complicates the disclosure/secrets story.
- Auto-promote by category or image name: rejected — violates explicit-opt-in.

---

## FHV-R2. Primary-card title and per-service description

**Decision**

- Add one optional free-text label `homemedia.home_label` — the action-phrased title shown
  on a primary card (e.g. `"Watch the library"`). Used only when `placement=home`.
  Resolution order for the primary-card title: `homemedia.home_label` →
  `homemedia.name` → de-slugified container name.
- **Descriptions reuse the existing `homemedia.description`.** When it is absent, blank,
  or malformed, the card shows a **fixed deterministic fallback sentence chosen solely by
  the resolved placement** — one generic sentence for a primary service, one for a manage
  tool. The fallback text is a constant in the codebase; it names no service, no category
  value, and no infrastructure.
- The fallback is a safety net. FR-113 makes a curated `homemedia.description` on every
  opted-in service the practical acceptance gate; the fallback only ever covers a
  malformed, incomplete, or newly-added service.

**Rationale**

- One new key instead of two: `home_label` carries the *call to action*, which is
  legitimately different from the service's identity (`name`, used for search and
  assistive-technology labels). A description key already exists; adding a third would be
  redundant.
- A placement-keyed constant is fully deterministic and testable and cannot leak
  inventory.

**Alternatives considered**

- Deriving the fallback from `homemedia.category` ("Part of Downloads"): rejected — the
  category value is operator-controlled free text and could itself be inventory-ish; a
  fixed constant is safer and simpler.
- Making `home_label` fall back to a generic verb ("Open"): rejected — less useful than
  falling back to the real service name.

---

## FHV-R3. Accessible "Manage media" disclosure

**Decision**

- Use the native `<details>` / `<summary>` element for the collapsed section.
- `<summary>` is the toggle: it is keyboard-focusable and operable by default, exposes
  expanded/collapsed state to assistive technology natively, and needs no `role`,
  `aria-expanded`, or JS to be correct. It is styled to a ≥ 44 × 44 px target and shows
  the count of tools inside ("Manage media · N tools").
- Search interaction: when a query is active and matches ≥ 1 `manage` service, script
  sets the `open` property to `true` and the section shows only matching tiles plus a
  "showing X of Y" line; when the query is cleared, script restores `open = false`
  (the default). Toggling by the user in between is preserved until the next query change.
- `prefers-reduced-motion`: no `transition`/`animation` on the disclosure; the default
  `<details>` open/close is already instantaneous, so nothing extra is needed beyond not
  adding motion.

**Rationale**

- `<details>` is the lowest-risk accessible disclosure: no ARIA to get wrong, works with
  JS disabled, and is well-supported on the target mobile browsers.
- Keeping the forced-open behaviour to a single boolean property keeps it predictable and
  easy to test.

**Alternatives considered**

- A `<button aria-expanded>` + separately toggled region: rejected — re-implements what
  `<details>` gives for free and adds failure modes.
- Always-rendered list hidden with CSS only: rejected — collapsed content would still be
  in the a11y tree and reachable by screen readers, defeating "out of the way".

---

## FHV-R4. Expanding the bundled icon set without disclosing inventory

**Decision**

- Icons remain a locally bundled, commit-pinned subset of Dashboard Icons (Apache-2.0),
  inlined at build, **no runtime fetch** (Portal v1 R7 unchanged).
- The set is expanded with **generic household-role glyphs** (e.g. a "play / watch"
  glyph, a "request / discover" glyph, a "download" glyph, a "settings / tools" glyph, a
  "monitoring" glyph) — chosen so a bundled id maps to a *role*, not to a named product.
  Where a service-specific brand glyph would reveal which product a household runs, the
  operator labels that service with a generic role id or leaves it to the `generic`
  fallback.
- Any brand glyph that *is* bundled is a widely-generic one already shipped or an
  explicit operator choice; the id set in `src/lib/icons/index.ts` and the
  `PROVENANCE.md` id table stay the only tracked record, and they list ids and upstream
  paths only — never which service uses which id.
- Process for adding ids: re-pin `PROVENANCE.md` to a chosen upstream commit, re-verify
  the `LICENSE` is still Apache-2.0 at that commit (if not, **stop and report** — do not
  bundle), copy each `svg/<id>.svg` verbatim (or author an original neutral glyph and
  mark it as project-authored, like `generic.svg`), update `index.ts` and `PROVENANCE.md`.
- Existing attribution stays sufficient: verbatim `LICENSE`, authored `NOTICE`
  (attribution + trademark/identification-only disclaimer), `PROVENANCE.md`, the README
  credit, and the in-UI `AttributionNotice`. No new mechanism is needed while upstream is
  Apache-2.0.

**Rationale**

- Role glyphs keep the friendly view visually richer than "everything is the generic
  glyph" while the repository still says nothing about the household's actual stack.
- Apache-2.0 §4 obligations are already met by the Portal v1 files; only the id table and
  pinned commit need updating.

**Alternatives considered**

- Bundling a brand glyph per real service: rejected — the tracked id list plus obvious
  naming would disclose inventory.
- No icon change: acceptable but leaves the friendly view flat; role glyphs are a small,
  safe improvement.

---

## Consolidated change list (for the plan)

- **No new runtime or dev dependency.**
- New labels: `homemedia.placement` (enum, default `manage`), `homemedia.home_label`
  (string, `placement=home` only).
- New pure logic in `labels.ts` / `projection.ts` / `dashboard.ts`; new presentational
  components `PrimaryActionCard.svelte`, `ManageMediaSection.svelte`.
- Manifest/document/`<h1>` text → "Home media"; **PWA caching policy unchanged**.
- Bundled icon set gains generic-role glyphs; provenance/attribution updated.
- Status + LAN-only markers restyled secondary; semantics unchanged.
