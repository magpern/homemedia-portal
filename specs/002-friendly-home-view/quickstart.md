# Quickstart / Validation: Friendly Home View

End-to-end validation for this feature. Portal v1's quickstart still applies for
everything not listed here (auth over local HTTPS, PWA install signal, static-only cache,
health endpoint, discovery isolation). Concrete infrastructure values live only in the
operator's untracked notes.

---

## 1. Build & static checks

```
npm ci
npm run check      # svelte-check / types — 0 errors
npm run lint       # prettier + eslint — clean
npm run build      # production build succeeds
npm test           # vitest unit — all pass
```

## 2. Unit coverage this feature adds

- `homemedia.placement` parsing: `home` / `HOME` / ` home ` → `home`; absent / `""` /
  `tools` / `1` → `manage`.
- `homemedia.home_label` parsing: trimmed; blank → `null`.
- `resolveDescription`: raw wins; blank + `home` → primary constant; blank + `manage` →
  manage constant; never returns `""`.
- projection: `placement`, `homeLabel` carried; primary-card title resolves
  `home_label` → `name` → de-slugified name.
- dashboard assembly: `primary` = only `home` services sorted by order/name; `manage` =
  Portal v1 grouping of only `manage` services; `categories` still spans all; `primary ∩
  manage = ∅`; `manageCount` correct.
- no-home fallback: model with zero `home` services → `primary: []`, and `+page.svelte`
  renders `categories` (asserted by component/e2e).
- service-worker source-structure guard: unchanged precache list `[...build, ...files]`
  and network-only fetch handler (the existing test must still pass verbatim).

## 3. e2e (`tests/e2e/friendly-home-view.spec.ts`, mobile project, via the HTTPS harness)

Driven by the in-process stub socket-proxy (`tests/harness/docker-mock.mjs`) with a
fixture that marks two services `placement=home` and the rest `manage`.

1. **Two-region layout** — landing view shows exactly the two primary cards above a
   collapsed "Manage media"; no `manage` tile is visible before expanding.
2. **Viewport fit** — at 360 × 780, both complete primary cards are within the viewport
   (`boundingBox().y + height <= 780`), no horizontal scroll.
3. **Disclosure** — `<summary>` is keyboard-focusable; `Enter`/click expands; the count in
   the summary matches the number of `manage` services; activating again collapses.
4. **Search across regions** — a query matching only a `manage` service force-opens the
   disclosure, shows only matches + "showing X of Y"; clearing the query re-collapses and
   restores the primary cards. A query matching a primary service filters the primary
   region. A no-match query shows the empty state.
5. **No-home fallback** — switch the fixture so no service is `home`; reload → the
   Portal v1 grouped dashboard renders, no "Manage media" section, no primary region.
6. **Unlabelled invisibility** — an `homemedia.enable` absent container never appears in
   either region, the counts, or the summary text.
7. **Description fallback** — a `home` and a `manage` service with no `homemedia.description`
   each show their placement's fallback sentence; a curated one shows its own text.
8. **Friendly identity** — document title and `<h1>` read "Home media"; manifest `name` /
   `short_name` use the friendly identity.
9. **Status / LAN-only retained** — a stopped `home` service still renders its card with a
   quiet "not running" status; a `lan_only` service still shows its marker.
10. **axe** — no serious/critical violations on the landing view, run once normally and
    once with `reducedMotion: 'reduce'`; the disclosure has an accessible name; one `<h1>`;
    all interactive targets ≥ 44 px.

## 4. Regression (Portal v1 checks continue to pass)

`npm run test:e2e` — the existing auth, dashboard, discovery-isolation, a11y, mobile, and
`pwa` specs all pass unchanged. `/healthz` unchanged. `__Host-` cookie attributes
unchanged. CSP / security headers unchanged. Both Docker failure modes unchanged.

## 5. Manual browser pass (through the working HTTPS route)

Sign in → landing view shows the two primary cards → open each (new tab, portal stays) →
expand "Manage media", confirm the operator tools grouped as before → search a tool name,
confirm the section opens with a count → clear, confirm it re-collapses → sign out →
re-check at a 360 × 780 window → hit `/healthz` unauthenticated → stop the socket-proxy
and reload, confirm the "service directory unavailable" state (no list).

## 6. Disclosure & secrets gate — run before every commit

Run `scripts/disclosure-scan.sh` (the Portal v1 quickstart §9 allowlist scan, no artifact
excluded) — it must print `authored-tree clean`. Then a manual review for: private service
names, inventory→icon-id mappings, and any image digest in a tracked file. The only
`sha256:` digest permitted in the authored tree is the `Dockerfile` base-image pin
(unchanged by this feature); a portal image digest belongs only in the operator's
untracked deployment config, never in a spec, PR body, commit message, or `docs/`.
