/**
 * Read-only transport for the digest-pinned `docker-socket-proxy`
 * (`contracts/docker-api-contract.md`, research R6/R10, Constitution IV).
 *
 * Server-only. The **entire** request surface is the two `GET` calls the
 * contract permits:
 *
 *   - `GET /containers/json?all=1&filters={"label":["homemedia.enable=true"]}`
 *   - `GET /containers/{id}/json`
 *
 * There is deliberately **no** generic request helper: no caller-supplied path,
 * method, query, body, or header. Every request is `method: 'GET'` with
 * `redirect: 'error'`. Nothing here can create, start, stop, restart, kill,
 * exec, or delete anything; the module never touches `/events`, `/version`,
 * `/info`, `/_ping`, `/images`, `/networks`, `/volumes`, `/exec`,
 * `/containers/{id}/stats`, or `/containers/{id}/logs`, and it never shells out.
 */

import { getEnv } from '$lib/server/env';

/** Per-call timeout — a hung daemon must not hold a connection open (research R10). */
export const DOCKER_PER_CALL_TIMEOUT_MS = 2000;

/** Overall Docker time budget for one dashboard load; stage two of the budget. */
export const DOCKER_OVERALL_BUDGET_MS = 4000;

/** The one discovery query permitted by the contract. */
export const ENABLE_LABEL_FILTER = '{"label":["homemedia.enable=true"]}';

/** Container ids/names accepted for inspection — no path separators or traversal. */
const SAFE_CONTAINER_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Raised when labelled-service **discovery** (the list call) cannot be completed. */
export class DockerDiscoveryError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'DockerDiscoveryError';
	}
}

/** Raised when a **single** container inspect cannot be completed. */
export class DockerInspectError extends Error {
	readonly containerRef: string;
	constructor(containerRef: string, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'DockerInspectError';
		this.containerRef = containerRef;
	}
}

/** Injectable seam for tests; production always uses the global `fetch` + clock. */
export interface DockerClientOptions {
	fetch?: typeof fetch;
	/** Absolute epoch-ms after which no further Docker call may start. */
	deadline?: number;
	/** Clock source; defaults to `Date.now`. */
	now?: () => number;
}

function proxyBase(): string {
	const raw = getEnv().dockerProxyUrl;
	return raw.endsWith('/') ? raw : `${raw}/`;
}

type CallKind = 'discovery' | 'inspect';

function callError(kind: CallKind, ref: string, message: string, cause?: unknown) {
	const opts = cause === undefined ? undefined : { cause };
	return kind === 'discovery'
		? new DockerDiscoveryError(message, opts)
		: new DockerInspectError(ref, message, opts);
}

async function dockerGetJson(
	url: URL,
	kind: CallKind,
	ref: string,
	options: DockerClientOptions
): Promise<unknown> {
	const doFetch = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const deadline = options.deadline ?? now() + DOCKER_OVERALL_BUDGET_MS;

	const budgetLeft = deadline - now();
	if (budgetLeft <= 0) {
		throw callError(kind, ref, `Docker ${kind} skipped: overall time budget exhausted`);
	}

	const controller = new AbortController();
	const timeout = Math.min(DOCKER_PER_CALL_TIMEOUT_MS, budgetLeft);
	const timer = setTimeout(() => controller.abort(), timeout);

	let response: Response;
	try {
		response = await doFetch(url, {
			method: 'GET',
			redirect: 'error',
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});
	} catch (err) {
		throw callError(
			kind,
			ref,
			controller.signal.aborted
				? `Docker ${kind} timed out after ${timeout}ms`
				: `Docker ${kind} request failed`,
			err
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		throw callError(kind, ref, `Docker ${kind} returned HTTP ${response.status}`);
	}

	try {
		return await response.json();
	} catch (err) {
		throw callError(kind, ref, `Docker ${kind} returned a non-JSON body`, err);
	}
}

/**
 * Raw `GET /containers/json` scoped to `homemedia.enable=true`. Returns the
 * parsed JSON body (expected: an array). Throws {@link DockerDiscoveryError} on
 * any transport, status, timeout, or parse failure.
 */
export async function dockerGetContainersJson(options: DockerClientOptions = {}): Promise<unknown> {
	const url = new URL('containers/json', proxyBase());
	url.searchParams.set('all', '1');
	url.searchParams.set('filters', ENABLE_LABEL_FILTER);
	return dockerGetJson(url, 'discovery', 'containers/json', options);
}

/**
 * Raw `GET /containers/{id}/json` for one container. Returns the parsed JSON
 * body. Throws {@link DockerInspectError} (carrying `containerRef`) on any
 * transport, status, timeout, or parse failure, or if `containerRef` is unsafe.
 */
export async function dockerGetContainerInspect(
	containerRef: string,
	options: DockerClientOptions = {}
): Promise<unknown> {
	if (!SAFE_CONTAINER_REF.test(containerRef)) {
		throw new DockerInspectError(
			containerRef,
			'refusing to inspect an unsafe container reference'
		);
	}
	const url = new URL(`containers/${containerRef}/json`, proxyBase());
	return dockerGetJson(url, 'inspect', containerRef, options);
}
