import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvForTests } from '$lib/server/env';
import { GET } from '../../src/routes/healthz/+server.ts';

/**
 * WP10 — `GET /healthz` (spec FR-025; `contracts/http-routes.md`).
 *
 * The handler ignores its `RequestEvent`, so an empty object is a sufficient
 * stand-in for these unit checks; the HTTPS-harness e2e exercises the real
 * request path.
 */
const event = {} as Parameters<typeof GET>[0];
const invoke = () => Promise.resolve(GET(event));

/** PHC string built by joining parts — no literal `$argon2…$` prefix in source. */
function argon2idPhc(): string {
	const salt = Buffer.from('0123456789abcdef').toString('base64');
	const hash = Buffer.from('x'.repeat(32)).toString('base64');
	return ['', 'argon2id', 'v=19', 'm=19456,t=2,p=1', salt, hash].join('$');
}

const savedEnv = { ...process.env };

function setValidEnv() {
	Object.assign(process.env, {
		PORTAL_USERNAME: 'household',
		PORTAL_PASSWORD_ARGON2: argon2idPhc(),
		SESSION_SECRET: 'a'.repeat(40),
		DOCKER_PROXY_URL: 'http://socket-proxy.invalid/'
	});
	resetEnvForTests();
}

beforeEach(() => {
	process.env = { ...savedEnv };
});

afterEach(() => {
	process.env = { ...savedEnv };
	resetEnvForTests();
});

describe('GET /healthz — booted + configured', () => {
	it('returns 200 with exactly {"status":"ok"}', async () => {
		setValidEnv();
		const res = await invoke();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ status: 'ok' });
		expect(Object.keys(body)).toEqual(['status']);
	});

	it('sets Cache-Control: no-store and a JSON content type', async () => {
		setValidEnv();
		const res = await invoke();
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('content-type')).toContain('application/json');
		await res.json();
	});

	it('discloses nothing beyond status — no inventory, counts, env, session, or version', async () => {
		setValidEnv();
		const text = await (await invoke()).text();
		expect(text).toBe('{"status":"ok"}');
		for (const leak of ['household', 'socket-proxy', 'SESSION', 'version', 'count', 'docker']) {
			expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
		}
	});

	it('does not read Docker — stays ok regardless of any proxy state', async () => {
		setValidEnv();
		// No fetch is stubbed and no Docker call is possible; the handler must
		// still answer 200 (portal liveness is not Docker-source liveness).
		expect((await invoke()).status).toBe(200);
	});
});

describe('GET /healthz — running but not ready', () => {
	it('returns 503 {"status":"unavailable"} when required config is missing', async () => {
		delete process.env.SESSION_SECRET;
		delete process.env.PORTAL_PASSWORD_ARGON2;
		resetEnvForTests();
		const res = await invoke();
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ status: 'unavailable' });
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});
