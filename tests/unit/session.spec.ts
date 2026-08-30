import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvForTests } from '$lib/server/env';
import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE_SECONDS,
	signSession,
	verifySession
} from '$lib/server/auth/session';

const USERNAME = 'household';
const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);
const savedEnv = { ...process.env };

function setEnv(secret: string, username = USERNAME) {
	Object.assign(process.env, {
		PORTAL_USERNAME: username,
		PORTAL_PASSWORD_ARGON2: [
			'',
			'argon2id',
			'v=19',
			'm=19456,t=2,p=1',
			'c2FsdA',
			'aGFzaA'
		].join('$'),
		SESSION_SECRET: secret,
		DOCKER_PROXY_URL: 'http://socket-proxy.invalid/'
	});
	resetEnvForTests();
}

/** Independent re-implementation of the token format, for forging test inputs. */
function forge(payload: unknown, secret: string): string {
	const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const s = createHmac('sha256', secret).update(p).digest('base64url');
	return `${p}.${s}`;
}

beforeEach(() => setEnv(SECRET_A));
afterEach(() => {
	process.env = { ...savedEnv };
	resetEnvForTests();
});

describe('session constants', () => {
	it('are the approved values', () => {
		expect(SESSION_COOKIE_NAME).toBe('__Host-hmp_session');
		expect(SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
	});
});

describe('signSession / verifySession round trip', () => {
	it('verifies a fresh token and pins exp to iat + exactly 30 days', () => {
		const now = 1_700_000_000_000;
		const token = signSession(USERNAME, now);
		const info = verifySession(token, now);
		expect(info).not.toBeNull();
		expect(info!.sub).toBe(USERNAME);
		expect(info!.iat).toBe(Math.floor(now / 1000));
		expect(info!.exp).toBe(info!.iat + SESSION_MAX_AGE_SECONDS);
	});

	it('accepts the token up to the instant before exp and rejects it at exp (SC-014)', () => {
		const now = 1_700_000_000_000;
		const token = signSession(USERNAME, now);
		const exp = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
		expect(verifySession(token, exp * 1000 - 1)).not.toBeNull();
		expect(verifySession(token, exp * 1000)).toBeNull();
		expect(verifySession(token, exp * 1000 + 60_000)).toBeNull();
	});
});

describe('verifySession rejects tampering', () => {
	const now = 1_700_000_000_000;

	it('a flipped signature byte', () => {
		const token = signSession(USERNAME, now);
		const [p, s] = token.split('.');
		const flipped = s[0] === 'A' ? 'B' : 'A';
		expect(verifySession(`${p}.${flipped}${s.slice(1)}`, now)).toBeNull();
	});

	it('a swapped payload the old signature no longer covers', () => {
		const good = signSession(USERNAME, now);
		const sig = good.split('.')[1];
		const evil = Buffer.from(
			JSON.stringify({ v: 1, sub: USERNAME, iat: 0, exp: SESSION_MAX_AGE_SECONDS })
		).toString('base64url');
		expect(verifySession(`${evil}.${sig}`, now)).toBeNull();
	});

	it.each([
		['not a token', 'abc'],
		['too many parts', 'a.b.c'],
		['empty', ''],
		['no signature', 'abc.'],
		['non-string', 123 as unknown]
	])('%s', (_label, bad) => {
		expect(verifySession(bad as unknown, now)).toBeNull();
	});
});

describe('verifySession — semantic checks', () => {
	const now = 1_700_000_000_000;
	const iat = Math.floor(now / 1000);

	it('rejects a correctly signed token with v != 1', () => {
		const token = forge(
			{ v: 2, sub: USERNAME, iat, exp: iat + SESSION_MAX_AGE_SECONDS },
			SECRET_A
		);
		expect(verifySession(token, now)).toBeNull();
	});

	it('rejects a correctly signed token whose sub is not the configured username', () => {
		const token = forge(
			{ v: 1, sub: 'someone-else', iat, exp: iat + SESSION_MAX_AGE_SECONDS },
			SECRET_A
		);
		expect(verifySession(token, now)).toBeNull();
	});

	it('rejects a correctly signed token whose exp is not iat + 30 days', () => {
		const token = forge({ v: 1, sub: USERNAME, iat, exp: iat + 100 }, SECRET_A);
		expect(verifySession(token, now)).toBeNull();
	});
});

describe('SESSION_SECRET rotation invalidates every session (FR-028, SC-013)', () => {
	it('a token signed under the old secret no longer verifies after rotation', () => {
		const now = 1_700_000_000_000;
		const token = signSession(USERNAME, now);
		expect(verifySession(token, now)).not.toBeNull();

		setEnv(SECRET_B); // operator rotates the secret
		expect(verifySession(token, now)).toBeNull();
	});
});
