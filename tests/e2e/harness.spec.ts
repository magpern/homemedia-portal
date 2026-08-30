import {
	HARNESS_ECHO_PATH,
	HARNESS_PROBE_COOKIE,
	HARNESS_SET_COOKIE_PATH
} from '../harness/constants.js';
import { expect, test } from './fixtures.js';

/**
 * WP11a smoke test — proves the local-HTTPS harness works end to end:
 *   1. the built app is reachable through an `https://` origin;
 *   2. a browser stores and returns a `Secure` cookie set over that origin.
 *
 * No login, session, or production cookie behaviour is exercised here — that is
 * WP2/WP3. The cookie is set by a harness-only fixture route, never by the app.
 */

test('the built app is served over HTTPS with the base security headers', async ({ page }) => {
	const response = await page.goto('/');
	expect(response, 'navigation response').not.toBeNull();
	expect(response!.url()).toMatch(/^https:\/\//);
	expect(response!.status()).toBeLessThan(500);

	const headers = response!.headers();
	expect(headers['content-security-policy']).toContain("default-src 'self'");
	expect(headers['content-security-policy']).not.toContain('unsafe-inline');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('same-origin');
	expect(headers['cache-control']).toBe('no-store');
});

test('a Secure cookie set over the HTTPS origin is stored and sent back', async ({
	page,
	context
}) => {
	await page.goto(HARNESS_SET_COOKIE_PATH);

	const probe = (await context.cookies()).find((c) => c.name === HARNESS_PROBE_COOKIE);
	expect(probe, 'probe cookie present').toBeTruthy();
	expect(probe!.secure, 'cookie marked Secure').toBe(true);

	const echo = await page.goto(HARNESS_ECHO_PATH);
	expect(await echo!.text()).toContain(`${HARNESS_PROBE_COOKIE}=1`);
});
