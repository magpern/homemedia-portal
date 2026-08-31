# Label Contract Delta: Friendly Home View

Additive amendment to
[`specs/001-portal-v1/contracts/label-contract.md`](../../001-portal-v1/contracts/label-contract.md).
Two new **optional** keys. No existing key changes. Covered by that contract's existing
rule: *"Any other `homemedia.*` key is ignored (forward compatibility)"* — a Portal v1
build simply ignores these; a Friendly Home View build reads them.

Examples use placeholder names only — no real service inventory.

---

## New keys

### `homemedia.placement`

- Type: enum. Accepted values (case-insensitive, trimmed): `home`, `manage`.
- Default: `manage`.
- Any other value, blank, or absent → `manage` (not an error; the tile still renders).
- `home` → the service is shown as a large **primary action card** on the default landing
  view and is **not** listed in the "Manage media" section (it stays searchable).
- `manage` → the service is shown inside the collapsed "Manage media" section, grouped by
  `homemedia.category` exactly as in Portal v1.
- If **no** service in the directory is `placement=home`, the landing view falls back to
  the Portal v1 grouped dashboard unchanged.

### `homemedia.home_label`

- Type: string. Optional; no default.
- Used **only** when `homemedia.placement=home`. It is the action-phrased title of the
  primary card (e.g. `"Watch the library"`).
- Resolution order for the primary-card title: `homemedia.home_label` → `homemedia.name`
  → de-slugified container name.
- Long values are truncated in the UI; the full value is retained for search and
  `title` / `aria-label`.

---

## Interaction with existing keys

| Key | Behaviour under Friendly Home View |
|---|---|
| `homemedia.enable` | Unchanged — still the only key that can include/exclude a container. |
| `homemedia.name` | Unchanged. Also the primary-card title fallback when `home_label` is absent. |
| `homemedia.description` | Unchanged meaning. Now shown on **every** card; when absent/blank/malformed a fixed deterministic sentence keyed on `placement` is shown instead (never blank, never a raw value). Operators SHOULD set a meaningful value on every enabled service (feature acceptance gate). |
| `homemedia.category` | Unchanged — groups services **within** the "Manage media" section (and in the no-home fallback view). Ignored for `placement=home` services. |
| `homemedia.icon` | Unchanged — bundled id only; unknown → `generic`; never fetched. Generic household-role ids are added to the bundled set. |
| `homemedia.url` / `homemedia.port` | Unchanged link-resolution rules (HTTPS needs explicit `url`; `port` builds plain `http` only). |
| `homemedia.order` | Unchanged — also orders the primary cards (ascending, then name). |
| `homemedia.lan_only` | Unchanged — still shows a "LAN only" marker, presented more quietly. |

---

## Worked example (placeholder)

```yaml
# a household-facing service promoted to the home view
labels:
  homemedia.enable: "true"
  homemedia.name: "Example Library"
  homemedia.placement: "home"
  homemedia.home_label: "Watch the library"
  homemedia.description: "Films and shows to play on the TV or a phone."
  homemedia.icon: "watch"            # a bundled generic-role id
  homemedia.url: "https://example.invalid/"
  homemedia.order: "10"
  homemedia.lan_only: "false"
```

```yaml
# an operator tool (default placement)
labels:
  homemedia.enable: "true"
  homemedia.name: "Example Admin"
  # homemedia.placement omitted -> "manage"
  homemedia.description: "Manage automatic downloads and library organisation."
  homemedia.category: "Automation"
  homemedia.port: "<port>"
  homemedia.lan_only: "true"
```

---

## Error handling

Unchanged from Portal v1: a malformed value for any **optional** key (now including
`placement` and `home_label`) uses that key's default and the tile still renders. Only a
non-truthy `homemedia.enable` drops a container.
