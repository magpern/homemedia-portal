import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { getEnv } from '$lib/server/env';
import { authorizeRequest } from '$lib/server/auth/authorize';
import { SESSION_COOKIE_NAME, verifySession } from '$lib/server/auth/session';
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
 * Request hook:
 *   1. verify the session cookie and attach `locals.session` (WP3);
 *   2. authorize the route — portal application routes require a session,
 *      unauthenticated ones redirect to `/login` (302, safe `redirectTo` only);
 *      an unauthenticated `/api/*` request gets `401` JSON, never a redirect;
 *      static assets, `/login`, `/logout`, and the future `/healthz` stay public
 *      (`contracts/README.md` authorization matrix, Constitution V);
 *   3. apply the strict security headers + cache-control rules to every response
 *      (`contracts/README.md`).
 *
 * No authentication detail (username, token, reason) ever appears in a redirect
 * URL, header, log line, or response body.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);
	event.locals.session = token ? verifySession(token) : null;

	const decision = authorizeRequest(event.url.pathname, event.locals.session !== null);

	if (decision.type !== 'allow') {
		const response =
			decision.type === 'redirect'
				? new Response(null, { status: 302, headers: { location: decision.location } })
				: new Response(JSON.stringify({ error: 'unauthorized' }), {
						status: 401,
						headers: { 'content-type': 'application/json' }
					});
		applySecurityHeaders(response.headers);
		response.headers.set('cache-control', 'no-store');
		return response;
	}

	const response = await resolve(event);
	applySecurityHeaders(response.headers);
	applyCacheControl(response.headers, event.url.pathname, response.headers.get('content-type'));
	return response;
};
