/**
 * Runtime configuration for Portal v1 — parsed and validated once at startup.
 *
 * The portal must **fail closed**: if a required value is missing or malformed the
 * process exits non-zero and serves nothing (see `src/hooks.server.ts`). This
 * module only validates configuration — it performs no authentication, Docker
 * access, or link building (those arrive in later work packages).
 *
 * Values are **never logged** and never appear in errors: {@link EnvValidationError}
 * reports the *name* and the *rule* that failed, not the offending value.
 *
 * Approved surface — see `specs/001-portal-v1/data-model.md` §9 and
 * `specs/001-portal-v1/contracts/README.md`.
 */

/** The validated shape the rest of the server code may rely on. */
export interface RuntimeConfig {
	/** Shared household login name. */
	portalUsername: string;
	/** Argon2id password hash, PHC string form. Never logged. */
	portalPasswordArgon2: string;
	/** HMAC key for the stateless session cookie; ≥ 32 bytes. Never logged. */
	sessionSecret: string;
	/** Absolute `http(s)` URL of the internal Docker socket-proxy. */
	dockerProxyUrl: string;
	/** Bare host used to build `homemedia.port` links; `null` when unset. */
	serviceLinkBase: string | null;
	/** Absolute `http(s)` origin the adapter uses for URL/CSRF/cookie logic. */
	origin: string | null;
}

/** Thrown when configuration is absent or malformed. Carries names + rules only. */
export class EnvValidationError extends Error {
	readonly problems: readonly string[];
	constructor(problems: readonly string[]) {
		super(
			'Invalid runtime configuration:\n' +
				problems.map((p) => `  - ${p}`).join('\n') +
				'\nSet these before starting the portal. Configuration values are never logged.'
		);
		this.name = 'EnvValidationError';
		this.problems = problems;
	}
}

/** PHC string for Argon2id: the `argon2id` id, then `v=`, `m=,t=,p=`, salt, hash. */
const ARGON2ID_PHC =
	/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+(?:,keyid=[^$]+)?(?:,data=[^$]+)?\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;

/** Bare host (hostname or IPv4) — no scheme, no port, no path. */
const BARE_HOST = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Effective entropy of `SESSION_SECRET` in bytes.
 *
 * The documented way to generate it is `openssl rand -base64 48` (64 chars). If
 * the value round-trips as base64/base64url we measure the decoded length;
 * otherwise we measure the raw UTF-8 length. The larger of the two must be
 * ≥ 32 — anything shorter fails closed.
 */
function secretByteLength(value: string): number {
	const raw = Buffer.byteLength(value, 'utf8');
	if (/^[A-Za-z0-9+/\-_]+={0,2}$/.test(value)) {
		const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
		const decoded = Buffer.from(b64, 'base64');
		const reencoded = decoded.toString('base64').replace(/=+$/, '');
		if (decoded.length > 0 && reencoded === b64.replace(/=+$/, '')) {
			return Math.max(raw, decoded.length);
		}
	}
	return raw;
}

function isAbsoluteHttpUrl(value: string): boolean {
	try {
		const u = new URL(value);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

export interface ValidateEnvOptions {
	/**
	 * Require `ORIGIN` (the deployed server always has it; dev and unit tests
	 * usually do not). Defaults to `false`.
	 */
	requireOrigin?: boolean;
}

/**
 * Pure validator. Reads from `source` (defaults to `process.env`), returns a
 * {@link RuntimeConfig}, or throws {@link EnvValidationError} listing every
 * problem found.
 */
export function validateEnv(
	source: Record<string, string | undefined> = process.env,
	{ requireOrigin = false }: ValidateEnvOptions = {}
): RuntimeConfig {
	const problems: string[] = [];

	const rawUsername = source.PORTAL_USERNAME;
	if (!rawUsername || rawUsername.trim().length === 0) {
		problems.push('PORTAL_USERNAME is required and must be non-empty');
	}

	const rawPassword = source.PORTAL_PASSWORD_ARGON2;
	if (!rawPassword) {
		problems.push('PORTAL_PASSWORD_ARGON2 is required');
	} else if (!ARGON2ID_PHC.test(rawPassword)) {
		problems.push('PORTAL_PASSWORD_ARGON2 must be an Argon2id PHC hash string');
	}

	const rawSecret = source.SESSION_SECRET;
	if (!rawSecret) {
		problems.push('SESSION_SECRET is required');
	} else if (secretByteLength(rawSecret) < 32) {
		problems.push('SESSION_SECRET must be at least 32 bytes (e.g. `openssl rand -base64 48`)');
	}

	const rawProxyUrl = source.DOCKER_PROXY_URL;
	if (!rawProxyUrl) {
		problems.push('DOCKER_PROXY_URL is required');
	} else if (!isAbsoluteHttpUrl(rawProxyUrl)) {
		problems.push('DOCKER_PROXY_URL must be an absolute http(s) URL');
	}

	const rawLinkBase = source.SERVICE_LINK_BASE?.trim();
	let serviceLinkBase: string | null = null;
	if (rawLinkBase) {
		if (rawLinkBase.includes('://') || rawLinkBase.includes('/') || rawLinkBase.includes(':')) {
			problems.push('SERVICE_LINK_BASE must be a bare host — no scheme, port, or path');
		} else if (!BARE_HOST.test(rawLinkBase)) {
			problems.push('SERVICE_LINK_BASE is not a valid host');
		} else {
			serviceLinkBase = rawLinkBase;
		}
	}

	const rawOrigin = source.ORIGIN?.trim();
	let origin: string | null = null;
	if (!rawOrigin) {
		if (requireOrigin) problems.push('ORIGIN is required and must be an absolute http(s) URL');
	} else if (!isAbsoluteHttpUrl(rawOrigin)) {
		problems.push('ORIGIN must be an absolute http(s) URL');
	} else {
		origin = rawOrigin;
	}

	if (problems.length > 0) throw new EnvValidationError(problems);

	return {
		portalUsername: rawUsername!.trim(),
		portalPasswordArgon2: rawPassword!,
		sessionSecret: rawSecret!,
		dockerProxyUrl: rawProxyUrl!,
		serviceLinkBase,
		origin
	};
}

let cached: RuntimeConfig | undefined;

/**
 * Memoised accessor for the process's runtime configuration. `ORIGIN` is required
 * only in a production build (`import.meta.env.PROD`).
 */
export function getEnv(): RuntimeConfig {
	if (!cached) {
		cached = validateEnv(process.env, { requireOrigin: import.meta.env.PROD });
	}
	return cached;
}

/** Test-only: drop the memoised config so the next {@link getEnv} re-reads. */
export function resetEnvForTests(): void {
	cached = undefined;
}
