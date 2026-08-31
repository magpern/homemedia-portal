import type AxeBuilder from '@axe-core/playwright';
import { setField } from './form.js';
import {
	setCurationFixture,
	setDockerMode,
	signIn,
	type MockContainer
} from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

async function axeSeriousOrCritical(makeAxeBuilder: () => AxeBuilder) {
	const results = await makeAxeBuilder().analyze();
	return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

/**
 * Feature 002 — Friendly Home View e2e over the local-HTTPS harness with the
 * stub Docker source. `mobile` project (360×780). Single-worker run; each test
 * sets its own fixture in `beforeEach` and hands the default back in `afterEach`.
 *
 * Sandbox note (see `dashboard.spec.ts`): headless Chromium here renders text
 * nodes at zero height and has a broken CDP Input domain. Assertions use
 * `toContainText` / `toHaveCount` / attribute checks and `page.evaluate` for
 * focus, and reserve `boundingBox()` for elements that carry their own box.
 */

test.describe.configure({ mode: 'serial' });

const enabled = { 'homemedia.enable': 'true' };

/** Two household-facing actions + two operator tools. */
const FRIENDLY_FIXTURE: MockContainer[] = [
	{
		Id: 'library',
		Names: ['/library'],
		Image: 'example/library',
		State: 'running',
		Labels: {
			...enabled,
			'homemedia.name': 'Library',
			'homemedia.placement': 'home',
			'homemedia.home_label': 'Watch the library',
			'homemedia.description': 'Films and shows to play on the TV or a phone.',
			'homemedia.icon': 'watch',
			'homemedia.url': 'https://library.invalid/',
			'homemedia.order': '20'
		}
	},
	{
		Id: 'requests',
		Names: ['/requests'],
		Image: 'example/requests',
		State: 'running',
		Labels: {
			...enabled,
			'homemedia.name': 'Requests',
			'homemedia.placement': 'home',
			'homemedia.home_label': 'Find something to watch',
			// no description -> deterministic fallback
			'homemedia.icon': 'request',
			'homemedia.url': 'https://requests.invalid/',
			'homemedia.order': '10'
		}
	},
	{
		Id: 'autopilot',
		Names: ['/autopilot'],
		Image: 'example/autopilot',
		State: 'running',
		Labels: {
			...enabled,
			'homemedia.name': 'Autopilot',
			'homemedia.category': 'Automation',
			'homemedia.description': 'Keeps the library organised automatically.',
			'homemedia.url': 'https://autopilot.invalid/'
		}
	},
	{
		Id: 'watchtower',
		Names: ['/watchtower'],
		Image: 'example/watchtower',
		State: 'exited',
		Labels: {
			...enabled,
			'homemedia.name': 'Server Health',
			'homemedia.category': 'Ops',
			'homemedia.lan_only': 'true',
			// no description -> deterministic manage fallback
			'homemedia.url': 'https://health.invalid/'
		}
	},
	// never opted in — must be invisible everywhere
	{
		Id: 'hidden-thing',
		Names: ['/hidden-thing'],
		Image: 'example/hidden',
		State: 'running',
		Labels: { 'com.example.role': 'secret' }
	}
];

/** Server Health is a stopped container; everything else is running. */
const FRIENDLY_INSPECT: Record<string, unknown> = {
	watchtower: { State: { Status: 'exited' } }
};

test.beforeEach(async ({ context, request }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'run once — viewport is asserted explicitly');
	await signIn(context);
	await setDockerMode(request, 'normal');
	await setCurationFixture(request, FRIENDLY_FIXTURE, FRIENDLY_INSPECT);
});

test.afterEach(async ({ request }) => {
	await setCurationFixture(request, null);
});

test('friendly identity: h1, document title, manifest name', async ({ page, request }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toHaveText('Home media');
	await expect(page).toHaveTitle('Home media');

	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.name).toBe('Home media');
	expect(manifest.short_name).toBe('Home media');
});

