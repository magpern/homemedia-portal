import type { APIRequestContext, BrowserContext } from '@playwright/test';
import {
	E2E_DOCKER_MOCK_ENV,
	E2E_SESSION_SECRET_ENV,
	E2E_USERNAME_ENV,
	HTTPS_URL_ENV
} from '../harness/constants.js';
import { forgeSessionToken, THIRTY_DAYS_SECONDS } from './session-token.js';

const COOKIE = '__Host-hmp_session';

const origin = () => process.env[HTTPS_URL_ENV] ?? '';
const mockBase = () => process.env[E2E_DOCKER_MOCK_ENV] ?? '';

/**
 * Attach a valid `__Host-hmp_session` cookie signed with the run's real
 * `SESSION_SECRET`, so the dashboard specs are authenticated without touching
 * the shared login throttle. The server's own `verifySession` accepts it.
 */
export async function signIn(context: BrowserContext): Promise<void> {
	const iat = Math.floor(Date.now() / 1000);
	const token = forgeSessionToken({
		sub: process.env[E2E_USERNAME_ENV] ?? '',
		iat,
		exp: iat + THIRTY_DAYS_SECONDS,
		secret: process.env[E2E_SESSION_SECRET_ENV] ?? ''
	});
	await context.addCookies([
		{ name: COOKIE, value: token, url: origin(), httpOnly: true, sameSite: 'Lax' }
	]);
}

/** Switch the stub Docker source between `normal` / `inspect-fail` / `discovery-fail`. */
export async function setDockerMode(
	request: APIRequestContext,
	mode: 'normal' | 'inspect-fail' | 'discovery-fail'
): Promise<void> {
	const res = await request.post(new URL('/__control', mockBase()).href, { data: { mode } });
	if (!res.ok()) throw new Error(`docker mock refused mode "${mode}" (${res.status()})`);
}

/** One raw container as the stub Docker source returns it (`GET /containers/json`). */
export interface MockContainer {
	Id: string;
	Names: string[];
	Image: string;
	State: string;
	Labels: Record<string, string>;
}

/**
 * Replace the stub Docker fixture with `containers` (curation-lifecycle spec,
 * WP8). The portal is SSR, so the change takes effect on the next navigation to
 * `/` with **no server restart** — the operator-edits-a-label scenario. Call
 * with `null` to restore the default fixture.
 */
export async function setCurationFixture(
	request: APIRequestContext,
	containers: MockContainer[] | null,
	inspect?: Record<string, unknown>
): Promise<void> {
	const data = containers ? { mode: 'normal', containers, inspect } : { mode: 'normal' };
	const res = await request.post(new URL('/__control', mockBase()).href, { data });
	if (!res.ok()) throw new Error(`docker mock refused curation fixture (${res.status()})`);
}
