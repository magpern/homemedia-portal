import type { Page } from '@playwright/test';
import { setDockerMode, signIn } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP11b — mobile-viewport + reduced-motion checks for `/login` and `/`
 * (spec FR-019, FR-022; SC-005, SC-006, SC-007; `quickstart` §5).
 *
 * `mobile` project (both projects run the 360px viewport; the reduced-motion
 * check drives `emulateMedia` explicitly so it does not depend on the sandbox
 * headless shell honouring the project-level `reducedMotion` option).
 *
 * `boundingBox()` is used only on elements that carry their own box (inputs,
 * buttons, cards); see the note in `dashboard.spec.ts` about zero-height text
 * in this sandbox. `/login` tests run unauthenticated; `/` tests sign in.
 */

const MIN_TARGET_PX = 43.5; // 44px CSS target, minus sub-pixel rounding

const horizontalOverflow = (page: Page) =>
	page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);

async function assertTargets(page: Page, selectors: string[]) {
	for (const selector of selectors) {
		const locator = page.locator(selector);
		const count = await locator.count();
		expect(count, selector).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			const box = await locator.nth(i).boundingBox();
			expect(box, `${selector} #${i}`).not.toBeNull();
			expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
			expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
		}
	}
}

async function animatedElements(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const offenders: string[] = [];
		for (const el of document.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			const transitions = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
			const animating = cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0;
			if (transitions || animating) {
				const cls = typeof el.className === 'string' ? el.className : '';
				offenders.push(cls ? `${el.tagName}.${cls}` : el.tagName);
			}
		}
		return offenders;
	});
}

// Runs in BOTH projects — `mobile` and `mobile-reduced-motion` — so the
// dedicated reduced-motion project exercises real coverage. The reduced-motion
// assertions additionally drive `emulateMedia` so they hold even where the
// sandbox headless shell ignores the project-level `reducedMotion` option.
test.describe('mobile + reduced motion (WP11b)', () => {
	test.beforeEach(async ({ request }) => {
		await setDockerMode(request, 'normal');
	});

	test('login page: no horizontal scroll and 44px targets at 360px', async ({ page }) => {
		await page.goto('/login');
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
		await assertTargets(page, ['input#password', 'form button[type="submit"]']);
	});

	test('dashboard: no horizontal scroll and 44px targets at 360px', async ({ page, context }) => {
		await signIn(context);
		await page.goto('/');
		await expect(page.locator('section.category').first()).toBeVisible();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
		await assertTargets(page, ['#service-search', '.btn', 'a.card', '.card--static']);
	});

	test('reduced motion: no non-essential transition or animation runs', async ({
		page,
		context
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });

		await page.goto('/login');
		expect(await animatedElements(page), 'login').toEqual([]);

		await signIn(context);
		await page.goto('/');
		await expect(page.locator('section.category').first()).toBeVisible();
		expect(await animatedElements(page), 'dashboard').toEqual([]);
	});

	test('motion IS defined when the user allows it (guards the media query)', async ({
		page,
		context
	}) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await signIn(context);
		await page.goto('/');
		await expect(page.locator('section.category').first()).toBeVisible();
		// the card + button transitions are wrapped in `prefers-reduced-motion: no-preference`
		expect(await animatedElements(page)).not.toEqual([]);
	});
});
