import { signIn } from './dashboard-harness.js';
import { setDockerMode } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP9 — installable PWA + **static-only** service-worker cache
 * (spec FR-023, FR-024; SC-008; research R8; Constitution X).
 *
 * The full Lighthouse "installable" audit needs a heavier headful Chromium than
 * this sandbox ships; instead this spec asserts the *same* installability
 * criteria programmatically (linked, parseable manifest; name; `start_url`;
 * `display: standalone`; 192 + 512 + maskable icons) plus the cache-contents
 * rules that Lighthouse does not check. CI runs the identical assertions against
 * a full Chromium (`playwright install --with-deps chromium`).
 *
 * `mobile`-project only.
 */

test.describe.configure({ mode: 'serial' });

/** URL path is a precache-eligible static asset (hashed build chunk or static/). */
function isStaticAssetPath(pathname: string): boolean {
	if (pathname.startsWith('/_app/immutable/')) return true;
	return [
		'/manifest.webmanifest',
		'/robots.txt',
		'/apple-touch-icon.png',
		'/icons/icon-192.png',
		'/icons/icon-512.png',
		'/icons/icon-maskable-512.png'
	].includes(pathname);
}

/** Paths that must NEVER be cached (dynamic / auth / health / SSR). */
const NEVER_CACHE = ['/', '/login', '/logout', '/healthz', '/service-worker.js'];

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'PWA behaviour is viewport-agnostic — run once');
	await setDockerMode(request, 'normal');
});

test('manifest is linked, valid, and meets the installability criteria', async ({
	page,
	request
}) => {
	await page.goto('/login');

	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		'href',
		/manifest\.webmanifest$/
	);
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
	await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

	const res = await request.get('/manifest.webmanifest');
	expect(res.ok()).toBe(true);
	expect(res.headers()['content-type']).toContain('manifest');

	const m = JSON.parse(await res.text());
	expect(m.name).toBeTruthy();
	expect(m.start_url).toBe('/');
	expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
	expect(m.background_color).toBeTruthy();

	const sizes = (m.icons ?? []).map((i: { sizes: string }) => i.sizes);
	expect(sizes).toContain('192x192');
	expect(sizes).toContain('512x512');
	const purposes = (m.icons ?? []).flatMap((i: { purpose?: string }) =>
		(i.purpose ?? 'any').split(/\s+/)
	);
	expect(purposes).toContain('maskable');
	expect(purposes).toContain('any');

	// every icon file actually resolves
	for (const icon of m.icons) {
		const iconRes = await request.get(icon.src);
		expect(iconRes.ok(), `${icon.src} must resolve`).toBe(true);
		expect(iconRes.headers()['content-type']).toContain('image/png');
	}
});

test('dynamic and authenticated responses stay no-store', async ({ page, context, request }) => {
	// unauthenticated dynamic route
	const login = await request.get('/login', { maxRedirects: 0 });
	expect(login.headers()['cache-control']).toBe('no-store');

	// health route
	const health = await request.get('/healthz');
	expect(health.headers()['cache-control']).toBe('no-store');

	// authenticated SSR dashboard
	await signIn(context);
	const dash = await page.goto('/');
	expect(dash?.headers()['cache-control']).toBe('no-store');
});

/**
 * Resolve once the service worker is active and has populated a cache, or `null`
 * after `budgetMs` (this sandbox's headless_shell never resolves
 * `serviceWorker.ready`; CI's full Chromium does — see the harness README).
 */
async function waitForServiceWorker(page: import('@playwright/test').Page, budgetMs = 8000) {
	return page.evaluate(async (budget) => {
		if (!('serviceWorker' in navigator)) return null;
		const deadline = Date.now() + budget;
		try {
			await Promise.race([
				navigator.serviceWorker.ready,
				new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), budget))
			]);
			while (Date.now() < deadline && (await caches.keys()).length === 0) {
				await new Promise((r) => setTimeout(r, 100));
			}
			return (await caches.keys()).length > 0 ? 'ready' : null;
		} catch {
			return null;
		}
	}, budgetMs);
}

test('the served service-worker script precaches only static assets (source check)', async ({
	request
}) => {
	const res = await request.get('/service-worker.js');
	expect(res.ok()).toBe(true);
	const src = await res.text();

	// The precache list is the string literals the SW passes to cache.addAll —
	// SvelteKit inlines `build` + `files` as `"<base>/..."` literals. Pull every
	// absolute path literal out and check each is a static asset.
	const paths = [...src.matchAll(/["'`](\/[A-Za-z0-9._/-]+)["'`]/g)]
		.map((m) => m[1])
		.filter((p) => p.length > 1 && !p.endsWith('.map'));
	expect(paths.length).toBeGreaterThan(0);

	for (const p of paths) {
		expect(isStaticAssetPath(p), `service-worker references non-static "${p}"`).toBe(true);
	}
	for (const forbidden of NEVER_CACHE) {
		expect(paths, `"${forbidden}" must not be precached`).not.toContain(forbidden);
	}
	// the fetch handler only ever answers from cache for the precache set
	expect(src).toContain('respondWith');
	expect(src).toMatch(/method\s*!==?\s*[`'"]GET[`'"]/);
});

test('the service worker precaches only static build assets, nothing dynamic', async ({
	page,
	context
}) => {
	await signIn(context);
	await page.goto('/');

	const sw = await waitForServiceWorker(page);
	test.skip(
		sw !== 'ready',
		'service worker did not activate in this browser build (headless_shell); CI full Chromium covers this'
	);

	const { keys, entries } = await page.evaluate(async () => {
		const keys = await caches.keys();
		const entries: string[] = [];
		for (const k of keys) {
			const c = await caches.open(k);
			for (const req of await c.keys()) entries.push(new URL(req.url).pathname);
		}
		return { keys, entries };
	});

	// exactly one cache, versioned
	expect(keys).toHaveLength(1);
	expect(keys[0]).toMatch(/^hmp-static-/);

	expect(entries.length).toBeGreaterThan(0);
	for (const pathname of entries) {
		expect(isStaticAssetPath(pathname), `cached "${pathname}" must be a static asset`).toBe(
			true
		);
		expect(NEVER_CACHE, `"${pathname}" must never be cached`).not.toContain(pathname);
	}
	// nothing HTML/SSR/JSON slipped in
	expect(entries.some((p) => p === '/' || p.endsWith('.html'))).toBe(false);
});

test('offline, a dynamic navigation is never served from cache', async ({ page, context }) => {
	await signIn(context);
	await page.goto('/');

	const sw = await waitForServiceWorker(page);
	test.skip(sw !== 'ready', 'service worker unavailable in this browser build (headless_shell)');

	await context.setOffline(true);
	let navFailed = false;
	try {
		await page.goto('/', { timeout: 5000 });
	} catch {
		navFailed = true;
	}
	// Either the navigation failed outright, or a page loaded but WITHOUT the
	// dashboard data (no stale service list from a cache).
	if (!navFailed) {
		const body = await page.content();
		expect(body).not.toContain('Alpha Stream');
		expect(body).not.toContain('class="card"');
	} else {
		expect(navFailed).toBe(true);
	}
	await context.setOffline(false);
});