test('landing view: only the two primary cards above a collapsed Manage media', async ({
	page
}) => {
	await page.goto('/');

	const primary = page.locator('.primary-list > li');
	await expect(primary).toHaveCount(2);
	// ordered by homemedia.order: Requests (10) before Library (20)
	await expect(primary.nth(0)).toContainText('Find something to watch');
	await expect(primary.nth(1)).toContainText('Watch the library');

	// the manage tools are NOT visible until the section is expanded
	const details = page.locator('details.manage');
	await expect(details).toHaveCount(1);
	await expect(details).not.toHaveAttribute('open', /.*/);
	await expect(details.locator('summary')).toContainText('2 tools');
	// no grouped section renders outside the collapsed disclosure (fallback view)
	await expect(page.locator('.results > section.category')).toHaveCount(0);
	// the tool tiles are in the DOM but not rendered while the disclosure is closed
	await expect(page.locator('.card', { hasText: 'Autopilot' })).not.toBeVisible();

	// no primary/fallback grouping leaks the tools
	expect(await page.content()).not.toContain('hidden-thing');
	expect(await page.content()).not.toContain('Hidden Thing');
});

test('both complete primary cards fit at 360x780 without vertical scroll', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 780 });
	await page.goto('/');

	const cards = page.locator('.primary-list .primary-card');
	await expect(cards).toHaveCount(2);
	for (let i = 0; i < 2; i++) {
		const box = await cards.nth(i).boundingBox();
		expect(box, `card ${i} has a box`).not.toBeNull();
		expect(box!.y + box!.height, `card ${i} bottom within viewport`).toBeLessThanOrEqual(780);
	}
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('Manage media is a native, focusable disclosure that toggles', async ({ page }) => {
	await page.goto('/');
	const details = page.locator('details.manage');
	const summary = details.locator('summary');

	// native <summary> — inherently keyboard-operable; focuses and shows a ring
	const focus = await page.evaluate(() => {
		const s = document.querySelector('details.manage > summary');
		if (!(s instanceof HTMLElement)) return { tag: '', ok: false, outline: '' };
		s.focus();
		return {
			tag: s.tagName,
			ok: document.activeElement === s && s.matches(':focus-visible'),
			outline: getComputedStyle(s).outlineStyle
		};
	});
	expect(focus.tag).toBe('SUMMARY');
	expect(focus.ok).toBe(true);
	expect(focus.outline).not.toBe('none');

	await summary.click();
	await expect(details).toHaveAttribute('open', /.*/);
	await expect(details).toContainText('Autopilot');
	await expect(details).toContainText('Server Health');

	await summary.click();
	await expect(details).not.toHaveAttribute('open', /.*/);
});

test('search spans both regions; a manage match force-opens the section with a count', async ({
	page
}) => {
	await page.goto('/');
	const details = page.locator('details.manage');

	// matches a manage tool only
	await setField(page, '#service-search', 'autopilot');
	await expect(details).toHaveAttribute('open', /.*/);
	await expect(details).toContainText('Showing 1 of 2');
	await expect(details.locator('.card')).toHaveCount(1);
	await expect(details).toContainText('Autopilot');
	await expect(page.locator('.primary-list .primary-card')).toHaveCount(0);
	await expect(page.locator('.summary')).toContainText('1 of 4');

	// clearing restores the collapsed default + the primary cards
	await setField(page, '#service-search', '');
	await expect(details).not.toHaveAttribute('open', /.*/);
	await expect(page.locator('.primary-list .primary-card')).toHaveCount(2);

	// matches a primary card only
	await setField(page, '#service-search', 'watch the library');
	await expect(page.locator('.primary-list .primary-card')).toHaveCount(1);
	await expect(page.locator('.primary-list')).toContainText('Watch the library');

	// no matches anywhere
	await setField(page, '#service-search', 'zzz-nothing');
	await expect(page.locator('.empty')).toContainText('No matches');
});

