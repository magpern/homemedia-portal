# Label Contract: `homemedia.*`

This is the portal's configuration surface. The operator sets these labels on a
container (in the service's own Compose definition) to include and present it. No
portal rebuild is needed — changes take effect on the next dashboard load /
refresh after the container is re-applied (FR-013).

Examples below use placeholder names only — no real service inventory.

---

## Keys

### `homemedia.enable` *(required to appear)*

- Type: boolean. Accepted truthy values (case-insensitive): `true`, `1`, `yes`.
- Anything else, or absent → the container **does not appear anywhere** (FR-009,
  FR-010).

### `homemedia.name`

- Type: string. Default: the container name, de-slugified (`-`/`_` → space, title
  case).
- Displayed as the tile title. Long values are truncated in the UI; the full value
  is kept for search and `title`/`aria-label`.

### `homemedia.icon`

- Type: string — **a bundled icon id only** (see the portal's `src/lib/icons/`
  index).
- Default: a guess from the container image name if it maps to a bundled id, else
  `generic`.
- An unknown or malformed value → `generic`. The portal **never** fetches an icon
  from a URL or external source (FR-012).

### `homemedia.category`

- Type: string. Default: `Services`.
- Normalisation: trim, collapse internal whitespace. Grouping is case-insensitive;
  the **first** spelling seen provides the displayed casing. Near-identical
  categories therefore merge (spec edge case).

### `homemedia.description`

- Type: string. Optional; no default.
- Shown as secondary text on the tile; also searchable.

### `homemedia.url`

- Type: string — an absolute `http` or `https` URL.
- If valid, it is the **complete explicit destination** and always takes
  precedence over `homemedia.port`.
- **Required for any HTTPS (or non-default-scheme) destination** — the portal
  never infers TLS.
- If present but not a valid absolute `http`/`https` URL → ignored (fall through to
  `port`, then to "link unconfigured").

### `homemedia.port`

- Type: integer 1–65535.
- Used only when `homemedia.url` is absent/invalid **and** the deployment has
  `SERVICE_LINK_BASE` configured. Resulting link is **always plain
  `http`**: `http://<SERVICE_LINK_BASE>:<port>` (`SERVICE_LINK_BASE` is private
  deployment config). TLS is never guessed — an HTTPS service must use
  `homemedia.url`.
- If neither `url` nor a usable `port` + `SERVICE_LINK_BASE` yields a valid
  absolute URL, the tile shows "link unconfigured" and is not a link (FR-018).

### `homemedia.order`

- Type: integer. Default: `100`.
- Ascending sort within a category; ties broken by `name` (locale, case-insensitive).
- A category's sort weight is the minimum `order` of its members.

### `homemedia.lan_only`

- Type: boolean. Accepted truthy values (ci): `true`, `1`, `yes`. Default: `false`.
- `true` → the tile shows a visible **"LAN only"** badge (FR-029, SC-012). The
  portal still renders the link but performs no proxying/tunnelling; opening it
  from outside the home network may simply not connect, which is expected.

### `homemedia.placement` *(added by feature 002 — Friendly Home View)*

- Type: enum. Accepted values (case-insensitive, trimmed): `home`, `manage`.
- Default: `manage`. Any other value, blank, or absent → `manage` (not an error).
- `home` → shown as a large primary-action card on the default landing view and **not**
  listed in the collapsed "Manage media" section (still searchable).
- `manage` → shown inside "Manage media", grouped by `homemedia.category` as before.
- If no service is `placement=home`, the landing view falls back to the Portal v1 grouped
  dashboard unchanged. Full detail:
  [`specs/002-friendly-home-view/contracts/label-contract-delta.md`](../../002-friendly-home-view/contracts/label-contract-delta.md).

### `homemedia.home_label` *(added by feature 002 — Friendly Home View)*

- Type: string. Optional; no default. Used only when `homemedia.placement=home`.
- The action-phrased title of the primary card. Title resolution:
  `homemedia.home_label` → `homemedia.name` → de-slugified container name.
- Long values truncate in the UI; the full value is kept for search and `aria-label`.

> Feature 002 also makes `homemedia.description` effectively expected on every enabled
> service: it is shown on every card, and when absent/blank a fixed deterministic sentence
> keyed on `placement` is shown instead (never blank, never a raw value).

---

## Unknown keys

Any other `homemedia.*` key is ignored (forward compatibility). Non-`homemedia.*`
labels are never read for presentation.

## Error handling

A malformed value for any optional key is **not** a failure: the portal uses that
key's default and renders the tile. The container is dropped from the dashboard
**only** when `homemedia.enable` is not truthy.

## Worked example (placeholder)

```yaml
# in some service's own compose definition
labels:
  homemedia.enable: "true"
  homemedia.name: "Example Service"
  homemedia.icon: "example"          # must be a bundled id; else -> generic
  homemedia.category: "Media"
  homemedia.description: "Watch things"
  homemedia.url: "https://example.invalid/"   # explicit; required for HTTPS; wins over port
  homemedia.order: "10"
  homemedia.lan_only: "false"
```

```yaml
labels:
  homemedia.enable: "true"
  homemedia.name: "Admin Panel"
  homemedia.category: "Ops"
  homemedia.port: "<port>"         # link = http://<SERVICE_LINK_BASE>:<port>  (http only, never https)
  homemedia.lan_only: "true"       # shows "LAN only" badge
```
