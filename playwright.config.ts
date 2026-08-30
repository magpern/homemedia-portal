import { defineConfig } from '@playwright/test';
import { HARNESS_PING_PATH, HTTPS_ORIGIN } from './tests/harness/ports.js';

/**
 * E2E runs against the **built** adapter-node app behind a throwaway local TLS
 * terminator (research R11), so the real `Secure` / `__Host-` cookie path is
 * exercised. `ignoreHTTPSErrors` covers the harness's self-signed certificate;
 * the origin is still `https://`, i.e. a secure context. For a locally trusted
 * CA instead, see `tests/harness/README.md`.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: HTTPS_ORIGIN,
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'npm run build && node tests/harness/serve-https.mjs',
		url: `${HTTPS_ORIGIN}${HARNESS_PING_PATH}`,
		ignoreHTTPSErrors: true,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 180_000
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
