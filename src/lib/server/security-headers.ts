/**
 * Security response headers + cache-control rules for every response.
 *
 * Authoritative source: `specs/001-portal-v1/contracts/README.md`
 * ("Cross-cutting response rules") and `contracts/http-routes.md`.
 *
 * - strict same-origin CSP: `default-src 'self'`, no third-party origins, no
 *   `unsafe-inline`/`unsafe-eval` scripts. SvelteKit adds per-page hashes for its
 *   own inline bootstrap via `kit.csp` (configured in `vite.config.ts`); this
 *   module supplies the identical policy for non-page responses (endpoints,
 *   static assets, error pages).
 * - `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
 *   `X-Frame-Options: DENY` (+ `frame-ancestors 'none'` in the CSP), minimal
 *   `Permissions-Policy`.
 * - `Cache-Control: no-store` on all HTML and the machine endpoints; hashed
 *   build assets keep their long-lived immutable caching.
 *
 * No dependency on `$app`, env, or SvelteKit runtime — safe to import from
 * `vite.config.ts` as well as server code.
 */

/** CSP directives in SvelteKit's object form (also reused for the header string). */
export const cspDirectives = {
	'default-src': ['self'],
	'script-src': ['self'],
	'style-src': ['self'],
	'img-src': ['self', 'data:'],
	'font-src': ['self'],
	'connect-src': ['self'],
	'manifest-src': ['self'],
	'worker-src': ['self'],
	'base-uri': ['self'],
	'form-action': ['self'],
	'frame-ancestors': ['none'],
	'object-src': ['none']
} as const satisfies Record<string, readonly string[]>;

const CSP_KEYWORDS = new Set([
	'self',
	'none',
	'unsafe-inline',
	'unsafe-eval',
	'strict-dynamic',
	'report-sample'
]);

function cspToken(source: string): string {
	return CSP_KEYWORDS.has(source) ? `'${source}'` : source;
}

/** Serialise {@link cspDirectives} to a `Content-Security-Policy` header value. */
export function serializeCsp(directives: Record<string, readonly string[]>): string {
	return Object.entries(directives)
		.map(([name, sources]) => `${name} ${sources.map(cspToken).join(' ')}`)
		.join('; ');
}

/** The strict CSP as a header string (matches {@link cspDirectives}). */
export const contentSecurityPolicy = serializeCsp(cspDirectives);

/** Browser features the portal never uses — all denied. */
const DENIED_FEATURES = [
	'accelerometer',
	'autoplay',
	'camera',
	'display-capture',
	'encrypted-media',
	'fullscreen',
	'geolocation',
	'gyroscope',
	'hid',
	'idle-detection',
	'magnetometer',
	'microphone',
	'midi',
	'payment',
	'picture-in-picture',
	'publickey-credentials-get',
	'screen-wake-lock',
	'serial',
	'usb',
	'xr-spatial-tracking'
];

/** Minimal `Permissions-Policy`: deny every feature the portal does not use. */
export const permissionsPolicy = DENIED_FEATURES.map((f) => `${f}=()`).join(', ');

/** Static security headers applied to every response (CSP handled separately). */
export const securityHeaders: Readonly<Record<string, string>> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'same-origin',
	'x-frame-options': 'DENY',
	'permissions-policy': permissionsPolicy
};

/**
 * Apply the security headers to `headers`. The CSP is only set when one is not
 * already present, so SvelteKit's per-page hashed policy is preserved.
 */
export function applySecurityHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(securityHeaders)) {
		headers.set(name, value);
	}
	if (!headers.has('content-security-policy')) {
		headers.set('content-security-policy', contentSecurityPolicy);
	}
}

/** Paths whose responses must never be stored, in addition to all HTML. */
const MACHINE_ENDPOINTS = new Set(['/healthz', '/api/services']);

/** Prefix of content-hashed, immutable build assets. */
const IMMUTABLE_PREFIX = '/_app/immutable/';

/**
 * Apply `Cache-Control: no-store` to HTML and the machine endpoints; leave
 * static assets (immutable build output, `static/`) with their existing caching.
 */
export function applyCacheControl(
	headers: Headers,
	pathname: string,
	contentType: string | null
): void {
	if (pathname.startsWith(IMMUTABLE_PREFIX)) return;
	const isHtml = (contentType ?? '').includes('text/html');
	if (isHtml || MACHINE_ENDPOINTS.has(pathname)) {
		headers.set('cache-control', 'no-store');
	}
}
