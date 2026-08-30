import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	GENERIC_ICON_ID,
	ICON_SET_ATTRIBUTION,
	bundledIconIds,
	getIconSvg,
	hasIcon,
	resolveIconId
} from '$lib/icons';

const iconsDir = fileURLToPath(new URL('../../src/lib/icons/', import.meta.url));
const svgDir = `${iconsDir}svg/`;
const read = (name: string) => readFileSync(`${iconsDir}${name}`, 'utf8');

/** A URL that would trigger a network fetch — the SVG XML namespace is not one. */
const REMOTE_REF =
	/(?:src|href|xlink:href)\s*=\s*["']?https?:\/\/|url\(\s*["']?https?:\/\/|<image\b/i;

describe('icon registry — resolution + generic fallback', () => {
	it('resolves a known id to itself', () => {
		expect(resolveIconId('docker')).toBe('docker');
		expect(hasIcon('docker')).toBe(true);
	});

	it('falls back to the generic id for unknown / empty / malformed values', () => {
		for (const bad of [
			undefined,
			null,
			'',
			'   ',
			'not-a-real-icon',
			'../../etc/passwd',
			'Docker'
		]) {
			expect(resolveIconId(bad as string | null | undefined)).toBe(GENERIC_ICON_ID);
			expect(hasIcon(bad as string | null | undefined)).toBe(false);
		}
	});

	it('always returns non-empty SVG markup, never throwing', () => {
		for (const id of ['docker', 'dashboard-icons', 'generic', 'unknown', '']) {
			const svg = getIconSvg(id);
			expect(svg).toContain('<svg');
			expect(svg.length).toBeGreaterThan(0);
		}
	});

	it('serves the generic glyph for any unknown id', () => {
		expect(getIconSvg('unknown')).toBe(getIconSvg(GENERIC_ICON_ID));
	});

	it('exposes a sorted id list that includes the generic fallback', () => {
		expect(bundledIconIds).toContain(GENERIC_ICON_ID);
		expect([...bundledIconIds]).toEqual([...bundledIconIds].sort());
	});
});

describe('bundled icons — no runtime fetch (FR-012)', () => {
	const svgFiles = readdirSync(svgDir).filter((f) => f.endsWith('.svg'));

	it('bundles at least the generic fallback plus one real icon', () => {
		expect(svgFiles.length).toBeGreaterThanOrEqual(2);
		expect(svgFiles).toContain('generic.svg');
	});

	it.each(svgFiles)('%s contains no remote reference or script', (file) => {
		const svg = readFileSync(`${svgDir}${file}`, 'utf8');
		expect(svg).not.toMatch(REMOTE_REF);
		expect(svg.toLowerCase()).not.toContain('<script');
		expect(svg.toLowerCase()).not.toContain('javascript:');
	});

	it('every resolvable icon renders markup with no remote reference', () => {
		for (const id of [...bundledIconIds, 'unknown-id']) {
			expect(getIconSvg(id)).not.toMatch(REMOTE_REF);
		}
	});

	it('the registry module itself embeds the markup — no icon path is fetched', () => {
		const src = read('index.ts');
		expect(src).not.toMatch(/\bfetch\s*\(/);
		expect(src).not.toMatch(/\bimport\s*\(/);
		// icons are pulled in as inlined markup via `?raw`, not as asset URLs
		expect(src).toMatch(/\.svg\?raw';/);
	});
});

describe('icon licensing artifacts (Apache-2.0 §4, WP7)', () => {
	it('ships the verbatim Apache-2.0 licence', () => {
		const license = read('LICENSE');
		expect(license).toContain('Apache License');
		expect(license).toContain('Version 2.0, January 2004');
		expect(license).toContain('Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs');
	});

	it('ships an attribution NOTICE with the trademark / identification-only disclaimer', () => {
		const notice = read('NOTICE');
		expect(notice).toContain('Dashboard Icons');
		expect(notice).toContain('Apache License, Version 2.0');
		expect(notice.toLowerCase()).toContain('identification purposes only');
	});

	it('records the pinned upstream revision in PROVENANCE.md', () => {
		const provenance = read('PROVENANCE.md');
		expect(provenance).toContain(ICON_SET_ATTRIBUTION.pinnedCommit);
		expect(provenance).toContain('homarr-labs/dashboard-icons');
		expect(provenance.toLowerCase()).toContain('apache');
	});

	it('attribution metadata points at the bundled licence file and pinned commit', () => {
		expect(ICON_SET_ATTRIBUTION.license).toBe('Apache-2.0');
		expect(ICON_SET_ATTRIBUTION.licenseFile).toBe('src/lib/icons/LICENSE');
		expect(ICON_SET_ATTRIBUTION.pinnedCommit).toMatch(/^[0-9a-f]{40}$/);
	});
});
