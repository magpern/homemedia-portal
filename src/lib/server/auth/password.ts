/**
 * Shared-household password verification (spec FR-003, FR-004; research R5).
 *
 * Server-only. Argon2id via `hash-wasm` — pure WebAssembly, so the container
 * needs no native build toolchain. The plaintext is never stored or logged; only
 * the configured PHC hash string (`PORTAL_PASSWORD_ARGON2`) is compared against.
 *
 * A verification is **always** run — against the real hash when the submitted
 * username matches the configured one, otherwise against a fixed in-process
 * dummy hash — so the work done and the time taken do not reveal whether the
 * username exists (FR-004). The result is a boolean and nothing else.
 */

import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { getEnv } from '$lib/server/env';

/** OWASP minimum for Argon2id (research R5) — also the params of the real hash. */
const ARGON2_PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

/**
 * A genuine Argon2id hash of a random throwaway secret, computed once per
 * process. Used only for the constant-work path when the username does not
 * match; its verification result is discarded. Generating it at runtime keeps
 * no hash literal in the repository (Constitution IX).
 */
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
	if (!dummyHashPromise) {
		dummyHashPromise = argon2id({
			password: randomBytes(32),
			salt: randomBytes(16),
			outputType: 'encoded',
			...ARGON2_PARAMS
		});
	}
	return dummyHashPromise;
}

/**
 * Verify a submitted credential.
 *
 * @param password submitted plaintext
 * @param usernameMatches whether the submitted username equals `PORTAL_USERNAME`
 *   (pass `true` when the form carries no username field — the single shared
 *   account is implied)
 * @returns `true` only when the username matches **and** the password verifies.
 */
export async function verifyPortalPassword(
	password: string,
	usernameMatches: boolean
): Promise<boolean> {
	const hash = usernameMatches ? getEnv().portalPasswordArgon2 : await dummyHash();

	let matched: boolean;
	try {
		matched = await argon2Verify({ password, hash });
	} catch {
		matched = false;
	}

	return usernameMatches && matched;
}

/** Test-only: force the dummy hash to be recomputed on next use. */
export function resetDummyHashForTests(): void {
	dummyHashPromise = undefined;
}
