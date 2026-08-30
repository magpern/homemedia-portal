/**
 * Shapes read from the read-only `docker-socket-proxy` (data-model §1,
 * `contracts/docker-api-contract.md`). Server-only. The portal consumes a strict
 * subset of the Docker Engine API payloads and nothing else.
 */

/** One normalised entry from `GET /containers/json` after label opt-in re-check. */
export interface RawContainer {
	/** `.Id` — inspect key and dedupe key. */
	id: string;
	/** `.Names` — leading slashes kept as Docker returns them; display fallback. */
	names: string[];
	/** `.Image` — used only for icon guessing in a later work package. */
	image: string;
	/** `.State` — coarse state string (`running`, `exited`, …); status fallback. */
	stateString: string;
	/** `.Labels` — string→string; already confirmed to carry `homemedia.enable` truthy. */
	labels: Record<string, string>;
}

/** The strict subset of `GET /containers/{id}/json` the status mapping needs. */
export interface ContainerInspectState {
	/** `.State.Status` (`running`, `exited`, `paused`, …), or `undefined` if absent. */
	status: string | undefined;
	/** `.State.Health.Status` (`healthy`, `unhealthy`, `starting`), or `undefined` when no healthcheck. */
	health: string | undefined;
}

/**
 * Result of labelled-service discovery (data-model §4 failure modes).
 *
 * `ok: false` is the **discovery-failed** signal — the caller must render the
 * explicit "directory unavailable" state and MUST NOT fabricate, cache, or
 * retain a list (spec FR-030(b), SC-015).
 */
export type DiscoveryResult =
	{ ok: true; containers: RawContainer[] } | { ok: false; reason: string };

/** Input to the pure status mapping: a parsed inspect, or a per-container read failure. */
export type StatusInput = { ok: true; state: ContainerInspectState } | { ok: false };
