import { defineConfig } from '@playwright/test';
import { HTTPS_URL_ENV } from './tests/harness/constants.js';

/**
 * E2E runs against the **built** adapter-node app behind a throwaway local TLS
 * terminator (research R11), so the real `Secure` / `__Host-` cookie path is
 * exercised. `ignoreHTTPSErrors` covers the harness's self-signed certificate;
 * the origin is still `https://`, i.e. a secure context.
 *
 * Both harness listeners are `localhost`-bound on OS-assigned **ephemeral**
 * ports, so there is no `webServer` block here — `tests/harness/run-e2e.mjs`
 * (the `test:e2e` script) starts the harness and passes its chosen
 * `https://localhost` origin in `HMP_E2E_HTTPS_URL`. `tests/harness/README.md`
 * documents a locally trusted CA alternative.
 */
// Set by `tests/harness/run-e2e.mjs` (the `test:e2e` script). Running
// `playwright test` directly without it leaves `baseURL` unset and the specs
// fail fast with a clear Playwright error.
const httpsOrigin = process.env[HTTPS_URL_ENV];

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: httpsOrigin,
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'mobile',
			use: { viewport: { width: 360, height: 780 } }
		},
		{
			name: 'mobile-reduced-motion',
			use: { viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }
		}
	]
});
