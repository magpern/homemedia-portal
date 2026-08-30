/**
 * Route authorization model (spec FR-001, FR-010; `contracts/README.md`
 * authorization matrix; `contracts/http-routes.md`; Constitution V).
 *
 * Pure decision function — no framework objects, no I/O — so it is exhaustively
 * unit-testable. `hooks.server.ts` maps the decision to a response.
 *
 * Model:
 *   - static build/`static` assets: always allowed;
 *   - `/login`: always allowed (public);
 *   - `/logout`: always allowed to reach the route (the action clears state
 *     whether or not a session exists; `GET` there is a 405 handled by the route);
 *   - `/healthz`: public when it exists (added in WP10) — the sole unauthenticated
 *     non-static route;
 *   - `/api/*` (e.g. the future `/api/services`): without a session -> `401` JSON,
 *     never a redirect (it is a fetch target);
 *   - everything else (portal application routes) without a session -> redirect
 *     to `/login` carrying a safe `redirectTo`.
 */

/** Path prefixes and exact paths served without authentication. */
const PUBLIC_EXACT = new Set(['/login', '/logout', '/healthz']);
const PUBLIC_PREFIXES = ['/_app/'];
/** Root-level static files SvelteKit / the adapter may serve from `static/`. */
const PUBLIC_STATIC_FILES = new Set([
	'/favicon.ico',
	'/favicon.svg',
	'/favicon.png',
	'/apple-touch-icon.png',
	'/robots.txt',
	'/manifest.webmanifest',
	'/service-worker.js'
]);

export type AuthDecision =
	{ type: 'allow' } | { type: 'redirect'; location: string } | { type: 'unauthorized' };

/** True for assets/routes that never require a session. */
export function isPublicPath(pathname: string): boolean {
	if (PUBLIC_EXACT.has(pathname)) return true;
	if (PUBLIC_STATIC_FILES.has(pathname)) return true;
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** True if `value` holds whitespace, a control character, or a backslash. */
function hasUnsafeChar(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code <= 0x20 || code === 0x7f || value[i] === '\\') return true;
	}
	return false;
}

/**
 * Reduce a `redirectTo` candidate to a safe same-origin path, or `'/'`.
 *
 * Accepts only an absolute path that starts with a single `/` followed by a
 * non-slash character (rejecting `//evil`, schemes, backslash tricks, and
 * anything carrying whitespace or a control character). Any query/hash is
 * dropped.
 */
export function safeRedirectTarget(candidate: unknown): string {
	if (typeof candidate !== 'string' || candidate.length === 0) return '/';
	if (candidate === '/') return '/';
	if (hasUnsafeChar(candidate)) return '/';
	if (candidate[0] !== '/' || candidate[1] === '/') return '/';
	const path = candidate.split(/[?#]/)[0];
	return path[0] === '/' && path[1] !== '/' ? path : '/';
}

/**
 * Decide how to handle a request.
 *
 * @param pathname request path (no query)
 * @param hasSession whether a valid session was verified
 */
export function authorizeRequest(pathname: string, hasSession: boolean): AuthDecision {
	if (hasSession || isPublicPath(pathname)) return { type: 'allow' };
	if (pathname === '/api' || pathname.startsWith('/api/')) return { type: 'unauthorized' };
	const target = safeRedirectTarget(pathname);
	return { type: 'redirect', location: `/login?redirectTo=${encodeURIComponent(target)}` };
}
