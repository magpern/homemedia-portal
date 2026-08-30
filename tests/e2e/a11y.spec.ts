import type AxeBuilder from '@axe-core/playwright';
import { setDockerMode, signIn } from './dashboard-harness.js';
import { expect, test } from './fixtures.js';

/**
 * WP11b — accessibility of the login page and the authenticated dashboard
 * (spec FR-021; research R9; `quickstart` §5). Single-worker run; `mobile`
 * project (axe results are viewport/motion-independent).
 *
 * `/login` tests run unauthenticated; `/` tests sign in with a forged session
 * cookie (no login flow, no throttle).
 *
 * Environment note: the sandbox `chrome-headless-shell` has a broken CDP `Input`
 * domain, so real `Tab` traversal and synthetic key events cannot be driven
 * here. These checks assert that interactive controls are **natively** focusable
 * elements (`<a href>`, `<button>`, `<input>`) that receive focus and carry a
 * visible `:focus-visible` outline — a normal browser then activates them with
 * `Enter` / `Space` for free. `axe-core` covers names, roles, landmarks, and
 * contrast.
 */

async function axeSeriousOrCritical(makeAxeBuilder: () => AxeBuilder) {
	const results = await makeAxeBuilder().analyze();
	return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.describe('accessibility (WP11b)', () => {
	test.beforeEach(async ({ request }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'axe results are viewport-agnostic');
		await setDockerMode(request, 'normal');
	});

	test('login page: no serious/critical axe violations, one h1, a labelled control', async ({
		page,
		makeAxeBuilder
	}) => {
		await page.goto('/login');
		await expect(page.locator('form button[type="submit"]')).toBeVisible();

		expect(await axeSeriousOrCritical(makeAxeBuilder)).toEqual([]);
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(page.locator('label[for="password"]')).toHaveCount(1);
		await expect(page.locator('input#password[type="password"]')).toHaveCount(1);
	});

	test('dashboard: no serious/critical axe violations, one h1, banner/main/contentinfo', async ({
		page,
		context,
		makeAxeBuilder
	}) => {
		await signIn(context);
		await page.goto('/');
		await expect(page.locator('section.category').first()).toBeVisible();

		expect(await axeSeriousOrCritical(makeAxeBuilder)).toEqual([]);
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByRole('banner')).toHaveCount(1);
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(page.getByRole('contentinfo')).toHaveCount(1);
	});

	test('login control is natively focusable with a visible focus indicator', async ({ page }) => {
		await page.goto('/login');
		const focus = await page.evaluate(() => {
			const input = document.querySelector('input#password');
			if (!(input instanceof HTMLElement)) return { ok: false, outlineStyle: '' };
			input.focus();
			return {
				ok: document.activeElement === input && input.matches(':focus-visible'),
				outlineStyle: getComputedStyle(input).outlineStyle
			};
		});
		expect(focus.ok).toBe(true);
		expect(focus.outlineStyle).not.toBe('none');
	});

	test('dashboard tiles and buttons are native, focusable, and show a focus ring', async ({
		page,
		context
	}) => {
		await signIn(context);
		await page.goto('/');
		const result = await page.evaluate(() => {
			const card = document.querySelector('a.card[href]');
			const btn = document.querySelector('.btn');
			if (!(card instanceof HTMLElement) || !(btn instanceof HTMLElement)) return null;
			card.focus();
			const cardFocused = document.activeElement === card && card.matches(':focus-visible');
			const cardOutline = getComputedStyle(card).outlineStyle;
			btn.focus();
			return {
				cardTag: card.tagName,
				cardFocused,
				cardOutline,
				btnTag: btn.tagName,
				btnFocused: document.activeElement === btn
			};
		});
		expect(result).not.toBeNull();
		expect(result!.cardTag).toBe('A');
		expect(result!.cardFocused).toBe(true);
		expect(result!.cardOutline).not.toBe('none');
		expect(['A', 'BUTTON']).toContain(result!.btnTag);
		expect(result!.btnFocused).toBe(true);
	});

	test('status is conveyed by text and shape, not colour alone', async ({ page, context }) => {
		await signIn(context);
		await page.goto('/');
		const statuses = page.locator('.status');
		const count = await statuses.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			await expect(statuses.nth(i).locator('.label')).not.toBeEmpty();
			await expect(statuses.nth(i).locator('.glyph')).toHaveCount(1);
		}
	});
});
