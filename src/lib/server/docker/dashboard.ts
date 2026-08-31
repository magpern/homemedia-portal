/**
 * Dashboard model assembly (spec FR-010/FR-014/FR-030, data-model §§5–6,
 * `contracts/http-routes.md` `GET /`).
 *
 * Server-only. Orchestrates the read-only Docker foundation:
 *   1. discover the `homemedia.enable=true` containers;
 *   2. inspect each one for status, within the overall Docker time budget;
 *   3. parse labels + project each into a {@link ServiceProjection};
 *   4. group into {@link Category} sections and compute counts.
 *
 * Two failure modes are kept strictly separate (data-model §4, FR-030):
 *
 *   A. **discovery ok, some inspects fail** → `sourceOk: true`; every discovered
 *      labelled service is still listed; the affected ones carry
 *      `status: 'unknown'` / "Status unavailable".
 *   B. **discovery itself fails** → `sourceOk: false`, `categories: []`,
 *      `counts` all zero. Nothing is fabricated, cached, or retained — v1 has no
 *      persistence, so there is simply nothing to show.
 *
 * No HTTP/uptime probing, background polling, or streaming (FR-016): every
 * value here comes from a single Docker read triggered by the page load (or an
 * explicit user refresh).
 */

import { getEnv } from '$lib/server/env';
import { parseLabels } from '$lib/server/labels';
import type { Category, DashboardModel, ServiceProjection } from '$lib/types';
import {
	DOCKER_OVERALL_BUDGET_MS,
	dockerGetContainerInspect,
	type DockerClientOptions
} from './client';
import { discoverLabelledContainers } from './discovery';
import { projectService } from './projection';
import { deriveStatus, parseInspectState } from './status';
import type { DiscoveryResult, RawContainer, StatusInput } from './types';

/** Injectable seams; production uses discovery + inspect against the real proxy. */
export interface DashboardDeps {
	/** Discover opted-in containers. Defaults to {@link discoverLabelledContainers}. */
	discover?: (options?: DockerClientOptions) => Promise<DiscoveryResult>;
	/** Inspect one container by id. Defaults to {@link dockerGetContainerInspect}. */
	inspect?: (containerRef: string, options?: DockerClientOptions) => Promise<unknown>;
	/** Clock; defaults to `Date.now`. */
	now?: () => number;
	/** `SERVICE_LINK_BASE`; defaults to the validated runtime config. */
	serviceLinkBase?: string | null;
}

const EMPTY_COUNTS = { services: 0, up: 0, down: 0, unknown: 0 } as const;

/** An empty model in the shape callers expect (failure mode B / no data). */
const EMPTY_MODEL = {
	sourceOk: false as const,
	categories: [] as Category[],
	primary: [] as ServiceProjection[],
	manage: [] as Category[],
	manageCount: 0,
	counts: { ...EMPTY_COUNTS }
};

/** Read one container's status, closing a per-inspect failure to `unknown`. */
async function readStatus(
	container: RawContainer,
	inspect: NonNullable<DashboardDeps['inspect']>,
	deadline: number
): Promise<StatusInput> {
	try {
		const body = await inspect(container.id, { deadline });
		return { ok: true, state: parseInspectState(body) };
	} catch {
		// A failed/timed-out inspect for *this* container → `unknown`, still listed
		// (FR-030(a), SC-009). Fail closed for any error, never guessed as "up".
		return { ok: false };
	}
}

/** Sort services within a category: `order` asc, then `name` (locale, case-insensitive). */
function sortServices(a: ServiceProjection, b: ServiceProjection): number {
	if (a.order !== b.order) return a.order - b.order;
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Group projections into category sections (data-model §5). */
export function groupIntoCategories(services: ServiceProjection[]): Category[] {
	const byKey = new Map<string, Category>();

	for (const service of services) {
		let category = byKey.get(service.categoryKey);
		if (!category) {
			// First spelling seen provides the displayed casing (label contract).
			category = {
				key: service.categoryKey,
				label: service.category,
				services: [],
				order: service.order
			};
			byKey.set(service.categoryKey, category);
		}
		category.services.push(service);
		category.order = Math.min(category.order, service.order);
	}

	const categories = [...byKey.values()];
	for (const category of categories) category.services.sort(sortServices);
	categories.sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
	});
	return categories;
}

/** Aggregate status counts across every projected service (data-model §6). */
function countStatuses(services: ServiceProjection[]): DashboardModel['counts'] {
	const counts = { services: services.length, up: 0, down: 0, unknown: 0 };
	for (const service of services) counts[service.status]++;
	return counts;
}

/**
 * Build the dashboard model for one page load / refresh.
 *
 * Never throws for an operational Docker failure — the two-mode rule above is
 * encoded in the returned model.
 */
export async function buildDashboardModel(deps: DashboardDeps = {}): Promise<DashboardModel> {
	const discover = deps.discover ?? discoverLabelledContainers;
	const inspect = deps.inspect ?? dockerGetContainerInspect;
	const now = deps.now ?? Date.now;
	const serviceLinkBase =
		deps.serviceLinkBase !== undefined ? deps.serviceLinkBase : getEnv().serviceLinkBase;

	const deadline = now() + DOCKER_OVERALL_BUDGET_MS;
	const generatedAt = new Date(now()).toISOString();

	const discovery = await discover({ deadline });

	// Failure mode B — discovery itself failed. No list, nothing retained.
	if (!discovery.ok) {
		return { generatedAt, ...EMPTY_MODEL };
	}

	const statuses = await Promise.all(
		discovery.containers.map((container) => readStatus(container, inspect, deadline))
	);

	const services = discovery.containers.map((container, i) =>
		projectService(container, parseLabels(container.labels), deriveStatus(statuses[i]), {
			serviceLinkBase
		})
	);

	// Feature 002 — partition the *same* projected list into the friendly view.
	// `categories` still spans every service (no-home fallback + honest totals).
	const primaryServices = services.filter((s) => s.placement === 'home').sort(sortServices);
	const manageServices = services.filter((s) => s.placement === 'manage');

	return {
		generatedAt,
		sourceOk: true,
		categories: groupIntoCategories(services),
		primary: primaryServices,
		manage: groupIntoCategories(manageServices),
		manageCount: manageServices.length,
		counts: countStatuses(services)
	};
}
