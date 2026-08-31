import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { signIn, setDockerMode } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP9 — installable PWA + **static-only** service-worker cache
 * (spec FR-023, FR-024; SC-008; research R8; Constitution X).
 *
 * Runs in the `pwa` Playwright project (`channel: 'chromium'`): the default
 * `chromium-headless-shell` does not run Service-Worker threads, so the live
 * cache / offline checks and Chrome's own installability check need Chrome for
 * Testing. `tests/harness/run-e2e.mjs` includes this project whenever that
 * browser can launch — always in CI, and locally when the host has the
 * libraries; it is left out (with a printed message) on a library-starved
 * sandbox. Nothing here is silently skipped.
 *
 * T058 asks for "the Lighthouse installable audit". Lighthouse 12 removed the
 * PWA category and every installability audit; that audit was a wrapper over
 * Chrome's `Page.getAppManifest` / `Page.getInstallabilityErrors` CDP calls, so
 * this spec drives those directly — the authoritative browser-level check.
 *
 * The always-on, browser-independent guard on the same invariant is
 * `tests/unit/service-worker.spec.ts` (source structure) plus the
 * "served-script" check below.
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
const NEVER_CACHE = ['/', '/login', '/logout', '/healthz', '/service-worker.js', '/api/services'];

/** Read every cache name + the pathnames it holds, from the page context. */
async function cacheContents(page: import('@playwright/test').Page) {
	return page.evaluate(async () => {
		const reg = await navigator.serviceWorker.getRegistration();
		const keys = await caches.keys();
		const entries: string[] = [];
		for (const k of keys) {
			const c = await caches.open(k);
			for (const req of await c.keys()) entries.push(new URL(req.url).pathname);
		}
		return { swActive: !!reg?.active, keys, entries };
	});
}

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'pwa', 'runs only in the `pwa` project');
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

	for (const icon of m.icons) {
		const iconRes = await request.get(icon.src);
		expect(iconRes.ok(), `${icon.src} must resolve`).toBe(true);
		expect(iconRes.headers()['content-type']).toContain('image/png');
	}
});

test('Chrome reports the app as installable once the service worker is active', async () => {
	const origin = process.env.HMP_E2E_HTTPS_URL;
	expect(origin, 'harness origin').toBeTruthy();

	// `Page.getInstallabilityErrors` returns `in-incognito` for Playwright's
	// default (incognito) contexts, which would mask the real verdict — so run
	// this one check in a **persistent** (non-incognito) profile.
	const userDataDir = await mkdtemp(join(tmpdir(), 'hmp-pwa-'));
	const ctx = await chromium.launchPersistentContext(userDataDir, {
		channel: 'chromium',
		ignoreHTTPSErrors: true,
		args: ['--no-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost']
	});
	try {
		await signIn(ctx);
		const page = ctx.pages()[0] ?? (await ctx.newPage());
		const cdp = await ctx.newCDPSession(page);

		// 1. Open the app and wait until the worker has activated AND taken
		//    control (the SW `activate` handler calls `clients.claim()`), so
		//    Chrome evaluates installability against a live worker.
		await page.goto(new URL('/', origin).href);
		await expect
			.poll(
				async () =>
					page.evaluate(async () => {
						const reg = await navigator.serviceWorker.getRegistration();
						return !!reg?.active && !!navigator.serviceWorker.controller;
					}),
				{ timeout: 60_000, message: 'service worker should activate and control the page' }
			)
			.toBe(true);

		// Parsed-manifest errors (name, icons, start_url, display, …).
		const appManifest = await cdp.send('Page.getAppManifest');
		expect(appManifest.url, 'a manifest URL was resolved').toBeTruthy();
		const criticalManifestErrors = appManifest.errors.filter((e) => e.critical);
		expect(
			criticalManifestErrors,
			`Page.getAppManifest errors: ${JSON.stringify(appManifest.errors)}`
		).toEqual([]);

		const parsed = JSON.parse(appManifest.data || '{}');
		expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(parsed.display);
		expect((parsed.icons ?? []).some((i: { sizes?: string }) => i.sizes === '512x512')).toBe(
			true
		);
		expect(
			(parsed.icons ?? []).some((i: { purpose?: string }) =>
				(i.purpose ?? '').includes('maskable')
			)
		).toBe(true);

		// 2 + 3. Chrome's own installability verdict (what the Lighthouse audit
		//    wrapped) — every reported error is blocking here: no exclusions.
		const install = await cdp.send('Page.getInstallabilityErrors');
		expect(
			install.installabilityErrors,
			`Page.getInstallabilityErrors: ${JSON.stringify(install.installabilityErrors)}`
		).toEqual([]);
	} finally {
		await ctx.close();
		await rm(userDataDir, { recursive: true, force: true });
	}
});

