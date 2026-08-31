# Bundled icon provenance

Portal v1 resolves every service icon from this locally bundled set. **No icon is
fetched at runtime from any external source** (spec FR-012, research R7). This
file records where the bundled assets came from and how their licence was
verified, so the set is auditable and reproducible.

## Upstream source

| Field                  | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| Project                | Dashboard Icons                                                     |
| Repository             | https://github.com/homarr-labs/dashboard-icons                      |
| Pinned commit          | `4256e78782f08829c043d67448092fb409878a3c`                          |
| Commit date            | 2026-08-29                                                          |
| Licence at that commit | Apache License 2.0                                                  |
| Copyright holders      | Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs (© 2024) |

## Licence verification

- Verified on **2026-08-30** for the pinned commit above.
- `LICENSE` in this directory is the upstream `LICENSE` file copied **verbatim**
  from that commit. It is the standard Apache-2.0 text; its appendix carries the
  upstream copyright line quoted above.
- `NOTICE` in this directory is authored for this project (upstream has no root
  `NOTICE` file). It reproduces the upstream attribution and the upstream
  README's trademark / identification-only disclaimer, as Apache-2.0 §4 requires
  when redistributing.
- **If a future re-pin finds the upstream licence is no longer Apache-2.0, stop
  and report it — do not bundle icons from that revision** (tasks.md T023).

## Bundled files

Copied verbatim from `svg/<id>.svg` at the pinned commit:

| Bundled id        | Upstream path             |
| ----------------- | ------------------------- |
| `dashboard-icons` | `svg/dashboard-icons.svg` |
| `docker`          | `svg/docker.svg`          |

### Original glyphs authored for this project (not from upstream)

These carry no third-party rights. Each names a **role**, never a product, so the
tracked id list discloses nothing about the deployment's service inventory
(feature 002 — Friendly Home View, research FHV-R4).

| Bundled id | Role it represents                    |
| ---------- | ------------------------------------- |
| `generic`  | safe fallback for any unknown icon id |
| `watch`    | watch / play a media library          |
| `request`  | search for / request new content      |
| `download` | download client / transfers           |
| `settings` | configuration / management tool       |
| `activity` | monitoring / statistics               |

This is a deliberately minimal, generic foundation. The full icon set is grown in
later work packages, driven by the operator's own service list (kept in untracked
private notes); service-inventory names never become tracked asset filenames,
fixtures, examples, or documentation.

## Re-verifying or updating the set

1. Pick a new upstream commit; record its SHA and date above.
2. Fetch that commit's `LICENSE`; confirm it is still Apache-2.0; replace the
   verbatim `LICENSE` copy if the text changed.
3. Re-copy each bundled `svg/<id>.svg` verbatim from that commit.
4. Update `src/lib/icons/index.ts` only if ids were added or removed.
5. Run the authored-tree disclosure/secrets scan (quickstart.md §9).
