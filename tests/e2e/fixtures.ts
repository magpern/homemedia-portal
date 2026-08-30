import AxeBuilder from '@axe-core/playwright';
import { test as base } from '@playwright/test';

/**
 * Shared e2e fixtures.
 *
 * `makeAxeBuilder` wires `@axe-core/playwright` for the accessibility suite in
 * WP11b; it is defined here so every spec has one consistent, pre-scoped entry
 * point. WP1's own smoke test does not assert accessibility.
 */
export const test = base.extend<{ makeAxeBuilder: () => AxeBuilder }>({
	makeAxeBuilder: async ({ page }, use) => {
		await use(() =>
			new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		);
	}
});

export { expect } from '@playwright/test';
