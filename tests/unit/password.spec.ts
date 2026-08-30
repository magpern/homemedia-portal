import { randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvForTests } from '$lib/server/env';
import { resetDummyHashForTests, verifyPortalPassword } from '$lib/server/auth/password';

const USERNAME = 'household';
const REAL_PASSWORD = 'correct horse battery staple';
let realHash: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
	realHash = await argon2id({
		password: REAL_PASSWORD,
		salt: randomBytes(16),
		parallelism: 1,
		iterations: 2,
		memorySize: 19456,
		hashLength: 32,
		outputType: 'encoded'
	});
});

beforeEach(() => {
	Object.assign(process.env, {
		PORTAL_USERNAME: USERNAME,
		PORTAL_PASSWORD_ARGON2: realHash,
		SESSION_SECRET: 'x'.repeat(40),
		DOCKER_PROXY_URL: 'http://socket-proxy.invalid/'
	});
	resetEnvForTests();
	resetDummyHashForTests();
});

afterEach(() => {
	process.env = { ...savedEnv };
	resetEnvForTests();
});

describe('verifyPortalPassword', () => {
	it('accepts the correct password when the username matches', async () => {
		await expect(verifyPortalPassword(REAL_PASSWORD, true)).resolves.toBe(true);
	});

	it('rejects a wrong password even when the username matches', async () => {
		await expect(verifyPortalPassword('wrong', true)).resolves.toBe(false);
	});

	it('rejects the correct password when the username does not match', async () => {
		await expect(verifyPortalPassword(REAL_PASSWORD, false)).resolves.toBe(false);
	});

	it('rejects a wrong password when the username does not match', async () => {
		await expect(verifyPortalPassword('wrong', false)).resolves.toBe(false);
	});

	it('rejects an empty password without throwing', async () => {
		await expect(verifyPortalPassword('', true)).resolves.toBe(false);
		await expect(verifyPortalPassword('', false)).resolves.toBe(false);
	});
});

describe('constant-work dummy path (FR-004)', () => {
	it('runs a real Argon2id verification on the username-mismatch path', async () => {
		// Both paths must do genuine hashing work — a fast string compare would leak
		// that the username is unknown. Argon2id with m=19 MiB is reliably non-trivial.
		const t0 = performance.now();
		await verifyPortalPassword('anything', false);
		const dummyMs = performance.now() - t0;

		const t1 = performance.now();
		await verifyPortalPassword('also wrong', true);
		const realMs = performance.now() - t1;

		expect(dummyMs).toBeGreaterThan(1);
		expect(realMs).toBeGreaterThan(1);
		// Same Argon2 parameters → comparable cost (generous ratio for CI noise).
		const ratio = Math.max(dummyMs, realMs) / Math.max(1, Math.min(dummyMs, realMs));
		expect(ratio).toBeLessThan(8);
	});
});
