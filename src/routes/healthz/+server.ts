import type { RequestHandler } from './$types';
import { getEnv } from '$lib/server/env';

/**
 * Unauthenticated liveness endpoint (spec FR-025, US5;
 * `contracts/http-routes.md` `GET /healthz`).
 *
 * - No session required — the route is public in the authorization model
 *   (`src/lib/server/auth/authorize.ts`).
 * - `200 {"status":"ok"}` while the process is up **and** the runtime
 *   configuration validated at boot. No other fields.
 * - `503 {"status":"unavailable"}` if the app is running but not ready to serve
 *   (rare — a misconfigured process normally exits at startup via
 *   `hooks.server.ts`).
 * - Liveness of the **portal**, never of the Docker source: this handler makes
 *   no Docker call, so `/healthz` stays `ok` even when the socket-proxy is down
 *   (spec US5, `contracts/docker-api-contract.md`).
 * - Discloses nothing: no service inventory, counts, container data, versions,
 *   session state, environment values, or diagnostic internals — just `status`.
 * - `Cache-Control: no-store` (also enforced for this path by the hook).
 */
const NO_STORE = { 'cache-control': 'no-store', 'content-type': 'application/json' };

export const GET: RequestHandler = () => {
	try {
		// Throws EnvValidationError if a required value is missing/malformed.
		getEnv();
	} catch {
		return new Response(JSON.stringify({ status: 'unavailable' }), {
			status: 503,
			headers: NO_STORE
		});
	}

	return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: NO_STORE });
};
