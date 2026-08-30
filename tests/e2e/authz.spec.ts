import { HTTPS_URL_ENV } from '../harness/constants.js';
import { expect, test } from './fixtures.js';

/**
 * WP3 authorization model over the local-HTTPS harness. No login is performed
 * here (so the shared login throttle is never touched) — only the
 * unauthenticated behaviour of the guard.
 */

const ORIGIN = process.env[HTTPS_URL_ENV] ?? '';

test.describe('route guard — unauthenticated (WP3)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern here
	test.beforeEach(async ({}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile',
			'guard behaviour is viewport-agnostic — run once'
		);
	});

	test('an app route redirects to /login carrying a safe redirectTo', async ({ page }) => {
		const res = await page.goto('/');
		expect(res!.url()).toBe(`${ORIGIN}/login?redirectTo=%2F`);
		// nothing from the guarded page leaked into the markup
		await expect(page.locator('h1')).toHaveText('Sign in');
	});

	test('a deep unauthenticated path reflects only the sanitized path', async ({ page }) => {
		const res = await page.goto('/some/deep/path');
		expect(res!.url()).toBe(`${ORIGIN}/login?redirectTo=%2Fsome%2Fdeep%2Fpath`);
	});

	test('an unsafe redirectTo query value is sanitized, never reflected', async ({ page }) => {
		await page.goto('/login?redirectTo=https://evil.example/x');
		await expect(page.locator('input[name="redirectTo"]')).toHaveValue('/');
	});

	test('/login itself is reachable without a session', async ({ page }) => {
		const res = await page.goto('/login');
		expect(res!.status()).toBe(200);
		await expect(page.locator('form button[type="submit"]')).toBeVisible();
	});

	test('a static asset is served without a redirect', async ({ page }) => {
		const res = await page.goto('/robots.txt');
		expect(res!.status()).toBe(200);
		expect(await res!.text()).toContain('Disallow');
	});

	test('an unauthenticated /api/* request gets 401 JSON, not a redirect', async ({ request }) => {
		const res = await request.get('/api/services');
		expect(res.status()).toBe(401);
		expect(res.headers()['content-type']).toContain('application/json');
		expect(await res.json()).toEqual({ error: 'unauthorized' });
		// no auth detail, no Location header
		expect(res.headers()['location']).toBeUndefined();
	});

	test('the guard redirect body carries no content and no auth detail', async ({ request }) => {
		const res = await request.get('/', { maxRedirects: 0 });
		expect(res.status()).toBe(302);
		expect(res.headers()['location']).toBe('/login?redirectTo=%2F');
		expect((await res.text()).trim()).toBe('');
	});
});
