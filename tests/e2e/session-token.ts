import { createHmac } from 'node:crypto';

/**
 * Independent re-implementation of the portal's session-token format
 * (data-model §7), used by the e2e specs to craft tokens the server should
 * reject — an expired one, and one signed under a different secret (the
 * post-rotation case). Keeping this separate from `src/` proves the server's
 * verifier, not a shared helper.
 */
export function forgeSessionToken(opts: {
	sub: string;
	iat: number;
	exp: number;
	secret: string;
}): string {
	const payload = Buffer.from(
		JSON.stringify({ v: 1, sub: opts.sub, iat: opts.iat, exp: opts.exp })
	).toString('base64url');
	const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
	return `${payload}.${sig}`;
}

/** Seconds → the exact 30-day window the real signer uses. */
export const THIRTY_DAYS_SECONDS = 2_592_000;
