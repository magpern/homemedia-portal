import { afterEach, describe, expect, it } from 'vitest';
import { EnvValidationError, getEnv, resetEnvForTests, validateEnv } from '$lib/server/env';

/** Build an Argon2id PHC string by joining parts (avoids a literal hash prefix in source). */
function argon2idPhc({ m = 19456, t = 2, p = 1 } = {}): string {
	const salt = Buffer.from('0123456789abcdef').toString('base64');
	const hash = Buffer.from('x'.repeat(32)).toString('base64');
	return ['', 'argon2id', 'v=19', `m=${m},t=${t},p=${p}`, salt, hash].join('$');
}

const SECRET_32 = 'a'.repeat(32);

function validSource(overrides: Record<string, string | undefined> = {}) {
	return {
		PORTAL_USERNAME: 'household',
		PORTAL_PASSWORD_ARGON2: argon2idPhc(),
		SESSION_SECRET: SECRET_32,
		DOCKER_PROXY_URL: 'http://socket-proxy.invalid/',
		...overrides
	};
}

describe('validateEnv — valid configuration', () => {
	it('returns the parsed RuntimeConfig shape', () => {
		const cfg = validateEnv(validSource());
		expect(cfg).toEqual({
			portalUsername: 'household',
			portalPasswordArgon2: expect.stringContaining('v=19'),
			sessionSecret: SECRET_32,
			dockerProxyUrl: 'http://socket-proxy.invalid/',
			serviceLinkBase: null,
			origin: null
		});
	});

	it('trims PORTAL_USERNAME', () => {
		expect(validateEnv(validSource({ PORTAL_USERNAME: '  house  ' })).portalUsername).toBe(
			'house'
		);
	});

	it('accepts a base64 SESSION_SECRET generated from 48 random bytes', () => {
		const secret = Buffer.from('r'.repeat(48)).toString('base64');
		expect(validateEnv(validSource({ SESSION_SECRET: secret })).sessionSecret).toBe(secret);
	});

	it('accepts and returns a bare-host SERVICE_LINK_BASE', () => {
		expect(
			validateEnv(validSource({ SERVICE_LINK_BASE: 'services.example' })).serviceLinkBase
		).toBe('services.example');
	});

	it('accepts an https DOCKER_PROXY_URL', () => {
		expect(
			validateEnv(validSource({ DOCKER_PROXY_URL: 'https://proxy.invalid/' })).dockerProxyUrl
		).toBe('https://proxy.invalid/');
	});

	it('accepts ORIGIN when present and valid', () => {
		expect(validateEnv(validSource({ ORIGIN: 'https://portal.invalid' })).origin).toBe(
			'https://portal.invalid'
		);
	});
});

describe('validateEnv — required values', () => {
	it.each([
		['PORTAL_USERNAME', { PORTAL_USERNAME: undefined }],
		['PORTAL_USERNAME', { PORTAL_USERNAME: '   ' }],
		['PORTAL_PASSWORD_ARGON2', { PORTAL_PASSWORD_ARGON2: undefined }],
		['SESSION_SECRET', { SESSION_SECRET: undefined }],
		['DOCKER_PROXY_URL', { DOCKER_PROXY_URL: undefined }]
	])('fails closed when %s is missing/blank', (name, override) => {
		try {
			validateEnv(validSource(override));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(EnvValidationError);
			expect((err as EnvValidationError).problems.join('\n')).toContain(name);
		}
	});

	it('aggregates every problem in one error', () => {
		try {
			validateEnv({});
			expect.unreachable('should have thrown');
		} catch (err) {
			const problems = (err as EnvValidationError).problems;
			expect(problems.some((p) => p.includes('PORTAL_USERNAME'))).toBe(true);
			expect(problems.some((p) => p.includes('PORTAL_PASSWORD_ARGON2'))).toBe(true);
			expect(problems.some((p) => p.includes('SESSION_SECRET'))).toBe(true);
			expect(problems.some((p) => p.includes('DOCKER_PROXY_URL'))).toBe(true);
		}
	});
});

describe('validateEnv — malformed values', () => {
	it('rejects PORTAL_PASSWORD_ARGON2 that is not an Argon2id PHC string', () => {
		for (const bad of [
			'plaintext',
			'$2b$12$abcdefghijklmnopqrstuv',
			'argon2id-without-dollars'
		]) {
			expect(() => validateEnv(validSource({ PORTAL_PASSWORD_ARGON2: bad }))).toThrow(
				EnvValidationError
			);
		}
	});

	it('rejects a SESSION_SECRET shorter than 32 bytes', () => {
		expect(() => validateEnv(validSource({ SESSION_SECRET: 'tooshort' }))).toThrow(
			EnvValidationError
		);
	});

	it('rejects a non-absolute or non-http(s) DOCKER_PROXY_URL', () => {
		for (const bad of ['not a url', '/relative', 'ftp://host/', 'ws://host/']) {
			expect(() => validateEnv(validSource({ DOCKER_PROXY_URL: bad }))).toThrow(
				EnvValidationError
			);
		}
	});

	it('rejects a SERVICE_LINK_BASE that carries a scheme, port, or path', () => {
		for (const bad of ['http://host', 'host:port', 'host/path', 'host name']) {
			expect(() => validateEnv(validSource({ SERVICE_LINK_BASE: bad }))).toThrow(
				EnvValidationError
			);
		}
	});

	it('rejects a malformed ORIGIN when present', () => {
		expect(() => validateEnv(validSource({ ORIGIN: 'notaurl' }))).toThrow(EnvValidationError);
	});
});

describe('validateEnv — ORIGIN requirement', () => {
	it('requires ORIGIN only when requireOrigin is set', () => {
		expect(validateEnv(validSource()).origin).toBeNull();
		expect(() => validateEnv(validSource(), { requireOrigin: true })).toThrow(
			EnvValidationError
		);
	});
});

describe('getEnv', () => {
	const saved = { ...process.env };
	afterEach(() => {
		process.env = { ...saved };
		resetEnvForTests();
	});

	it('reads process.env, validates, and memoises the result', () => {
		Object.assign(process.env, validSource());
		const first = getEnv();
		expect(first.portalUsername).toBe('household');
		// mutate the environment — the memoised value must not change
		process.env.PORTAL_USERNAME = 'changed';
		expect(getEnv()).toBe(first);
		resetEnvForTests();
		expect(getEnv().portalUsername).toBe('changed');
	});

	it('throws EnvValidationError when process.env is incomplete', () => {
		for (const key of [
			'PORTAL_USERNAME',
			'PORTAL_PASSWORD_ARGON2',
			'SESSION_SECRET',
			'DOCKER_PROXY_URL'
		]) {
			delete process.env[key];
		}
		expect(() => getEnv()).toThrow(EnvValidationError);
	});
});

describe('validateEnv — never leaks values', () => {
	it('keeps secret-like values out of the error message', () => {
		const sentinel = 'SENTINEL_SECRET_VALUE_9e3f';
		try {
			validateEnv({
				PORTAL_USERNAME: 'household',
				PORTAL_PASSWORD_ARGON2: sentinel,
				SESSION_SECRET: sentinel,
				DOCKER_PROXY_URL: sentinel
			});
			expect.unreachable('should have thrown');
		} catch (err) {
			expect((err as Error).message).not.toContain(sentinel);
			expect((err as EnvValidationError).problems.join('\n')).not.toContain(sentinel);
		}
	});
});
