import { describe, expect, it } from 'vitest';
import { buildDashboardModel, groupIntoCategories } from '$lib/server/docker/dashboard';
import type { ServiceProjection } from '$lib/types';
import type { RawContainer } from '$lib/server/docker/types';

const LINK_BASE = 'link-base.invalid';

const raw = (
	id: string,
	labels: Record<string, string>,
	extra: Partial<RawContainer> = {}
): RawContainer => ({
	id,
	names: [`/${id}`],
	image: 'example/app',
	stateString: 'running',
	labels: { 'homemedia.enable': 'true', ...labels },
	...extra
});

const inspectRunning = () => Promise.resolve({ State: { Status: 'running' } });

/** A minimal projection for the pure grouping tests. */
const svc = (partial: Partial<ServiceProjection>): ServiceProjection => ({
	slug: 'x',
	name: 'X',
	iconId: 'generic',
	category: 'Services',
	categoryKey: 'services',
	description: undefined,
	href: null,
	lanOnly: false,
	order: 100,
	status: 'up',
	statusLabel: 'Running',
	...partial
});

describe('groupIntoCategories', () => {
	it('merges near-identical categories on casefold, first spelling wins the label', () => {
		const categories = groupIntoCategories([
			svc({ name: 'B', category: 'Media', categoryKey: 'media', order: 20 }),
			svc({ name: 'A', category: 'media', categoryKey: 'media', order: 5 })
		]);
		expect(categories).toHaveLength(1);
		expect(categories[0].label).toBe('Media');
		expect(categories[0].services.map((s) => s.name)).toEqual(['A', 'B']);
		expect(categories[0].order).toBe(5);
	});

	it('sorts services by order then name (locale, case-insensitive)', () => {
		const [category] = groupIntoCategories([
			svc({ name: 'bravo', categoryKey: 'c', category: 'C', order: 10 }),
			svc({ name: 'Alpha', categoryKey: 'c', category: 'C', order: 10 }),
			svc({ name: 'zulu', categoryKey: 'c', category: 'C', order: 1 })
		]);
		expect(category.services.map((s) => s.name)).toEqual(['zulu', 'Alpha', 'bravo']);
	});

	it('sorts categories by min order then label', () => {
		const categories = groupIntoCategories([
			svc({ categoryKey: 'tools', category: 'Tools', order: 50 }),
			svc({ categoryKey: 'media', category: 'Media', order: 90 }),
			svc({ categoryKey: 'media', category: 'Media', order: 10 })
		]);
		expect(categories.map((c) => c.label)).toEqual(['Media', 'Tools']);
	});
});

describe('buildDashboardModel — failure mode B (discovery failed)', () => {
	it('returns an explicit source-unavailable model with no list', async () => {
		const model = await buildDashboardModel({
			discover: async () => ({ ok: false, reason: 'proxy unreachable' }),
			inspect: async () => {
				throw new Error('should not be called');
			},
			serviceLinkBase: LINK_BASE
		});
		expect(model.sourceOk).toBe(false);
		expect(model.categories).toEqual([]);
		expect(model.counts).toEqual({ services: 0, up: 0, down: 0, unknown: 0 });
		expect(() => new Date(model.generatedAt).toISOString()).not.toThrow();
	});
});

describe('buildDashboardModel — failure mode A (discovery ok, an inspect fails)', () => {
	it('lists every discovered service; only the affected one is status-unavailable', async () => {
		const model = await buildDashboardModel({
			discover: async () => ({
				ok: true,
				containers: [
					raw('alpha', { 'homemedia.name': 'Alpha', 'homemedia.category': 'Media' }),
					raw('bravo', { 'homemedia.name': 'Bravo', 'homemedia.category': 'Media' })
				]
			}),
			inspect: async (ref) => {
				if (ref === 'bravo') throw new Error('inspect timed out');
				return { State: { Status: 'running' } };
			},
			serviceLinkBase: LINK_BASE
		});

		expect(model.sourceOk).toBe(true);
		const services = model.categories.flatMap((c) => c.services);
		expect(services.map((s) => s.name).sort()).toEqual(['Alpha', 'Bravo']);
		expect(services.find((s) => s.name === 'Alpha')!.status).toBe('up');
		const bravo = services.find((s) => s.name === 'Bravo')!;
		expect(bravo.status).toBe('unknown');
		expect(bravo.statusLabel).toBe('Status unavailable');
		expect(model.counts).toEqual({ services: 2, up: 1, down: 0, unknown: 1 });
	});
});

describe('buildDashboardModel — happy path', () => {
	it('groups, orders, counts, and resolves links', async () => {
		const model = await buildDashboardModel({
			discover: async () => ({
				ok: true,
				containers: [
					raw('a', {
						'homemedia.name': 'Alpha',
						'homemedia.category': 'Media',
						'homemedia.url': 'https://alpha.invalid/',
						'homemedia.order': '10'
					}),
					raw('b', {
						'homemedia.name': 'Bravo',
						'homemedia.category': 'Tools',
						'homemedia.lan_only': 'true'
					}),
					raw('c', { 'homemedia.name': 'Charlie', 'homemedia.category': 'media' })
				]
			}),
			inspect: async (ref) =>
				ref === 'c' ? { State: { Status: 'exited' } } : { State: { Status: 'running' } },
			serviceLinkBase: LINK_BASE
		});

		expect(model.sourceOk).toBe(true);
		expect(model.categories.map((c) => c.label)).toEqual(['Media', 'Tools']);
		const media = model.categories[0];
		expect(media.services.map((s) => s.name)).toEqual(['Alpha', 'Charlie']);
		expect(media.services[0].href).toBe('https://alpha.invalid/');
		expect(media.services[1].status).toBe('down');
		expect(model.categories[1].services[0].lanOnly).toBe(true);
		expect(model.counts).toEqual({ services: 3, up: 2, down: 1, unknown: 0 });
	});

	it('returns an empty model (not a failure) when nothing is labelled', async () => {
		const model = await buildDashboardModel({
			discover: async () => ({ ok: true, containers: [] }),
			inspect: inspectRunning,
			serviceLinkBase: LINK_BASE
		});
		expect(model.sourceOk).toBe(true);
		expect(model.categories).toEqual([]);
		expect(model.counts.services).toBe(0);
	});
});