test('dynamic and authenticated responses stay no-store', async ({ page, context, request }) => {
	const login = await request.get('/login', { maxRedirects: 0 });
	expect(login.headers()['cache-control']).toBe('no-store');

	const health = await request.get('/healthz');
	expect(health.headers()['cache-control']).toBe('no-store');

	// T058: /api/services is no-store even though it has no bundle-5 handler and
	// returns an unauthenticated response (the guard answers 401 before routing).
	const api = await request.get('/api/services');
	expect([401, 404]).toContain(api.status());
	expect(api.headers()['cache-control']).toBe('no-store');

	await signIn(context);
	const dash = await page.goto('/');
	expect(dash?.headers()['cache-control']).toBe('no-store');
});

test('the served service-worker script precaches only static assets (source check)', async ({
	request
}) => {
	const res = await request.get('/service-worker.js');
	expect(res.ok()).toBe(true);
	const src = await res.text();

	const paths = [...src.matchAll(/["'`](\/[A-Za-z0-9._/-]+)["'`]/g)]
		.map((mm) => mm[1])
		.filter((p) => p.length > 1 && !p.endsWith('.map'));
	expect(paths.length).toBeGreaterThan(0);

	for (const p of paths) {
		expect(isStaticAssetPath(p), `service-worker references non-static "${p}"`).toBe(true);
	}
	for (const forbidden of NEVER_CACHE) {
		expect(paths, `"${forbidden}" must not be precached`).not.toContain(forbidden);
	}
	expect(src).toContain('respondWith');
	expect(src).toMatch(/method\s*!==?\s*[`'"]GET[`'"]/);
});

test('the service worker precaches only static build assets, nothing dynamic', async ({
	page,
	context
}) => {
	await signIn(context);
	await page.goto('/');

	// The worker installs + precaches asynchronously after the page loads — poll.
	await expect
		.poll(async () => (await cacheContents(page)).entries.length, {
			timeout: 60_000,
			message: 'service worker should precache the static build assets'
		})
		.toBeGreaterThan(0);

	const { keys, entries } = await cacheContents(page);

	expect(keys).toHaveLength(1);
	expect(keys[0]).toMatch(/^hmp-static-/);

	for (const pathname of entries) {
		expect(isStaticAssetPath(pathname), `cached "${pathname}" must be a static asset`).toBe(
			true
		);
		expect(NEVER_CACHE, `"${pathname}" must never be cached`).not.toContain(pathname);
	}
	expect(entries.some((p) => p === '/' || p.endsWith('.html'))).toBe(false);
});

test('offline, a dynamic navigation is never served from cache', async ({ page, context }) => {
	await signIn(context);
	await page.goto('/');
	await expect
		.poll(async () => (await cacheContents(page)).entries.length, {
			timeout: 60_000,
			message: 'service worker should precache the static build assets'
		})
		.toBeGreaterThan(0);

	await context.setOffline(true);

	// Stay on the loaded page (no navigation, so the JS context survives) and
	// probe from it: the SW must NOT answer a dynamic request from cache — with
	// the network down, `fetch('/')` has to fail.
	const probe = await page.evaluate(async () => {
		const out: Record<string, unknown> = {};
		try {
			const r = await fetch('/', { redirect: 'manual' });
			out.dynamic = { reached: true, status: r.status, type: r.type };
		} catch (e) {
			out.dynamic = { reached: false, error: String(e) };
		}
		try {
			const r = await fetch('/manifest.webmanifest');
			out.asset = { ok: r.ok, status: r.status };
		} catch (e) {
			out.asset = { ok: false, error: String(e) };
		}
		return out as {
			dynamic: { reached: boolean; status?: number };
			asset: { ok: boolean };
		};
	});

	expect(
		probe.dynamic.reached,
		`offline fetch('/') must fail (never served from cache): ${JSON.stringify(probe.dynamic)}`
	).toBe(false);
	// a precached static asset IS still served offline — proves the SW is live
	expect(
		probe.asset.ok,
		`offline fetch of a precached asset: ${JSON.stringify(probe.asset)}`
	).toBe(true);

	await context.setOffline(false);
});
