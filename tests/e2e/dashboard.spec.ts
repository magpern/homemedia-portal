import { E2E_SERVICE_LINK_BASE } from '../harness/constants.js';
import { setField } from './form.js';
import { setDockerMode, signIn } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP5 + WP6 dashboard e2e over the local-HTTPS harness with the stub Docker
 * source (`tests/harness/docker-mock.mjs`).
 *
 * The whole file runs **serially in one worker**: every spec here drives the one
 * process-global mock scenario, so they must not interleave with each other (and
 * no other spec file touches the mock). `mobile`-project only — the behaviour is
 * viewport-agnostic apart from the explicit 360px / reduced-motion assertions.
 *
 * Environment note: this sandbox's headless Chromium renders text with zero
 * measured height, so `toBeVisible()` on a text-only node always fails here.
 * These specs assert content with `toContainText` / `toHaveText` / `toHaveCount`
 * (which do not depend on layout) and reserve `toBeVisible()` / `boundingBox()`
 * for elements that carry their own box. The accessibility tree — exercised by
 * the axe assertion — confirms real visibility.
 */

test.describe.configure({ mode: 'serial' });

/** Markers for the two containers the mock returns that the portal MUST drop. */
const HIDDEN = ['echo-hidden', 'Echo Hidden', 'foxtrot-off', 'Foxtrot Off'];
const VISIBLE = ['Alpha Stream', 'Bravo Admin', 'Charlie Archive', 'Delta Notes'];

test.beforeEach(async ({ context, request }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'mobile',
		'dashboard behaviour is viewport-agnostic — run once'
	);
	await setDockerMode(request, 'normal');
	await signIn(context);
});

test.describe('dashboard rendering + search (WP6)', () => {
	test('renders labelled services grouped by category', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h1')).toHaveText('homemedia-portal');

		const sections = page.locator('section.category');
		await expect(sections).toHaveCount(2);
		await expect(sections.nth(0).locator('h2')).toHaveText(/Media/);
		await expect(sections.nth(1).locator('h2')).toHaveText(/Tools/);

		// "media" (lowercase label on Charlie) merges into "Media" (first spelling).
		const media = sections.nth(0);
		await expect(media).toContainText('Alpha Stream');
		await expect(media).toContainText('Charlie Archive');
		await expect(media.locator('li')).toHaveCount(2);

		const tools = sections.nth(1);
		await expect(tools).toContainText('Bravo Admin');
		await expect(tools).toContainText('Delta Notes');
	});

	test('filters by name and by description, with a clear empty state', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('li', { has: page.locator('.card') })).toHaveCount(4);

		await setField(page, '#service-search', 'alpha');
		await expect(page.locator('.card')).toHaveCount(1);
		await expect(page.locator('.card')).toContainText('Alpha Stream');
		await expect(page.locator('.summary')).toContainText('1 of 4');

		// description-only match ("Test streaming service")
		await setField(page, '#service-search', 'streaming');
		await expect(page.locator('.card')).toHaveCount(1);
		await expect(page.locator('.card')).toContainText('Alpha Stream');

		await setField(page, '#service-search', 'nothing-matches-this');
		await expect(page.locator('.card')).toHaveCount(0);
		await expect(page.locator('.empty')).toContainText('No matches');

		await setField(page, '#service-search', '');
		await expect(page.locator('.card')).toHaveCount(4);
	});

	test('marks a LAN-only service and links it on plain http via the port', async ({ page }) => {
		await page.goto('/');
		const bravo = page.locator('a.card', { hasText: 'Bravo Admin' });
		await expect(bravo).toContainText('LAN only');
		const href = await bravo.getAttribute('href');
		expect(href?.startsWith(`http://${E2E_SERVICE_LINK_BASE}`)).toBe(true);
		expect(href).not.toContain('https://');
	});

	test('an explicit url wins and opens in a new browsing context', async ({ page }) => {
		await page.goto('/');
		const alpha = page.locator('a.card', { hasText: 'Alpha Stream' });
		await expect(alpha).toHaveAttribute('href', 'https://alpha.invalid/watch');
		await expect(alpha).toHaveAttribute('target', '_blank');
		expect(await alpha.getAttribute('rel')).toContain('noopener');
	});

	test('a service with no destination is not a link', async ({ page }) => {
		await page.goto('/');
		const delta = page.locator('.card--static', { hasText: 'Delta Notes' });
		await expect(delta).toHaveCount(1);
		await expect(delta).toContainText('Link unconfigured');
		await expect(page.locator('a.card', { hasText: 'Delta Notes' })).toHaveCount(0);
	});

	test('shows container status derived from state', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.card', { hasText: 'Charlie Archive' })).toContainText(
			'Not running'
		);
		await expect(page.locator('a.card', { hasText: 'Alpha Stream' })).toContainText('Running');
	});

	test('the About area with icon attribution is reachable at the foot of the page', async ({
		page
	}) => {
		await page.goto('/');
		const footer = page.locator('footer.site-footer');
		await expect(footer).toBeVisible();
		await expect(footer.locator('h2')).toHaveText('About');
		await expect(footer).toContainText('Dashboard Icons');
		await expect(footer).toContainText(/identification purposes only/i);
	});
});

