# Phase 1 Data Model: Friendly Home View

No persistent storage. Every structure is derived per request from the Docker read exactly
as in Portal v1. This file records only the **deltas** to
[`specs/001-portal-v1/data-model.md`](../001-portal-v1/data-model.md); everything not
mentioned here is unchanged.

---

## 1. `LabelSet` — two additive keys

Additive to Portal v1 §2. Parsed from `RawContainer.labels`; never throws; a malformed
value falls back to the default and the tile still renders. Only `homemedia.enable` can
drop a container.

| Key | Type | Default | Validation / normalisation |
|---|---|---|---|
| `homemedia.placement` | enum `home` \| `manage` | `manage` | trim + casefold; exactly `home` → `home`; anything else (incl. blank, unknown, malformed) → `manage` |
| `homemedia.home_label` | string | `null` | trimmed; `null` when absent/blank; used only when `placement === 'home'`; length-capped for display, full value retained for search + `aria-label` |

`LabelSet` gains:

```ts
placement: 'home' | 'manage';   // never null — defaults to 'manage'
homeLabel: string | null;       // trimmed, or null
```

No existing key changes meaning or default.

---

## 2. `ServiceProjection` — placement + resolved primary title

Additive to Portal v1 §3.

| Field | Type | Derivation |
|---|---|---|
| `placement` | `'home' \| 'manage'` | `LabelSet.placement` |
| `homeLabel` | `string \| null` | `LabelSet.homeLabel` (only meaningful when `placement === 'home'`) |
| `description` | `string \| undefined` | **unchanged field, new fallback**: `LabelSet.description` when present; otherwise the deterministic placement fallback string (see §3) — so a projected service on the friendly view **always** has display description text |

Primary-card title (view-level, not stored): `homeLabel ?? name` where `name` already
resolves `homemedia.name` → de-slugified container name.

`slug`, `iconId`, `category`, `categoryKey`, `href`, `lanOnly`, `order`, `status`,
`statusLabel` are all derived exactly as in Portal v1.

---

## 3. Description fallback (deterministic, placement-keyed)

Pure function `resolveDescription(rawDescription, placement) → string`.

| Input | Output |
|---|---|
| `rawDescription` non-blank | `rawDescription` (trimmed) |
| `rawDescription` absent / blank / malformed, `placement === 'home'` | fixed constant `PRIMARY_FALLBACK_DESCRIPTION` |
| `rawDescription` absent / blank / malformed, `placement === 'manage'` | fixed constant `MANAGE_FALLBACK_DESCRIPTION` |

The two constants are plain English sentences held in the codebase (e.g. a primary-service
sentence and a management-tool sentence). They contain no service name, no category value,
no host/port/path. They are the only text that can appear when a curated description is
missing; FR-113 makes that a non-normal case.

---

## 4. `DashboardModel` — view partition, same list

Additive to Portal v1 §6. The model is still built from **one** Docker read and still
never fabricates/caches/retains a list.

```
{
  generatedAt: string,
  sourceOk: boolean,               // unchanged: false ONLY when discovery failed
  categories: Category[],          // unchanged: the Portal v1 grouped view of ALL services
  primary: ServiceProjection[],    // NEW: services with placement === 'home',
                                   //      sorted by order asc then name (locale, ci)
  manage: Category[],              // NEW: the Portal v1 grouping applied to
                                   //      placement === 'manage' services only
  counts: { services, up, down, unknown },   // unchanged: across ALL services
  manageCount: number              // NEW: number of placement === 'manage' services
}
```

Rendering rule (in `+page.svelte`):

- `sourceOk === false` → the Portal v1 "service directory unavailable" state, no list.
- `primary.length === 0` → render `categories` exactly as Portal v1 (fallback; `manage`
  and `manageCount` are ignored).
- `primary.length > 0` → render `primary` as large cards, then a "Manage media"
  `<details>` containing `manage` (omit the `<details>` entirely if `manageCount === 0`).

`categories` is retained unconditionally so the fallback path and `/api/services` (if it
is ever built — it is not in scope here) stay identical to Portal v1. `primary` and
`manage` are a partition of the same projected services; `primary ∪ manage` = every
discovered labelled service, `primary ∩ manage` = ∅.

Counts (`counts`, and the search "X of Y") are computed over all services so the totals a
household member sees match the directory.

---

## 5. Everything else — unchanged

- `RawContainer`, status mapping (§4 of Portal v1) and the two failure modes: unchanged.
- `SessionPayload`, `RateLimitState`, `RuntimeConfig`: unchanged. No new env var.
- Search: unchanged mechanism (client-side over the loaded model, no request/Docker read);
  scope now spans `primary` + `manage`; a `manage` hit forces the disclosure open and
  shows a match count; clearing the query restores the collapsed default.
- Icons: registry gains generic-role ids; resolution + `generic` fallback unchanged.

## Entity relationships (delta)

```
RawContainer ─(parseLabels)─> LabelSet{+placement,+homeLabel} ─┐
                                                               ├─> ServiceProjection{+placement,+homeLabel, description always set}
        └─(inspect State/Health)────────────────────────────────┘
                                        │
                          ┌─────────────┴──────────────┐
              placement === 'home'            placement === 'manage'
                    │                                  │
              DashboardModel.primary[]      groupIntoCategories() ─> DashboardModel.manage[]
                    └──────────── all services ─────────> DashboardModel.categories[] (fallback + totals)
```
