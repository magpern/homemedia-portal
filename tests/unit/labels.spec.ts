import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CATEGORY,
	DEFAULT_ORDER,
	MAX_PORT,
	MIN_PORT,
	parseBooleanLabel,
	parseLabels
} from '$lib/server/labels';

/** Concrete port numbers are never written literally — only derived from the bounds. */
const IN_RANGE_PORT = MIN_PORT + 1;
const BELOW_RANGE = String(MIN_PORT - 1);
const ABOVE_RANGE = String(MAX_PORT + 1);

/** Only the `homemedia.enable` opt-in gate lives elsewhere (discovery.ts). */
const enabled = { 'homemedia.enable': 'true' };

describe('parseBooleanLabel', () => {
	it.each(['true', 'TRUE', ' True ', '1', 'yes', 'YES'])('accepts %j', (v) => {
		expect(parseBooleanLabel(v)).toBe(true);
	});
	it.each(['false', '0', 'no', '', 'on', 'y', undefined])('rejects %j', (v) => {
		expect(parseBooleanLabel(v as string | undefined)).toBe(false);
	});
});

describe('parseLabels — defaults when keys are absent', () => {
	it('applies every documented default', () => {
		expect(parseLabels({ ...enabled })).toEqual({
			name: null,
			icon: null,
			category: DEFAULT_CATEGORY,
			description: undefined,
			url: null,
			port: null,
			order: DEFAULT_ORDER,
			lanOnly: false
		});
	});

	it('leaves name/icon null so the projection can supply container-derived defaults', () => {
		const set = parseLabels({ ...enabled });
		expect(set.name).toBeNull();
		expect(set.icon).toBeNull();
	});
});

describe('parseLabels — name, category, description', () => {
	it('trims name and keeps the full value', () => {
		expect(parseLabels({ ...enabled, 'homemedia.name': '  Media Box  ' }).name).toBe(
			'Media Box'
		);
	});

	it('treats a blank name as unset', () => {
		expect(parseLabels({ ...enabled, 'homemedia.name': '   ' }).name).toBeNull();
	});

	it('collapses internal whitespace in the category', () => {
		expect(parseLabels({ ...enabled, 'homemedia.category': '  Home   Media  ' }).category).toBe(
			'Home Media'
		);
	});

	it('falls back to the default category when blank', () => {
		expect(parseLabels({ ...enabled, 'homemedia.category': '   ' }).category).toBe(
			DEFAULT_CATEGORY
		);
	});

	it('keeps a description, drops a blank one', () => {
		expect(
			parseLabels({ ...enabled, 'homemedia.description': ' watch things ' }).description
		).toBe('watch things');
		expect(
			parseLabels({ ...enabled, 'homemedia.description': '  ' }).description
		).toBeUndefined();
	});
});

describe('parseLabels — url (decision A: explicit, wins, only path to non-http)', () => {
	it('accepts an absolute http URL verbatim', () => {
		const url = 'http://example.invalid/app';
		expect(parseLabels({ ...enabled, 'homemedia.url': url }).url).toBe(url);
	});

	it('accepts an absolute https URL verbatim (the only way to reach https)', () => {
		const url = 'https://example.invalid/';
		expect(parseLabels({ ...enabled, 'homemedia.url': ` ${url} ` }).url).toBe(url);
	});

	it.each(['ftp://example.invalid/', 'javascript:alert(1)', 'not a url', '/relative', ''])(
		'ignores an invalid or non-http(s) url %j',
		(bad) => {
			expect(parseLabels({ ...enabled, 'homemedia.url': bad }).url).toBeNull();
		}
	);
});

describe('parseLabels — port (MIN_PORT..MAX_PORT, http-only link built later)', () => {
	it('accepts an in-range integer', () => {
		expect(parseLabels({ ...enabled, 'homemedia.port': String(IN_RANGE_PORT) }).port).toBe(
			IN_RANGE_PORT
		);
	});

	it('accepts the inclusive range boundaries', () => {
		expect(parseLabels({ ...enabled, 'homemedia.port': String(MIN_PORT) }).port).toBe(MIN_PORT);
		expect(parseLabels({ ...enabled, 'homemedia.port': String(MAX_PORT) }).port).toBe(MAX_PORT);
	});

	it.each([
		BELOW_RANGE,
		ABOVE_RANGE,
		`-${IN_RANGE_PORT}`,
		`${IN_RANGE_PORT}.5`,
		'abc',
		'',
		`  ${IN_RANGE_PORT}  x  `
	])('rejects an out-of-range or malformed port %j', (bad) => {
		expect(parseLabels({ ...enabled, 'homemedia.port': bad }).port).toBeNull();
	});
});

describe('parseLabels — order (any integer; malformed → default, not error)', () => {
	it('accepts a positive integer', () => {
		expect(parseLabels({ ...enabled, 'homemedia.order': '10' }).order).toBe(10);
	});
	it('accepts a negative integer', () => {
		expect(parseLabels({ ...enabled, 'homemedia.order': '-5' }).order).toBe(-5);
	});
	it.each(['1.5', 'high', '', '10x'])('falls back to the default for %j', (bad) => {
		expect(parseLabels({ ...enabled, 'homemedia.order': bad }).order).toBe(DEFAULT_ORDER);
	});
});

describe('parseLabels — lan_only', () => {
	it('is true only for a truthy value', () => {
		expect(parseLabels({ ...enabled, 'homemedia.lan_only': 'yes' }).lanOnly).toBe(true);
		expect(parseLabels({ ...enabled, 'homemedia.lan_only': 'false' }).lanOnly).toBe(false);
		expect(parseLabels({ ...enabled }).lanOnly).toBe(false);
	});
});

describe('parseLabels — forward compatibility / isolation', () => {
	it('ignores unknown homemedia.* keys', () => {
		const set = parseLabels({ ...enabled, 'homemedia.future': 'x', 'homemedia.badge': 'new' });
		expect(set).toEqual(parseLabels({ ...enabled }));
	});

	it('never reads non-homemedia.* labels', () => {
		const set = parseLabels({
			...enabled,
			'com.docker.compose.project': 'secretstack',
			maintainer: 'someone',
			description: 'a raw OCI label, not ours'
		});
		expect(set.description).toBeUndefined();
		expect(set.category).toBe(DEFAULT_CATEGORY);
	});

	it('never throws on odd input and always returns a full LabelSet', () => {
		const cases: Record<string, string>[] = [
			{},
			{ 'homemedia.enable': 'true' },
			{ 'homemedia.port': ' ' }
		];
		for (const labels of cases) {
			const set = parseLabels(labels);
			expect(Object.keys(set).sort()).toEqual(
				[
					'category',
					'description',
					'icon',
					'lanOnly',
					'name',
					'order',
					'port',
					'url'
				].sort()
			);
		}
	});
});