test('no-home fallback: without a placement=home service the Portal v1 dashboard renders', async ({
	page,
	request
}) => {
	await setCurationFixture(request, [
		{
			Id: 'only-tool',
			Names: ['/only-tool'],
			Image: 'example/tool',
			State: 'running',
			Labels: { ...enabled, 'homemedia.name': 'Only Tool', 'homemedia.category': 'Ops' }
		}
	]);
	await page.goto('/');

	await expect(page.locator('details.manage')).toHaveCount(0);
	await expect(page.locator('.primary-list')).toHaveCount(0);
	await expect(page.locator('section.category')).toHaveCount(1);
	await expect(page.locator('section.category h2')).toContainText('Ops');
	await expect(page.locator('.card', { hasText: 'Only Tool' })).toHaveCount(1);
});

test('description fallback is deterministic and placement-keyed', async ({ page }) => {
	await page.goto('/');

	// Requests has no homemedia.description -> primary fallback sentence
	const requests = page.locator('.primary-card', { hasText: 'Find something to watch' });
	await expect(requests).toContainText('One of the main things to do here');
	// Library has a curated description -> shown verbatim
	await expect(page.locator('.primary-card', { hasText: 'Watch the library' })).toContainText(
		'Films and shows to play'
	);

	// Server Health (manage) has no description -> manage fallback
	await page.locator('details.manage > summary').click();
	await expect(page.locator('.card', { hasText: 'Server Health' })).toContainText(
		'A tool for keeping the media services running'
	);
});

test('status and LAN-only markers are retained in the friendly view', async ({ page }) => {
	await page.goto('/');
	// a stopped primary service still renders, quietly showing its status
	await expect(page.locator('.primary-list')).toContainText('Running');

	await page.locator('details.manage > summary').click();
	const health = page.locator('.card', { hasText: 'Server Health' });
	await expect(health).toContainText('Not running');
	await expect(health).toContainText('LAN only');
});

test('friendly view: no serious/critical axe violations, one h1, landmarks, disclosure name', async ({
	page,
	makeAxeBuilder
}) => {
	await page.goto('/');
	await expect(page.locator('.primary-list .primary-card').first()).toBeVisible();

	expect(await axeSeriousOrCritical(makeAxeBuilder)).toEqual([]);
	await expect(page.locator('h1')).toHaveCount(1);
	await expect(page.getByRole('banner')).toHaveCount(1);
	await expect(page.getByRole('main')).toHaveCount(1);
	await expect(page.getByRole('contentinfo')).toHaveCount(1);
	// the disclosure is a native <details>/<summary> — keyboard-operable and
	// state-exposing with no ARIA of its own — and its control names the section
	await expect(page.locator('details.manage > summary')).toContainText('Manage media');

	// expanded: still clean
	await page.locator('details.manage > summary').click();
	expect(await axeSeriousOrCritical(makeAxeBuilder)).toEqual([]);
});

test('friendly view: reduced-motion runs no non-essential animation', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	await expect(page.locator('.primary-list .primary-card').first()).toBeVisible();
	await page.locator('details.manage > summary').click();

	const animated = await page.evaluate(() => {
		const offenders: string[] = [];
		for (const el of document.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			const transitions = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
			const animating = cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0;
			if (transitions || animating) offenders.push(el.tagName);
		}
		return offenders;
	});
	expect(animated).toEqual([]);
});

test('unlabelled container is invisible in every region, count, and summary', async ({ page }) => {
	await page.goto('/');
	const html = await page.content();
	for (const marker of ['hidden-thing', 'Hidden Thing', 'com.example.role']) {
		expect(html).not.toContain(marker);
	}
	// 4 labelled services total (2 home + 2 manage)
	await expect(page.locator('.summary')).toContainText('4 services');
	await expect(page.locator('details.manage > summary')).toContainText('2 tools');
});
