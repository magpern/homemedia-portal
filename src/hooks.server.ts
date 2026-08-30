import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { getEnv } from '$lib/server/env';
import { applyCacheControl, applySecurityHeaders } from '$lib/server/security-headers';

/**
 * Fail closed at startup. Validating configuration here means a misconfigured
 * portal exits non-zero and never serves a request (data-model §9,
 * Constitution IX). Skipped during the build step — only runtime boot matters.
 */
if (!building) {
	getEnv();
}

/**
 * Base request hook: apply the strict security headers and cache-control rules
 * from `contracts/README.md` to every response. Route guards, session handling,
 * and the dashboard load are added in later work packages.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	applySecurityHeaders(response.headers);
	applyCacheControl(response.headers, event.url.pathname, response.headers.get('content-type'));
	return response;
};
