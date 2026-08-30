import type { Page } from '@playwright/test';

/**
 * Set a form field's value and fire the events a real keystroke would.
 *
 * `page.fill()` / `page.keyboard` drive the browser's CDP `Input` domain, which
 * is broken in the minimal `chrome-headless-shell` build used in this sandbox
 * (navigation and clicks work; text injection silently no-ops). Setting `value`
 * through `page.evaluate` and dispatching `input` + `change` reproduces the same
 * observable state — a bound Svelte input updates, and a native form submit
 * serialises the value — so the server-side auth path is still exercised for
 * real over HTTPS. In a normal Chromium `page.fill` would do the same job.
 */
export async function setField(page: Page, selector: string, value: string): Promise<void> {
	await page.locator(selector).waitFor({ state: 'visible' });
	await page.evaluate(
		({ selector, value }) => {
			const el = document.querySelector(selector) as HTMLInputElement | null;
			if (!el) throw new Error(`no element for ${selector}`);
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		},
		{ selector, value }
	);
}
