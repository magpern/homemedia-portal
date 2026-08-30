/**
 * `npm run test:e2e` entry point.
 *
 * Owns the harness lifecycle so no port number has to be known ahead of time:
 *   1. generate a throwaway household credential + session secret for this run
 *      and put the derived values in `process.env` for the adapter child;
 *   2. {@link startHarness} builds the app and starts the TLS terminator +
 *      adapter on OS-assigned ephemeral loopback ports;
 *   3. its chosen `https://` origin and the run's plaintext credential are handed
 *      to `playwright test` via env vars (see `playwright.config.ts` + specs);
 *   4. the harness is torn down on every exit path.
 *
 * Test tooling only. Extra CLI args are forwarded to `playwright test`.
 * The password and session secret are random per run and never written to disk.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startHarness } from './serve-https.mjs';
import {
	E2E_PASSWORD_ENV,
	E2E_SESSION_SECRET_ENV,
	E2E_USERNAME_ENV,
	HTTPS_URL_ENV
} from './constants.js';
import { realArgon2idPhc } from './passwords.js';

const require = createRequire(import.meta.url);
const playwrightCli = path.join(
	path.dirname(require.resolve('@playwright/test/package.json')),
	'cli.js'
);

// Throwaway credentials for this run.
const e2eUsername = 'portal-e2e';
const e2ePassword = randomBytes(18).toString('base64url');
const e2eSessionSecret = randomBytes(48).toString('base64');

process.env.PORTAL_USERNAME = e2eUsername;
process.env.SESSION_SECRET = e2eSessionSecret;
process.env.PORTAL_PASSWORD_ARGON2 = await realArgon2idPhc(e2ePassword);

const harness = await startHarness();

let stopping = false;
async function stopHarness() {
	if (stopping) return;
	stopping = true;
	await harness.stop().catch(() => {});
}

const playwright = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: {
		...process.env,
		[HTTPS_URL_ENV]: harness.httpsUrl,
		[E2E_USERNAME_ENV]: e2eUsername,
		[E2E_PASSWORD_ENV]: e2ePassword,
		[E2E_SESSION_SECRET_ENV]: e2eSessionSecret
	}
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
