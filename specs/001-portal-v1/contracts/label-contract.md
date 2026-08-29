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

- Type: string — an absolute `http(s)` URL.
- If valid, it is the tile's link target and takes precedence over
  `homemedia.port`.
- If present but not a valid absolute `http(s)` URL → ignored (fall through to
  `port`, then to "link unconfigured").

### `homemedia.port`

- Type: integer 1–65535.
- Used only when `homemedia.url` is absent/invalid **and** the deployment has a
  link-base host template configured. Resulting link:
  `<scheme>://<base-host>:<port>` (base host is private deployment config).
- If neither `url` nor a usable `port`+base yields a valid absolute URL, the tile
  shows "link unconfigured" and is not a link (FR-018).

### `homemedia.order`

- Type: integer. Default: `100`.
- Ascending sort within a category; ties broken by `name` (locale, case-insensitive).
- A category's sort weight is the minimum `order` of its members.

### `homemedia.lan_only`

- Type: boolean. Accepted truthy values (ci): `true`, `1`, `yes`. Default: `false`.
- `true` → the tile shows a visible **"LAN only"** badge (FR-029, SC-012). The
  portal still renders the link but performs no proxying/tunnelling; opening it
  from outside the home network may simply not connect, which is expected.

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
  homemedia.url: "https://example.internal/"   # wins over port
  homemedia.order: "10"
  homemedia.lan_only: "false"
```

```yaml
labels:
  homemedia.enable: "true"
  homemedia.name: "Admin Panel"
  homemedia.category: "Ops"
  homemedia.port: "9999"            # link built from base-host + 9999
  homemedia.lan_only: "true"        # shows "LAN only" badge
```
