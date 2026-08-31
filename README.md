# homemedia-portal

A curated, mobile-first internal service directory for one private home server —
a single polished page that lists the services the operator has explicitly
labelled, shows whether each is running, and links through to them. Reached from
outside the home network only through an existing, separately operated HTTPS
reverse proxy; the portal terminates no TLS and owns no public network edge.

## Status

In development, spec-driven. A production container image and its CI build/publish
workflow exist; the reverse-proxy / external-access acceptance gate does not.

- Governance: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Specification, plan, research, data model, contracts, and the task breakdown:
  [`specs/001-portal-v1/`](specs/001-portal-v1/)
    - [spec.md](specs/001-portal-v1/spec.md) ·
      [plan.md](specs/001-portal-v1/plan.md) ·
      [tasks.md](specs/001-portal-v1/tasks.md)
    - Contracts: [http-routes](specs/001-portal-v1/contracts/http-routes.md) ·
      [label-contract](specs/001-portal-v1/contracts/label-contract.md) ·
      [docker-api-contract](specs/001-portal-v1/contracts/docker-api-contract.md)

## Development

```
npm ci
npm run build     # production build
npm run check     # svelte-check / types
npm run lint      # prettier + eslint
npm test          # unit tests (vitest)
npm run test:e2e  # Playwright, via the local-HTTPS harness (tests/harness/README.md)
```

Runtime configuration is validated at startup; see
[`.env.example`](.env.example) and
[`specs/001-portal-v1/data-model.md`](specs/001-portal-v1/data-model.md) §9.
Concrete infrastructure values are never committed — they live only in an
untracked local `PRIVATE-CONTEXT.md`.

## Curating the menu

The portal shows a container **only** when it carries `homemedia.enable=true`,
and every part of the tile — display name, category, icon, link destination,
"LAN only" marker, ordering — is driven by `homemedia.*` labels set on that
container in its own Compose definition. Nothing else is read; unlabelled
containers are never listed, counted, or hinted at.

Add or edit the labels, re-apply that one service, and reload the portal — the
change takes effect on the next page load with **no portal rebuild or restart**.
Removing `homemedia.enable` removes the tile.

The full key list, accepted values, defaults, and the `url`-vs-`port` link rules
(the portal never infers HTTPS — an HTTPS destination needs an explicit
`homemedia.url`) are in
[`contracts/label-contract.md`](specs/001-portal-v1/contracts/label-contract.md).
An unknown `homemedia.icon` value falls back to the generic glyph; the portal
never fetches an icon.

### Friendly Home View

The landing view leads with the household's main actions and tucks the operator
tools into a collapsed **Manage media** section. Two optional labels drive it:

- `homemedia.placement` — `home` puts the service on the landing view as a large
  primary-action card; `manage` (the default) keeps it inside "Manage media".
- `homemedia.home_label` — the action-phrased card title for a `home` service
  (e.g. `"Watch the library"`); falls back to `homemedia.name`.

With **no** service marked `homemedia.placement=home`, the landing view is the
plain grouped dashboard, unchanged. Every card shows `homemedia.description`; set
a meaningful one on each service — a missing one falls back to a fixed generic
sentence. See
[`specs/002-friendly-home-view/`](specs/002-friendly-home-view/).

## Icon attribution

Service icons are resolved from a small set bundled into the build under
[`src/lib/icons/`](src/lib/icons/); **no icon is fetched at runtime**. The
non-authored glyphs are from the
[Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) project
(© 2024 Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs), used under
the Apache License 2.0. The full licence, an attribution `NOTICE`, and the pinned
upstream revision are in
[`src/lib/icons/LICENSE`](src/lib/icons/LICENSE),
[`src/lib/icons/NOTICE`](src/lib/icons/NOTICE), and
[`src/lib/icons/PROVENANCE.md`](src/lib/icons/PROVENANCE.md).

All product names, trademarks, and registered trademarks are the property of
their respective owners; icons are used for identification purposes only and do
not imply endorsement.
