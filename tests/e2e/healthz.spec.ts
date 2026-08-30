import { setDockerMode } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP10 — `GET /healthz` over the local-HTTPS harness (spec FR-025, US5;
 * `contracts/http-routes.md`). No session, no viewport dependence — `mobile`
 * project only.
 */

test.describe('health endpoint (WP10)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern here
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'health behaviour is viewport-agnostic');
	});

	test('is reachable without a session and reports ok', async ({ request }) => {
		const res = await request.get('/healthz', { maxRedirects: 0 });
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('application/json');
		expect(res.headers()['cache-control']).toBe('no-store');
		expect(res.headers()['location']).toBeUndefined();
		expect(await res.json()).toEqual({ status: 'ok' });
	});

	test('stays ok when the Docker source is unavailable (portal liveness != Docker)', async ({
		request
	}) => {
		await setDockerMode(request, 'discovery-fail');
		try {
			const res = await request.get('/healthz');
			expect(res.status()).toBe(200);
			expect(await res.json()).toEqual({ status: 'ok' });
		} finally {
			await setDockerMode(request, 'normal');
		}
	});

	test('the body discloses nothing beyond status', async ({ request }) => {
		const body = await (await request.get('/healthz')).text();
		expect(body).toBe('{"status":"ok"}');
	});
});
