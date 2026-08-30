/**
 * `npm run test:e2e` entry point.
 *
 * Owns the harness lifecycle so no port number has to be known ahead of time:
 *   1. {@link startHarness} builds the app and starts the TLS terminator +
 *      adapter on OS-assigned ephemeral loopback ports;
 *   2. its chosen `https://` origin is handed to `playwright test` via
 *      `HMP_E2E_HTTPS_URL` (see `playwright.config.ts`);
 *   3. the harness is torn down on every exit path.
 *
 * Test tooling only. Extra CLI args are forwarded to `playwright test`.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startHarness } from './serve-https.mjs';
import { HTTPS_URL_ENV } from './constants.js';

const require = createRequire(import.meta.url);
const playwrightCli = path.join(
	path.dirname(require.resolve('@playwright/test/package.json')),
	'cli.js'
);

const harness = await startHarness();

let stopping = false;
async function stopHarness() {
	if (stopping) return;
	stopping = true;
	await harness.stop().catch(() => {});
}

const playwright = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: { ...process.env, [HTTPS_URL_ENV]: harness.httpsUrl }
});

playwright.on('exit', async (code, signal) => {
	await stopHarness();
	process.exit(signal ? 1 : (code ?? 1));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		playwright.kill(sig);
	});
}
