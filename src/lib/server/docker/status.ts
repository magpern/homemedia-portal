/**
 * Pure per-service status mapping (spec FR-015/FR-030, data-model §4,
 * research R10). Status derives **only** from Docker container state and
 * container healthchecks — never from an HTTP/uptime probe of the service
 * (FR-016).
 *
 * Server-only, no I/O. `parseInspectState` narrows a raw
 * `GET /containers/{id}/json` body to the strict subset; `deriveStatus` maps
 * that (or a per-container read failure) to a status bucket + human label.
 */

import type { ServiceStatus } from '$lib/types';
import type { ContainerInspectState, StatusInput } from './types';

export interface DerivedStatus {
	status: ServiceStatus;
	statusLabel: string;
}

const RUNNING = 'running';
/** Non-running `State.Status` values that mean "Not running" (data-model §4). */
const NOT_RUNNING = new Set(['exited', 'dead', 'created', 'paused', 'restarting']);

/** Narrow a raw inspect body to `{ status, health }`; unknown shapes yield `undefined`s. */
export function parseInspectState(body: unknown): ContainerInspectState {
	const state =
		body && typeof body === 'object' && 'State' in body && typeof body.State === 'object'
			? ((body as { State: Record<string, unknown> | null }).State ?? {})
			: {};

	const health =
		state.Health && typeof state.Health === 'object'
			? (state.Health as Record<string, unknown>)
			: undefined;

	return {
		status: typeof state.Status === 'string' ? state.Status : undefined,
		health: health && typeof health.Status === 'string' ? health.Status : undefined
	};
}

/**
 * Map a parsed inspect (or a per-container read failure) to a portal status.
 *
 * Health, when present, wins over the coarse state. A failed/timed-out inspect
 * for **this** container is `unknown` / "Status unavailable" — the service is
 * still listed (spec FR-030(a), SC-009). An unrecognised state is treated the
 * same way (safe default), never guessed as "up".
 */
export function deriveStatus(input: StatusInput): DerivedStatus {
	if (!input.ok) return { status: 'unknown', statusLabel: 'Status unavailable' };

	const health = input.state.health?.trim().toLowerCase();
	if (health === 'healthy') return { status: 'up', statusLabel: 'Running' };
	if (health === 'unhealthy') return { status: 'down', statusLabel: 'Not running' };
	if (health === 'starting') return { status: 'unknown', statusLabel: 'Starting' };

	const state = input.state.status?.trim().toLowerCase();
	if (state === RUNNING) return { status: 'up', statusLabel: 'Running' };
	if (state && NOT_RUNNING.has(state)) return { status: 'down', statusLabel: 'Not running' };

	return { status: 'unknown', statusLabel: 'Status unavailable' };
}
