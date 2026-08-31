/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Portal v1 service worker — **static assets only** (spec FR-024, research R8,
 * Constitution X).
 *
 * Precache is exactly the build output SvelteKit hands us in `$service-worker`
 * (`build` = hashed app chunks, `files` = everything in `static/`), keyed by
 * `version` so a new deploy gets a fresh cache and the old one is deleted on
 * `activate`.
 *
 * The fetch handler is deliberately narrow:
 *   - Only same-origin `GET` requests are considered at all.
 *   - A request whose path is one of the precached asset URLs → served
 *     cache-first (these URLs are content-hashed or part of the immutable
 *     `static/` set, so the cached copy is always correct).
 *   - **Everything else is left to the network** — the handler does not call
 *     `respondWith`, so navigations, `/`, `/login`, `/logout`, `/logout`,
 *     `/healthz`, and any future dynamic route go straight to the server with
 *     their normal `Cache-Control: no-store`. Nothing dynamic, authenticated, or
 *     Docker-derived is ever read from or written to a cache.
 *
 * No runtime caching, no offline fallback for app content, no background sync,
 * no push, no periodic sync, no `postMessage` state. If the device is offline
 * and a page is not a precached asset, the browser shows its normal offline
 * error — that is intended.
 */

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** One cache per deployed version; `activate` deletes every other one. */
const CACHE = `hmp-static-${version}`;

/**
 * The complete precache set: hashed build artefacts + declared static files.
 * These are the only URLs this worker will ever answer from a cache.
 */
const PRECACHE: readonly string[] = [...build, ...files];
const PRECACHE_SET = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			// A new worker is a new deploy — take over as soon as it is ready.
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only ever touch same-origin GETs. Everything else (POST /login,
	// POST /logout, cross-origin, Range, …) is the network's job.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// Precached static asset → cache-first, with a network fill for the rare
	// cold-cache case. NOT added to the cache if it was missing at install:
	// the precache list is the whole allowlist and never grows at runtime.
	if (PRECACHE_SET.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(url.pathname);
				if (cached) return cached;
				return fetch(request);
			})()
		);
		return;
	}

	// Dynamic / SSR / auth / health / Docker-derived / anything else:
	// do not intercept — no `respondWith`, so it goes to the network as-is and
	// its `no-store` response is never cached.
});
