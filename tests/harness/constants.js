/**
 * Shared constants for the local-HTTPS end-to-end harness (research R11).
 *
 * Test-only. **No IP addresses or concrete port numbers appear here or anywhere
 * else in the tree** — both listeners are `localhost`-bound on OS-assigned
 * **ephemeral** ports chosen at run time (`listen(0, 'localhost')` / `HOST=localhost`
 * `PORT=0`), and the resulting `https://` origin is passed to Playwright through
 * `HMP_E2E_HTTPS_URL`.
 *
 * Imported by `serve-https.mjs`, `run-e2e.mjs`, `playwright.config.ts`, and the
 * e2e specs.
 */

/** The only host the harness ever binds or connects to. */
export const HARNESS_HOST = 'localhost';

/** Env var carrying the harness's chosen `https://localhost:<ephemeral>` origin. */
export const HTTPS_URL_ENV = 'HMP_E2E_HTTPS_URL';

/** Harness-only fixture paths — served by the terminator, never by the app. */
export const HARNESS_PREFIX = '/__https-harness__';
export const HARNESS_PING_PATH = `${HARNESS_PREFIX}/ping`;
export const HARNESS_SET_COOKIE_PATH = `${HARNESS_PREFIX}/set-cookie`;
export const HARNESS_ECHO_PATH = `${HARNESS_PREFIX}/echo`;

/** Name of the `Secure` cookie the fixture sets, for the smoke assertion. */
export const HARNESS_PROBE_COOKIE = '__hmp_https_probe';

/**
 * Env vars carrying the throwaway credentials the harness generates each run for
 * the auth/session e2e specs. The password and secret are random per run and
 * never written to a tracked file (Constitution IX).
 */
export const E2E_USERNAME_ENV = 'HMP_E2E_USERNAME';
export const E2E_PASSWORD_ENV = 'HMP_E2E_PASSWORD';
export const E2E_SESSION_SECRET_ENV = 'HMP_E2E_SESSION_SECRET';

/**
 * Env var carrying the base URL of the run's in-process Docker-API mock (a stub
 * `docker-socket-proxy`). The dashboard e2e specs POST `{mode}` to
 * `<url>/__control` to switch between the normal / per-inspect-failure /
 * discovery-failure fixtures. Test tooling only.
 */
export const E2E_DOCKER_MOCK_ENV = 'HMP_E2E_DOCKER_MOCK_URL';

/** Bare host the dashboard e2e uses to build `homemedia.port` links (never real). */
export const E2E_SERVICE_LINK_BASE = 'link-base.invalid';

/**
 * `homemedia.port` field bounds (mirrors `src/lib/server/labels.ts` — the TCP
 * range, not a deployment port) and an arbitrary in-range value for the
 * dashboard fixture, derived so no concrete port number is written literally.
 */
export const HOMEMEDIA_PORT_MIN = 1;
export const E2E_FIXTURE_PORT = HOMEMEDIA_PORT_MIN + 1;
