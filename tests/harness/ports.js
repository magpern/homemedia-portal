/**
 * Loopback wiring for the local-HTTPS end-to-end harness (research R11).
 *
 * Test-only. These ports are arbitrary high loopback ports chosen for local test
 * runs — they are **not** the deployment port and carry no infrastructure
 * meaning. Override with env vars in CI if a port clashes.
 *
 * Single source of truth, imported by `serve-https.mjs`, `playwright.config.ts`,
 * and the e2e specs.
 */

/** Port the built adapter-node server listens on (plain HTTP, loopback). */
export const ADAPTER_HTTP_PORT = Number(process.env.HMP_E2E_HTTP_PORT ?? 41730);

/** Port the throwaway TLS terminator listens on (HTTPS, loopback). */
export const HTTPS_PORT = Number(process.env.HMP_E2E_HTTPS_PORT ?? 41731);

/** The `https://` origin Playwright points at. */
export const HTTPS_ORIGIN = `https://localhost:${HTTPS_PORT}`;

/** Harness-only fixture paths — served by the terminator, never by the app. */
export const HARNESS_PREFIX = '/__https-harness__';
export const HARNESS_PING_PATH = `${HARNESS_PREFIX}/ping`;
export const HARNESS_SET_COOKIE_PATH = `${HARNESS_PREFIX}/set-cookie`;
export const HARNESS_ECHO_PATH = `${HARNESS_PREFIX}/echo`;

/** Name of the `Secure` cookie the fixture sets, for the smoke assertion. */
export const HARNESS_PROBE_COOKIE = '__hmp_https_probe';
