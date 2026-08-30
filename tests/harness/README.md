# Local-HTTPS e2e harness

Test tooling only. **Not shipped in the container image, not part of any
deployment or CI publish.**

## Why

The production session cookie is `__Host-hmp_session` with `Secure`. A browser
will not store or return such a cookie over plain HTTP, so auth/session flows
must be validated over `https://` (research decision **R11**). Weakening the
cookie for tests is forbidden.

## What runs

`npm run test:e2e` builds the app, then runs `run-e2e.mjs`, which:

1. calls `startHarness()` in `serve-https.mjs`:
    - starts the **built** `@sveltejs/adapter-node` server with `HOST=localhost`
      and `PORT=0` (an **OS-assigned ephemeral port, localhost-bound**), reading
      the address it actually bound from its stdout banner;
    - puts an HTTPS terminator in front of it, also `localhost`-bound on its own
      ephemeral port (`listen(0, 'localhost')`), self-signed certificate
      generated in memory each run — nothing is written to disk — injecting
      `X-Forwarded-Proto: https`;
    - `assertLoopback()` re-checks each listener's bound address is a real OS
      loopback address (no external connectivity test);
    - serves a few harness-only fixture routes under `/__https-harness__/` (a
      readiness ping, and a `Secure`-cookie set/echo pair used by the WP11a
      smoke test). These exist only in the terminator — the application gains no
      routes;
2. runs `playwright test`, passing the terminator's chosen
   `https://localhost:<ephemeral>` origin in `HMP_E2E_HTTPS_URL`
   (`playwright.config.ts` reads it into `use.baseURL`);
3. tears the harness down on every exit path.

**No IP address or concrete port number is written in any tracked file** — the
only host is `localhost` and every port is chosen by the OS at run time.

`playwright.config.ts` defines two projects: a 360 × 780 mobile viewport and the
same with `reducedMotion: 'reduce'`, both with `ignoreHTTPSErrors: true` (the
origin is still a secure context, so the real `Secure` cookie path is
exercised).

## Running

```sh
npx playwright install chromium   # once
npm run test:e2e
```

Extra arguments are forwarded to `playwright test`, e.g.
`npm run test:e2e -- --project=mobile`.

## Locally trusted certificate (optional)

The default harness uses a self-signed certificate plus `ignoreHTTPSErrors`. If
you prefer a certificate your browser trusts with no flag, run the pieces
yourself: start the built server (`node build` with `PORT` and `ORIGIN` set),
note the port it prints, and put a terminator with a local CA in front of it —
either Caddy (`caddy reverse-proxy --from https://localhost:PORT --to
localhost:PORT`, which provisions and trusts a local CA automatically) or
`npx local-ssl-proxy --source PORT --target PORT` (self-signed; still needs
`ignoreHTTPSErrors`). Set the built server's `ORIGIN` to the `https://localhost`
origin in either case.
