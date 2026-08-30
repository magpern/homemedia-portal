# Local-HTTPS e2e harness

Test tooling only. **Not shipped in the container image, not part of any
deployment or CI publish.**

## Why

The production session cookie is `__Host-hmp_session` with `Secure`. A browser
will not store or return such a cookie over plain HTTP, so auth/session flows
must be validated over `https://` (research decision **R11**). Weakening the
cookie for tests is forbidden.

## What runs

`serve-https.mjs`:

1. starts the **built** `@sveltejs/adapter-node` server (`node build`) on a
   loopback HTTP port, with synthetic test env values if none are supplied;
2. puts an HTTPS terminator in front of it (self-signed certificate generated in
   memory each run — nothing is written to disk), injecting
   `X-Forwarded-Proto: https`;
3. serves a few harness-only fixture routes under `/__https-harness__/` (a
   readiness ping, and a `Secure`-cookie set/echo pair used by the WP11a smoke
   test). These exist only in the terminator — the application gains no routes.

`playwright.config.ts` points Playwright at the `https://` origin with
`ignoreHTTPSErrors: true` (the origin is still a secure context, so the real
`Secure` cookie path is exercised) and defines two projects: a 360 × 780 mobile
viewport and the same with `reducedMotion: 'reduce'`.

Ports come from `ports.js` and can be overridden with `HMP_E2E_HTTP_PORT` /
`HMP_E2E_HTTPS_PORT`.

## Running

```sh
npx playwright install chromium   # once
npm run test:e2e
```

## Locally trusted certificate (optional)

The default harness uses a self-signed certificate plus `ignoreHTTPSErrors`. If
you prefer a certificate your browser trusts with no flag, run the built server
yourself and put a terminator with a local CA in front of it — either:

```sh
# Caddy (provisions and trusts a local CA automatically)
caddy reverse-proxy --from https://localhost:<https-port> --to localhost:<http-port>
```

```sh
# or local-ssl-proxy (self-signed; still needs ignoreHTTPSErrors)
npx local-ssl-proxy --source <https-port> --target <http-port>
```

Set the built server's `ORIGIN` to the `https://localhost:<https-port>` origin in
either case.
