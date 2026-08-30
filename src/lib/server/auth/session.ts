/**
 * Stateless session token — sign / verify (data-model §7, research R2/R5,
 * spec FR-006, FR-008, FR-028; SC-013, SC-014).
 *
 * Server-only. There is **no** server-side session store: the token is a signed,
 * self-describing blob. Rotating `SESSION_SECRET` changes every signature, so
 * every previously issued token stops verifying — a global forced re-auth with
 * no revocation list (FR-028).
 *
 * Token format:
 *   `base64url(JSON.stringify(payload)) + "." + base64url(HMAC_SHA256(<that>, SESSION_SECRET))`
 *   payload = { v: 1, sub, iat, exp }   // iat/exp in unix seconds, exp = iat + 30 days exactly
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SessionPayload } from '$lib/types';
import { getEnv } from '$lib/server/env';

/** Production session cookie name — `__Host-` prefix, never changed (research R2). */
export const SESSION_COOKIE_NAME = '__Host-hmp_session';

/** Exactly 30 days, in seconds (FR-006 / SC-014 — "not sooner, not later"). */
export const SESSION_MAX_AGE_SECONDS = 2_592_000;

/** Current (and only accepted) payload schema version. */
const SCHEMA_VERSION = 1;

function base64urlEncode(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

function hmac(payloadB64: string, secret: string): Buffer {
	return createHmac('sha256', secret).update(payloadB64).digest();
}

/** What a verified session exposes to the rest of the server. */
export interface SessionInfo {
	sub: string;
	iat: number;
	exp: number;
}

/**
 * Sign a fresh session token for `sub`. `now` is injectable for tests; in
 * production it is the wall clock. `exp` is pinned to `iat + 30 days` exactly.
 */
export function signSession(sub: string, now: number = Date.now()): string {
	const iat = Math.floor(now / 1000);
	const payload: SessionPayload = {
		v: SCHEMA_VERSION,
		sub,
		iat,
		exp: iat + SESSION_MAX_AGE_SECONDS
	};
	const payloadB64 = base64urlEncode(JSON.stringify(payload));
	const sigB64 = base64urlEncode(hmac(payloadB64, getEnv().sessionSecret));
	return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a session token against the current `SESSION_SECRET` and clock.
 *
 * Returns the {@link SessionInfo} only when **all** hold: exactly one `.`
 * separator; the HMAC matches (`timingSafeEqual`); the payload parses; `v === 1`;
 * `sub` equals the configured `PORTAL_USERNAME`; `exp === iat + 30 days`; and it
 * has not expired (`floor(now/1000) < exp`). Otherwise `null` — never throws,
 * never partially trusts.
 */
export function verifySession(token: unknown, now: number = Date.now()): SessionInfo | null {
	if (typeof token !== 'string' || token.length === 0) return null;

	const parts = token.split('.');
	if (parts.length !== 2) return null;
	const [payloadB64, sigB64] = parts;
	if (!payloadB64 || !sigB64) return null;

	const env = getEnv();

	let providedSig: Buffer;
	try {
		providedSig = Buffer.from(sigB64, 'base64url');
	} catch {
		return null;
	}
	const expectedSig = hmac(payloadB64, env.sessionSecret);
	if (providedSig.length !== expectedSig.length) return null;
	if (!timingSafeEqual(providedSig, expectedSig)) return null;

	let payload: unknown;
	try {
		payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (payload === null || typeof payload !== 'object') return null;
	const { v, sub, iat, exp } = payload as Record<string, unknown>;

	if (v !== SCHEMA_VERSION) return null;
	if (typeof sub !== 'string' || sub !== env.portalUsername) return null;
	if (
		typeof iat !== 'number' ||
		typeof exp !== 'number' ||
		!Number.isFinite(iat) ||
		!Number.isFinite(exp)
	) {
		return null;
	}
	if (exp !== iat + SESSION_MAX_AGE_SECONDS) return null;
	if (Math.floor(now / 1000) >= exp) return null;

	return { sub, iat, exp };
}