test.describe('discovery isolation + FR-030 failure modes (WP5)', () => {
	test('never displays, lists, or counts a non-opted-in container (FR-010, SC-003)', async ({
		page
	}) => {
		await page.goto('/');
		const html = await page.content();
		for (const marker of HIDDEN) {
			expect(html, `"${marker}" must not appear anywhere in the markup`).not.toContain(
				marker
			);
		}
		const main = page.locator('.dashboard-page');
		for (const name of VISIBLE) {
			await expect(main).toContainText(name);
		}
		await expect(page.locator('.summary')).toContainText('4 services');
		await expect(page.locator('.card')).toHaveCount(4);
	});

	test('mode A: discovery ok, one inspect fails → list all, mark only that one (SC-009)', async ({
		page,
		request
	}) => {
		await setDockerMode(request, 'inspect-fail');
		await page.goto('/');

		await expect(page.locator('.card')).toHaveCount(4);
		await expect(page.locator('.card', { hasText: 'Charlie Archive' })).toContainText(
			'Status unavailable'
		);
		await expect(page.locator('a.card', { hasText: 'Alpha Stream' })).toContainText('Running');
		await expect(page.locator('#service-search')).toHaveCount(1);
	});

	test('mode B: discovery fails → explicit unavailable, no list, no stale data (SC-015)', async ({
		page,
		request
	}) => {
		await setDockerMode(request, 'discovery-fail');
		await page.goto('/');

		await expect(page.locator('.empty--error')).toContainText(
			'The service directory is currently unavailable'
		);
		await expect(page.locator('.card')).toHaveCount(0);
		await expect(page.locator('#service-search')).toHaveCount(0);
		await expect(page.locator('.dashboard-page')).not.toContainText('Alpha Stream');

		// Reload while still down — no fabricated or retained list appears.
		await page.reload();
		await expect(page.locator('.empty--error')).toContainText('currently unavailable');
		await expect(page.locator('.card')).toHaveCount(0);
	});
});

test.describe('mobile + accessibility (WP6)', () => {
	test('every interactive control meets the 44px target size at 360px', async ({ page }) => {
		await page.goto('/');
		for (const selector of ['#service-search', '.btn', 'a.card', '.card--static']) {
			const locator = page.locator(selector);
			const count = await locator.count();
			expect(count, selector).toBeGreaterThan(0);
			for (let i = 0; i < count; i++) {
				const box = await locator.nth(i).boundingBox();
				expect(box, `${selector}#${i} has a box`).not.toBeNull();
				expect(box!.height).toBeGreaterThanOrEqual(43.5);
				expect(box!.width).toBeGreaterThanOrEqual(43.5);
			}
		}
	});

	test('no horizontal scroll at 360px', async ({ page }) => {
		await page.goto('/');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('service cards are keyboard focusable', async ({ page }) => {
		await page.goto('/');
		const focused = await page.evaluate(() => {
			const card = document.querySelector('a.card');
			if (!(card instanceof HTMLElement)) return false;
			card.focus();
			return document.activeElement === card;
		});
		expect(focused).toBe(true);
	});

	test('no serious or critical axe violations on the dashboard', async ({
		page,
		makeAxeBuilder
	}) => {
		await page.goto('/');
		await expect(page.locator('section.category').first()).toBeVisible();
		const results = await makeAxeBuilder().analyze();
		const seriousOrCritical = results.violations.filter(
			(v) => v.impact === 'serious' || v.impact === 'critical'
		);
		expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
	});

	test('no non-essential transition runs when reduced motion is requested', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const durations = await page.evaluate(() =>
			[...document.querySelectorAll('a.card, .btn')].map(
				(el) => getComputedStyle(el).transitionDuration
			)
		);
		expect(durations.length).toBeGreaterThan(0);
		for (const duration of durations) {
			expect(duration === '0s' || duration === '').toBe(true);
		}
	});
});
