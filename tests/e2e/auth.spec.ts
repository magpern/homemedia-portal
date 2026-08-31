import {
	E2E_PASSWORD_ENV,
	E2E_SESSION_SECRET_ENV,
	E2E_USERNAME_ENV,
	HTTPS_URL_ENV
} from '../harness/constants.js';
import type { Cookie } from '@playwright/test';
import { forgeSessionToken, THIRTY_DAYS_SECONDS } from './session-token.js';
import { setField } from './form.js';
import { expect, test } from './fixtures.js';

/**
 * WP2 auth flow, exercised over the local-HTTPS harness (research R11) so the
 * real `Secure` / `__Host-` cookie path runs. Plain HTTP stays non-auth-only.
 *
 * Serial + single project: these tests share one in-process login throttle
 * (keyed by client IP), so they must not run concurrently. Every failed-login
 * attempt lives in the final test; each earlier test does zero failed attempts.
 */

const USERNAME = process.env[E2E_USERNAME_ENV] ?? '';
const PASSWORD = process.env[E2E_PASSWORD_ENV] ?? '';
const SECRET = process.env[E2E_SESSION_SECRET_ENV] ?? '';
const ORIGIN = process.env[HTTPS_URL_ENV] ?? '';
const COOKIE = '__Host-hmp_session';

const sessionCookie = (cookies: Cookie[]) => cookies.find((c) => c.name === COOKIE);

/** A cookie entry for `context.addCookies` (host-only, scoped by the https `url`). */
const cookieEntry = (value: string) => ({
	name: COOKIE,
	value,
	url: ORIGIN,
	httpOnly: true,
	sameSite: 'Lax' as const
});

test.describe('authentication (WP2)', () => {
	test.describe.configure({ mode: 'serial', retries: 0 });

	// eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern here
	test.beforeEach(async ({}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile',
			'auth behaviour is viewport-agnostic — run once'
		);
		test.skip(!PASSWORD || !SECRET, 'harness credentials absent — run via `npm run test:e2e`');
	});

	async function submitLogin(page: import('@playwright/test').Page, password: string) {
		await page.goto('/login');
		await setField(page, '#password', password);
		const [response] = await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login'
			),
			page.click('button[type="submit"]')
		]);
		return response;
	}

	test('successful login issues __Host-hmp_session with the exact attributes', async ({
		page,
		context
	}) => {
		await submitLogin(page, PASSWORD);
		await page.waitForURL(`${ORIGIN}/`);
		await expect(page.locator('h1')).toHaveText('Home media');

		const cookie = sessionCookie(await context.cookies());
		expect(cookie, 'session cookie present').toBeTruthy();
		expect(cookie!.secure).toBe(true);
		expect(cookie!.httpOnly).toBe(true);
		expect(cookie!.sameSite).toBe('Lax');
		expect(cookie!.path).toBe('/');
		// `__Host-` implies host-only — the browser stored it only because there is
		// no Domain attribute.
		expect(cookie!.domain).toBe('localhost');
		const expectedExpiry = Date.now() / 1000 + THIRTY_DAYS_SECONDS;
		expect(Math.abs(cookie!.expires - expectedExpiry)).toBeLessThan(120);
	});

	test('the session survives a fresh browser context (stateless, no server store)', async ({
		browser
	}) => {
		const first = await browser.newContext({ baseURL: ORIGIN, ignoreHTTPSErrors: true });
		const firstPage = await first.newPage();
		await firstPage.goto('/login');
		await setField(firstPage, '#password', PASSWORD);
		await firstPage.click('button[type="submit"]');
		await firstPage.waitForURL(`${ORIGIN}/`);
		const token = sessionCookie(await first.cookies())!.value;
		await first.close();

		const second = await browser.newContext({ baseURL: ORIGIN, ignoreHTTPSErrors: true });
		await second.addCookies([cookieEntry(token)]);
		const secondPage = await second.newPage();
		const res = await secondPage.goto('/');
		expect(res!.url()).toBe(`${ORIGIN}/`);
		await expect(secondPage.locator('h1')).toHaveText('Home media');
		await second.close();
	});

	test('logout clears the cookie and re-guards the app', async ({ page, context }) => {
		await submitLogin(page, PASSWORD);
		await page.waitForURL(`${ORIGIN}/`);

		await page.click('form[action="/logout"] button[type="submit"]');
		await page.waitForURL(/\/login$/);

		expect(sessionCookie(await context.cookies())).toBeUndefined();
		const res = await page.goto('/');
		expect(res!.url()).toContain('/login');
	});

	test('an expired session cookie is rejected (SC-014)', async ({ page, context }) => {
		const iat = Math.floor(Date.now() / 1000) - THIRTY_DAYS_SECONDS - 100;
		await context.addCookies([
			cookieEntry(
				forgeSessionToken({
					sub: USERNAME,
					iat,
					exp: iat + THIRTY_DAYS_SECONDS,
					secret: SECRET
				})
			)
		]);
		const res = await page.goto('/');
		expect(res!.url()).toContain('/login');
	});

	test('a cookie not signed by the current SESSION_SECRET is rejected (rotation, SC-013)', async ({
		page,
		context
	}) => {
		const iat = Math.floor(Date.now() / 1000);
		await context.addCookies([
			cookieEntry(
				forgeSessionToken({
					sub: USERNAME,
					iat,
					exp: iat + THIRTY_DAYS_SECONDS,
					secret: `rotated-${SECRET}-different`
				})
			)
		]);
		const res = await page.goto('/');
		expect(res!.url()).toContain('/login');
	});

	test('rejected credentials are generic, and repeated failures are throttled (FR-004, FR-005)', async ({
		page,
		context
	}) => {
		const alert = page.locator('[role="alert"]');

		for (let attempt = 1; attempt <= 5; attempt++) {
			const res = await submitLogin(page, 'definitely-not-the-password');
			expect(res.status(), 'generic failure re-renders at 200').toBe(200);
			await expect(alert).toHaveText('Invalid credentials.');
			expect(page.url()).toContain('/login');
			expect(sessionCookie(await context.cookies())).toBeUndefined();
		}

		// 6th attempt: refused before verification, HTTP 429.
		const throttled = await submitLogin(page, 'definitely-not-the-password');
		expect(throttled.status()).toBe(429);
		await expect(alert).toContainText(/too many attempts/i);

		// The correct password is refused during the cool-off too.
		const stillBlocked = await submitLogin(page, PASSWORD);
		expect(stillBlocked.status()).toBe(429);
		await expect(alert).toContainText(/too many attempts/i);

		const res = await page.goto('/');
		expect(res!.url()).toContain('/login');
	});
});
