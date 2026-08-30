import { describe, expect, it } from 'vitest';
import {
	deSlugify,
	guessIconFromImage,
	projectService,
	resolveHref,
	slugify
} from '$lib/server/docker/projection';
import { MAX_PORT, MIN_PORT, parseLabels, type LabelSet } from '$lib/server/labels';
import type { DerivedStatus } from '$lib/server/docker/status';
import type { RawContainer } from '$lib/server/docker/types';

const UP: DerivedStatus = { status: 'up', statusLabel: 'Running' };

const container = (overrides: Partial<RawContainer> = {}): RawContainer => ({
	id: 'deadbeef',
	names: ['/media-alpha'],
	image: 'example/app:1',
	stateString: 'running',
	labels: { 'homemedia.enable': 'true' },
	...overrides
});

/** A LAN host placeholder — never a real deployment value. */
const LINK_BASE = 'link-base.invalid';
/**
 * Valid in-range `homemedia.port` values, derived from the field bounds so no
 * concrete port literal is committed. `LOW_PORT` is an arbitrary in-range value;
 * `HIGH_PORT` is the inclusive upper boundary.
 */
const LOW_PORT = MIN_PORT + 1;
const HIGH_PORT = MAX_PORT;

describe('deSlugify — display name default', () => {
	it.each([
		['media-alpha', 'Media Alpha'],
		['sample_app_ui', 'Sample App Ui'],
		['dashboard', 'Dashboard'],
		['  multi   word  ', 'Multi Word']
	])('%j → %j', (input, expected) => {
		expect(deSlugify(input)).toBe(expected);
	});

	it('never returns an empty string', () => {
		expect(deSlugify('')).toBe('Service');
		expect(deSlugify('---')).toBe('Service');
	});
});

describe('slugify — stable list key', () => {
	it.each([
		['Media Alpha', 'media-alpha'],
		['Bravo!! Admin', 'bravo-admin'],
		['   spaced   ', 'spaced']
	])('%j → %j', (input, expected) => {
		expect(slugify(input)).toBe(expected);
	});

	it('falls back to "service" when nothing survives', () => {
		expect(slugify('***')).toBe('service');
	});
});

describe('guessIconFromImage — bundled ids only, no fetch', () => {
	it('matches a bundled id from the image basename', () => {
		expect(guessIconFromImage('lscr.io/linuxserver/docker:1.2')).toBe('docker');
		expect(guessIconFromImage('docker')).toBe('docker');
		expect(guessIconFromImage('docker@sha256:abc')).toBe('docker');
	});

	it('returns null for an unknown basename (caller falls back to generic)', () => {
		expect(guessIconFromImage('acme/whatever:latest')).toBeNull();
		expect(guessIconFromImage('')).toBeNull();
	});
});

describe('resolveHref — data-model §3 precedence (decision A)', () => {
	const withLabels = (partial: Partial<LabelSet>): LabelSet => ({
		...parseLabels({ 'homemedia.enable': 'true' }),
		...partial
	});

	it('a valid absolute url is used verbatim and wins over port', () => {
		const href = resolveHref(
			withLabels({ url: 'https://alpha.invalid/app', port: LOW_PORT }),
			LINK_BASE
		);
		expect(href).toBe('https://alpha.invalid/app');
	});

	it('port builds a plain http link with the link base — never https, at any port', () => {
		for (const port of [LOW_PORT, HIGH_PORT]) {
			const href = resolveHref(withLabels({ url: null, port }), LINK_BASE);
			// TLS is never inferred — whatever the port number, the scheme is http.
			expect(href).toBe(`http://${LINK_BASE}:${port}`);
			expect(href!.startsWith('http://')).toBe(true);
			expect(href).not.toContain('https');
		}
	});

	it('port with no configured link base → null (link unconfigured)', () => {
		expect(resolveHref(withLabels({ url: null, port: LOW_PORT }), null)).toBeNull();
	});

	it('neither url nor port → null', () => {
		expect(resolveHref(withLabels({ url: null, port: null }), LINK_BASE)).toBeNull();
	});
});

describe('projectService — full tile', () => {
	it('projects an explicitly labelled container', () => {
		const labels = parseLabels({
			'homemedia.enable': 'true',
			'homemedia.name': 'Alpha Stream',
			'homemedia.icon': 'docker',
			'homemedia.category': 'Media',
			'homemedia.description': 'streaming',
			'homemedia.url': 'https://alpha.invalid/',
			'homemedia.order': '10',
			'homemedia.lan_only': 'true'
		});
		expect(projectService(container(), labels, UP, { serviceLinkBase: LINK_BASE })).toEqual({
			slug: 'alpha-stream',
			name: 'Alpha Stream',
			iconId: 'docker',
			category: 'Media',
			categoryKey: 'media',
			description: 'streaming',
			href: 'https://alpha.invalid/',
			lanOnly: true,
			order: 10,
			status: 'up',
			statusLabel: 'Running'
		});
	});

	it('derives the display name and slug from the container name when unlabelled', () => {
		const p = projectService(
			container({ names: ['/tools-delta'] }),
			parseLabels({ 'homemedia.enable': 'true' }),
			UP,
			{ serviceLinkBase: LINK_BASE }
		);
		expect(p.name).toBe('Tools Delta');
		expect(p.slug).toBe('tools-delta');
	});

	it('an unknown icon id falls back to generic; so does an unrecognised image', () => {
		const unknownIcon = projectService(
			container(),
			parseLabels({ 'homemedia.enable': 'true', 'homemedia.icon': 'no-such-icon' }),
			UP,
			{ serviceLinkBase: null }
		);
		expect(unknownIcon.iconId).toBe('generic');

		const guessed = projectService(
			container({ image: 'acme/mystery:latest' }),
			parseLabels({ 'homemedia.enable': 'true' }),
			UP,
			{ serviceLinkBase: null }
		);
		expect(guessed.iconId).toBe('generic');
	});

	it('carries a per-inspect failure through as status-unavailable', () => {
		const p = projectService(
			container(),
			parseLabels({ 'homemedia.enable': 'true' }),
			{ status: 'unknown', statusLabel: 'Status unavailable' },
			{ serviceLinkBase: null }
		);
		expect(p.status).toBe('unknown');
		expect(p.statusLabel).toBe('Status unavailable');
		expect(p.href).toBeNull();
	});
});
