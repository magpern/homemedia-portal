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
import { chromium } from '@playwright/test';
import { startHarness } from './serve-https.mjs';
import { startDockerMock } from './docker-mock.mjs';
import {
	E2E_DOCKER_MOCK_ENV,
	E2E_PASSWORD_ENV,
	E2E_SERVICE_LINK_BASE,
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

// Stub Docker source for the dashboard specs, wired in before the app starts.
const dockerMock = await startDockerMock();
process.env.DOCKER_PROXY_URL = dockerMock.url;
process.env.SERVICE_LINK_BASE = E2E_SERVICE_LINK_BASE;

const harness = await startHarness();

/**
 * The `pwa` Playwright project needs the full `channel: 'chromium'` build (real
 * Service-Worker threads + Chrome's installability CDP calls). Run it whenever
 * that browser can launch
 * — always in CI (`playwright install --with-deps chromium`), and locally when
 * the host has the libraries. A library-starved sandbox cannot, so the project
 * is left out there with a clear message rather than failing the run.
 */
async function fullChromiumUsable() {
	try {
		const browser = await chromium.launch({ channel: 'chromium' });
		await browser.close();
		return true;
	} catch (err) {
		return String(err?.message ?? err);
	}
}

const projects = ['mobile', 'mobile-reduced-motion'];
const explicitProject = process.argv.slice(2).some((a) => a.startsWith('--project'));
if (!explicitProject) {
	const chromium1 = await fullChromiumUsable();
	if (chromium1 === true) {
		projects.push('pwa');
	} else {
		console.warn(
			`\n[run-e2e] SKIPPING the "pwa" project: full Chrome for Testing could not launch ` +
				`in this environment — it runs in CI. Reason: ${chromium1}\n`
		);
	}
}
const projectArgs = explicitProject ? [] : projects.flatMap((p) => ['--project', p]);

let stopping = false;
async function stopHarness() {
	if (stopping) return;
	stopping = true;
	await harness.stop().catch(() => {});
	await dockerMock.stop().catch(() => {});
}

const playwright = spawn(
	process.execPath,
	[playwrightCli, 'test', ...projectArgs, ...process.argv.slice(2)],
	{
		stdio: 'inherit',
		env: {
			...process.env,
			[HTTPS_URL_ENV]: harness.httpsUrl,
			[E2E_USERNAME_ENV]: e2eUsername,
			[E2E_PASSWORD_ENV]: e2ePassword,
			[E2E_SESSION_SECRET_ENV]: e2eSessionSecret,
			[E2E_DOCKER_MOCK_ENV]: dockerMock.url
		}
	}
);

playwright.on('exit', async (code, signal) => {
	await stopHarness();
	process.exit(signal ? 1 : (code ?? 1));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		playwright.kill(sig);
	});
}
