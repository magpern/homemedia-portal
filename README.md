# homemedia-portal

A curated, mobile-first internal service directory for one private home server —
a single polished page that lists the services the operator has explicitly
labelled, shows whether each is running, and links through to them. Reached from
outside the home network only through an existing, separately operated HTTPS
reverse proxy; the portal terminates no TLS and owns no public network edge.

## Status

In development, spec-driven. It is **not deployable yet** — no Dockerfile,
Compose, CI, or deployment configuration exists in this repository at this stage.

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
