/**
 * Best-effort login throttle (spec FR-005, SC-011; research R4; data-model §8).
 *
 * In-memory, per-process, per-client-IP. **Not** a substitute for any
 * edge/proxy rate limiting — it resets on restart and does not coordinate
 * across instances (v1 runs a single instance). Policy:
 *
 *   - up to 5 failed attempts per client in a rolling 15-minute window;
 *   - the 6th attempt (and every attempt during the cool-off) is refused,
 *     even with the correct password, until 15 minutes after it;
 *   - a successful login clears that client's counter.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const COOLOFF_MS = 15 * 60 * 1000;
/** How often the periodic sweep runs (also pruned opportunistically on access). */
const SWEEP_MS = 5 * 60 * 1000;

interface ClientState {
	/** unix-ms timestamps of failures within the last window. */
	failures: number[];
	/** unix-ms; while `now < blockedUntil`, every attempt is refused. */
	blockedUntil?: number;
}

const clients = new Map<string, ClientState>();

function pruneClient(state: ClientState, now: number): void {
	const cutoff = now - WINDOW_MS;
	state.failures = state.failures.filter((t) => t > cutoff);
}

function isExpired(state: ClientState, now: number): boolean {
	return (
		state.failures.length === 0 &&
		(state.blockedUntil === undefined || state.blockedUntil <= now)
	);
}

/** Drop clients with no live failures and no active block. */
function sweep(now: number = Date.now()): void {
	for (const [ip, state] of clients) {
		pruneClient(state, now);
		if (isExpired(state, now)) clients.delete(ip);
	}
}

const sweepTimer = setInterval(() => sweep(), SWEEP_MS);
// Never keep the process alive for the sweep.
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

export interface ThrottleDecision {
	allowed: boolean;
	/** Rough hint for a `Retry-After`; deliberately coarse (no precise leak). */
	retryAfterSeconds?: number;
}

/**
 * Decide whether a login attempt from `clientId` may proceed. Call **before**
 * verifying the password. A denied decision means either the cool-off is active
 * or this is the attempt that trips it.
 */
export function checkLoginAllowed(clientId: string, now: number = Date.now()): ThrottleDecision {
	const state = clients.get(clientId);
	if (!state) return { allowed: true };

	pruneClient(state, now);

	if (state.blockedUntil !== undefined && now < state.blockedUntil) {
		return { allowed: false, retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000) };
	}

	if (state.failures.length >= MAX_FAILURES) {
		state.blockedUntil = now + COOLOFF_MS;
		return { allowed: false, retryAfterSeconds: Math.ceil(COOLOFF_MS / 1000) };
	}

	if (isExpired(state, now)) clients.delete(clientId);
	return { allowed: true };
}

/** Record one failed attempt for `clientId` (a real wrong-password result). */
export function recordLoginFailure(clientId: string, now: number = Date.now()): void {
	const state = clients.get(clientId) ?? { failures: [] };
	pruneClient(state, now);
	state.failures.push(now);
	clients.set(clientId, state);
}

/** Clear a client's counter after a successful login. */
export function recordLoginSuccess(clientId: string): void {
	clients.delete(clientId);
}

/** Test-only: wipe all throttle state. */
export function resetRateLimiterForTests(): void {
	clients.clear();
}

/** Test-only: run the periodic sweep synchronously. */
export function sweepRateLimiterForTests(now: number = Date.now()): void {
	sweep(now);
}
