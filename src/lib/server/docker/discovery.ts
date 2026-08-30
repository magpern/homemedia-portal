/**
 * Labelled-service discovery (spec FR-009/FR-010/FR-030, data-model §§1–2,
 * `contracts/docker-api-contract.md` step 1, Constitution V).
 *
 * Server-only. Calls the read-only proxy's list endpoint, then **re-checks the
 * `homemedia.enable` opt-in in code** on every returned entry — the server-side
 * `filters=` query is defence, not the only defence. Malformed entries are
 * dropped, never fatal. A failure of the list call itself is surfaced as
 * `{ ok: false }` (the "directory unavailable" signal); the caller must not
 * fabricate, cache, or retain a list (spec FR-030(b), SC-015).
 *
 * This module does not parse the wider `homemedia.*` vocabulary, resolve links,
 * or build projections — that is a later work package.
 */

import { DockerDiscoveryError, dockerGetContainersJson, type DockerClientOptions } from './client';
import type { DiscoveryResult, RawContainer } from './types';

/** True for `true` / `1` / `yes` (case-insensitive), per the label contract. */
export function isEnableLabelTruthy(value: unknown): boolean {
	return typeof value === 'string' && ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

/** Project one raw list entry to a {@link RawContainer}, or `null` if it is not a valid opted-in container. */
export function toRawContainer(entry: unknown): RawContainer | null {
	if (entry === null || typeof entry !== 'object') return null;
	const record = entry as Record<string, unknown>;

	const id = record.Id;
	if (typeof id !== 'string' || id.length === 0) return null;

	const rawLabels =
		record.Labels && typeof record.Labels === 'object'
			? (record.Labels as Record<string, unknown>)
			: {};
	const labels: Record<string, string> = {};
	for (const [key, value] of Object.entries(rawLabels)) {
		if (typeof value === 'string') labels[key] = value;
	}

	// Defence in depth for Constitution V — never trust the server-side filter alone.
	if (!isEnableLabelTruthy(labels['homemedia.enable'])) return null;

	const names = Array.isArray(record.Names)
		? record.Names.filter((n): n is string => typeof n === 'string')
		: [];

	return {
		id,
		names,
		image: typeof record.Image === 'string' ? record.Image : '',
		stateString: typeof record.State === 'string' ? record.State : '',
		labels
	};
}

/**
 * Discover the containers explicitly opted in with `homemedia.enable=true`.
 *
 * Never throws: a discovery failure returns `{ ok: false, reason }` so the
 * dashboard can render the explicit unavailable state without a list.
 */
export async function discoverLabelledContainers(
	options: DockerClientOptions = {}
): Promise<DiscoveryResult> {
	let body: unknown;
	try {
		body = await dockerGetContainersJson(options);
	} catch (err) {
		if (err instanceof DockerDiscoveryError) {
			return { ok: false, reason: err.message };
		}
		return { ok: false, reason: 'Docker discovery failed' };
	}

	if (!Array.isArray(body)) {
		return { ok: false, reason: 'Docker discovery returned an unexpected (non-array) body' };
	}

	const containers = body
		.map(toRawContainer)
		.filter((container): container is RawContainer => container !== null);

	return { ok: true, containers };
}
