/**
 * Shared constants for the local-HTTPS end-to-end harness (research R11).
 *
 * Test-only. **No port numbers, hostnames, IPs, or paths that mean anything to a
 * deployment appear here or anywhere else in the tree** — the harness binds
 * OS-assigned **ephemeral** loopback ports at run time (`listen(0)` / `PORT=0`)
 * and passes the resulting `https://` origin to Playwright through
 * `HMP_E2E_HTTPS_URL`.
 *
 * Imported by `serve-https.mjs`, `run-e2e.mjs`, `playwright.config.ts`, and the
 * e2e specs.
 */

/** Env var carrying the harness's chosen `https://localhost:<ephemeral>` origin. */
export const HTTPS_URL_ENV = 'HMP_E2E_HTTPS_URL';

/** Harness-only fixture paths — served by the terminator, never by the app. */
export const HARNESS_PREFIX = '/__https-harness__';
export const HARNESS_PING_PATH = `${HARNESS_PREFIX}/ping`;
export const HARNESS_SET_COOKIE_PATH = `${HARNESS_PREFIX}/set-cookie`;
export const HARNESS_ECHO_PATH = `${HARNESS_PREFIX}/echo`;

/** Name of the `Secure` cookie the fixture sets, for the smoke assertion. */
export const HARNESS_PROBE_COOKIE = '__hmp_https_probe';
