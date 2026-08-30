/**
 * Argon2id helper for the e2e harness only.
 *
 * Kept in its own module so `tests/harness/lib.js` (imported by a Vitest spec)
 * does not pull in the WASM hasher. Used by `run-e2e.mjs` to derive a real
 * `PORTAL_PASSWORD_ARGON2` for a throwaway password generated per run.
 */
import { randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';

/**
 * OWASP-minimum Argon2id parameters (research R5), matching the app's real hash.
 * @param {string} password
 * @returns {Promise<string>} PHC-encoded Argon2id hash
 */
export async function realArgon2idPhc(password) {
	return argon2id({
		password,
		salt: randomBytes(16),
		parallelism: 1,
		iterations: 2,
		memorySize: 19456,
		hashLength: 32,
		outputType: 'encoded'
	});
}
