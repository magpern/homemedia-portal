import { describe, expect, it } from 'vitest';
import {
	MANAGE_FALLBACK_DESCRIPTION,
	PRIMARY_FALLBACK_DESCRIPTION,
	resolveDescription
} from '$lib/description';

/** Feature 002 — deterministic placement-keyed description fallback (spec FR-105). */
describe('resolveDescription', () => {
	it('uses a real description verbatim (trimmed)', () => {
		expect(resolveDescription('  Films and shows  ', 'home')).toBe('Films and shows');
		expect(resolveDescription('Manage downloads', 'manage')).toBe('Manage downloads');
	});

	it('falls back by placement when the description is absent/blank/malformed', () => {
		for (const blank of [undefined, null, '', '   ']) {
			expect(resolveDescription(blank as string | undefined | null, 'home')).toBe(
				PRIMARY_FALLBACK_DESCRIPTION
			);
			expect(resolveDescription(blank as string | undefined | null, 'manage')).toBe(
				MANAGE_FALLBACK_DESCRIPTION
			);
		}
	});

	it('never returns an empty string', () => {
		expect(resolveDescription('', 'home').length).toBeGreaterThan(0);
		expect(resolveDescription('', 'manage').length).toBeGreaterThan(0);
	});

	it('the fallback constants name no service, category, host, port, or path', () => {
		for (const s of [PRIMARY_FALLBACK_DESCRIPTION, MANAGE_FALLBACK_DESCRIPTION]) {
			expect(s).not.toMatch(/\d{2,5}/); // no ports / addresses
			expect(s).not.toMatch(/[/\\]/); // no paths
			expect(s).not.toMatch(/https?:/i);
		}
	});
});
