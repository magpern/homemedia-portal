import {
	setCurationFixture,
	setDockerMode,
	signIn,
	type MockContainer
} from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP8 — curation lifecycle hardening (spec US4; FR-011, FR-013;
 * `contracts/label-contract.md`).
 *
 * The operator edits `homemedia.*` labels on a container and re-applies it; the
 * portal reflects the change **on the next load, with no portal restart**. The
 * e2e harness runs one built server for the whole file, so driving the stub
 * Docker fixture between navigations is exactly that scenario — the server
 * process never restarts here.
 *
 * `mobile`-project only (curation is viewport-agnostic). Text nodes render at
 * zero height in this sandbox's headless Chromium, so assertions use
 * `toContainText` / `toHaveCount`, never `toBeVisible()` on text.
 */

test.describe.configure({ mode: 'serial' });

const CATALOGUE = 'catalogue-svc';

/** One labelled container; overrides let each step tweak just what it needs. */
function container(
	labels: Record<string, string>,
	over: Partial<MockContainer> = {}
): MockContainer {
	return {
		Id: CATALOGUE,
		Names: [`/${CATALOGUE}`],
		Image: 'example/catalogue',
		State: 'running',
		Labels: labels,
		...over
	};
}

test.beforeEach(async ({ context, request }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'curation is viewport-agnostic — run once');
	await signIn(context);
	await setDockerMode(request, 'normal'); // reset to defaults; each test sets its own fixture
});

test.afterEach(async ({ request }) => {
	await setCurationFixture(request, null); // hand the default fixture back to other specs
});

test('add → change → remove all take effect on the next load, no restart', async ({
	page,
	request
}) => {
	// --- ADD: a freshly labelled container appears on the next load ---
	await setCurationFixture(request, [
		container({
			'homemedia.enable': 'true',
			'homemedia.name': 'Catalogue',
			'homemedia.category': 'Media',
			'homemedia.description': 'Browse the shelf'
		})
	]);
	await page.goto('/');
	await expect(page.locator('section.category')).toHaveCount(1);
	await expect(page.locator('section.category h2')).toContainText('Media');
	await expect(page.locator('.card', { hasText: 'Catalogue' })).toHaveCount(1);

	// --- CHANGE: edit name + category on the same container, reload ---
	await setCurationFixture(request, [
		container({
			'homemedia.enable': 'true',
			'homemedia.name': 'Media Catalogue',
			'homemedia.category': 'Library',
			'homemedia.description': 'Browse the shelf'
		})
	]);
	await page.goto('/');
	// exactly one section, now "Library" — the old "Media" section is not retained
	await expect(page.locator('section.category')).toHaveCount(1);
	await expect(page.locator('section.category h2')).toContainText('Library');
	await expect(page.locator('.card', { hasText: 'Media Catalogue' })).toHaveCount(1);

	// --- REMOVE: drop the opt-in, reload → gone, explicit empty state ---
	await setCurationFixture(request, [
		container({
			'homemedia.name': 'Media Catalogue',
			'homemedia.category': 'Library'
		})
	]);
	await page.goto('/');
	await expect(page.locator('.card')).toHaveCount(0);
	await expect(page.locator('section.category')).toHaveCount(0);
	await expect(page.locator('.empty')).toContainText('Nothing here yet');
	expect(await page.content()).not.toContain('Media Catalogue');
});

test('an unknown homemedia.icon falls back to the generic glyph with no network fetch', async ({
	page,
	request
}) => {
	const imageRequests: string[] = [];
	page.on('request', (r) => {
		if (r.resourceType() === 'image') imageRequests.push(r.url());
	});

	await setCurationFixture(request, [
		container({
			'homemedia.enable': 'true',
			'homemedia.name': 'Odd Icon',
			'homemedia.category': 'Tools',
			'homemedia.icon': 'not-a-bundled-id-–-42',
			'homemedia.url': 'https://odd.invalid/'
		})
	]);
	await page.goto('/');

	const icon = page.locator('a.card', { hasText: 'Odd Icon' }).locator('.icon');
	await expect(icon.locator('svg')).toHaveCount(1);
	const svg = (await icon.innerHTML()).replace(/\s+/g, ' ');
	// generic.svg marker; NOT the docker.svg viewBox
	expect(svg).toContain('circle cx="8.5"');
	expect(svg).not.toContain('-0.07 71.3');

	expect(imageRequests, 'the icon is inline SVG — nothing is fetched').toEqual([]);
});

test('category spellings that differ only by case or spacing merge into one section', async ({
	page,
	request
}) => {
	await setCurationFixture(request, [
		{
			Id: 'svc-a',
			Names: ['/svc-a'],
			Image: 'example/a',
			State: 'running',
			Labels: {
				'homemedia.enable': 'true',
				'homemedia.name': 'Service A',
				'homemedia.category': 'Media'
			}
		},
		{
			Id: 'svc-b',
			Names: ['/svc-b'],
			Image: 'example/b',
			State: 'running',
			Labels: {
				'homemedia.enable': 'true',
				'homemedia.name': 'Service B',
				'homemedia.category': '  media '
			}
		},
		{
			Id: 'svc-c',
			Names: ['/svc-c'],
			Image: 'example/c',
			State: 'running',
			Labels: {
				'homemedia.enable': 'true',
				'homemedia.name': 'Service C',
				'homemedia.category': 'MEDIA'
			}
		}
	]);
	await page.goto('/');

	const sections = page.locator('section.category');
	await expect(sections).toHaveCount(1);
	// first spelling seen ("Media") provides the displayed casing
	await expect(sections.locator('h2')).toContainText('Media');
	await expect(sections.locator('.card')).toHaveCount(3);
	for (const name of ['Service A', 'Service B', 'Service C']) {
		await expect(sections).toContainText(name);
	}
});
