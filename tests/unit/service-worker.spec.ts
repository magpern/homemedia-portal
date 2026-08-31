/**
 * Static-only guarantee for `src/service-worker.ts` (Constitution X, FR-024,
 * research R8).
 *
 * A source-structure check that runs in `npm test` on every platform — no
 * browser needed. The live cache-enumeration + offline checks and Chrome's
 * installability check are in `tests/e2e/pwa.spec.ts`, in the `pwa` Playwright
 * project on the full `channel: 'chromium'` build (CI runs it; a library-starved
 * sandbox omits that project with a printed message). This spec keeps the
 * invariant enforced regardless.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
	fileURLToPath(new URL('../../src/service-worker.ts', import.meta.url)),
	'utf8'
);

describe('service worker is static-assets-only', () => {
	it('precaches exactly the SvelteKit build + files manifest, keyed by version', () => {
		expect(SRC).toMatch(/from '\$service-worker'/);
		expect(SRC).toMatch(/\[\s*\.\.\.build\s*,\s*\.\.\.files\s*\]/);
		expect(SRC).toMatch(/hmp-static-\$\{version\}/);
	});

	it('only writes to a cache during install (no runtime caching)', () => {
		// `cache.addAll` / `caches.open(...).addAll` appears once, in `install`.
		const addAll = SRC.match(/\.addAll\(/g) ?? [];
		expect(addAll).toHaveLength(1);
		const installBlock = SRC.slice(
			SRC.indexOf("addEventListener('install'"),
			SRC.indexOf("addEventListener('activate'")
		);
		expect(installBlock).toContain('.addAll(');

		// nothing ever puts a *response* into a cache.
		expect(SRC).not.toMatch(/cache\.put\(/);
		expect(SRC).not.toMatch(/\.put\(request/);
	});

	it('deletes non-current caches on activate', () => {
		const activateBlock = SRC.slice(SRC.indexOf("addEventListener('activate'"));
		expect(activateBlock).toMatch(/caches\.delete\(/);
		expect(activateBlock).toMatch(/key !== CACHE/);
	});

	it('the fetch handler answers from cache ONLY for a precached same-origin GET', () => {
		const fetchBlock = SRC.slice(SRC.indexOf("addEventListener('fetch'"));
		// early-returns for the cases that must hit the network
		expect(fetchBlock).toMatch(/request\.method !== 'GET'/);
		expect(fetchBlock).toMatch(/url\.origin !== sw\.location\.origin/);
		// the ONLY respondWith is guarded by membership in the precache set
		const respondWith = fetchBlock.match(/respondWith\(/g) ?? [];
		expect(respondWith).toHaveLength(1);
		expect(fetchBlock).toMatch(/PRECACHE_SET\.has\(url\.pathname\)/);
		const guardIdx = fetchBlock.indexOf('PRECACHE_SET.has(url.pathname)');
		const respondIdx = fetchBlock.indexOf('respondWith(');
		expect(guardIdx).toBeGreaterThan(0);
		expect(guardIdx).toBeLessThan(respondIdx);
	});

	it('adds no push / sync / periodicsync / message handlers', () => {
		for (const evt of ['push', 'sync', 'periodicsync', 'message', 'notificationclick']) {
			expect(SRC).not.toContain(`addEventListener('${evt}'`);
		}
	});
});
