import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	discoverLabelledContainers,
	isEnableLabelTruthy,
	toRawContainer
} from '$lib/server/docker/discovery';
import { resetEnvForTests } from '$lib/server/env';

const PROXY = 'http://socket-proxy.invalid/';
const savedEnv = { ...process.env };

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

const entry = (overrides: Record<string, unknown> = {}) => ({
	Id: 'c0ffee',
	Names: ['/example'],
	Image: 'example/image:1',
	State: 'running',
	Labels: { 'homemedia.enable': 'true' },
	...overrides
});

beforeEach(() => {
	Object.assign(process.env, {
		PORTAL_USERNAME: 'household',
		PORTAL_PASSWORD_ARGON2: [
			'',
			'argon2id',
			'v=19',
			'm=19456,t=2,p=1',
			'c2FsdA',
			'aGFzaA'
		].join('$'),
		SESSION_SECRET: 'x'.repeat(40),
		DOCKER_PROXY_URL: PROXY
	});
	resetEnvForTests();
});

afterEach(() => {
	process.env = { ...savedEnv };
	resetEnvForTests();
});

describe('isEnableLabelTruthy', () => {
	it.each(['true', 'TRUE', ' True ', '1', 'yes', 'YES'])('accepts %j', (value) => {
		expect(isEnableLabelTruthy(value)).toBe(true);
	});

	it.each(['false', '0', 'no', '', 'enabled', undefined, null, 1, {}])('rejects %j', (value) => {
		expect(isEnableLabelTruthy(value)).toBe(false);
	});
});

describe('toRawContainer — strict opt-in + safe defaults', () => {
	it('projects a valid opted-in entry, keeping only string labels', () => {
		expect(
			toRawContainer(
				entry({ Labels: { 'homemedia.enable': 'true', 'homemedia.name': 'X', bogus: 5 } })
			)
		).toEqual({
			id: 'c0ffee',
			names: ['/example'],
			image: 'example/image:1',
			stateString: 'running',
			labels: { 'homemedia.enable': 'true', 'homemedia.name': 'X' }
		});
	});

	it('drops an entry that is not opted in, whatever the server-side filter returned', () => {
		expect(toRawContainer(entry({ Labels: { 'homemedia.enable': 'false' } }))).toBeNull();
		expect(toRawContainer(entry({ Labels: {} }))).toBeNull();
		expect(toRawContainer(entry({ Labels: { 'homemedia.enabled': 'true' } }))).toBeNull();
	});

	it('drops malformed entries instead of throwing', () => {
		for (const bad of [null, 42, 'str', {}, { Id: '' }, { Id: 5 }, entry({ Id: undefined })]) {
			expect(toRawContainer(bad)).toBeNull();
		}
	});

	it('tolerates missing optional fields with safe defaults', () => {
		expect(toRawContainer({ Id: 'abc', Labels: { 'homemedia.enable': 'yes' } })).toEqual({
			id: 'abc',
			names: [],
			image: '',
			stateString: '',
			labels: { 'homemedia.enable': 'yes' }
		});
	});
});

describe('discoverLabelledContainers', () => {
	it('returns only opted-in containers on success', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValue(
				jsonResponse([
					entry({ Id: 'a' }),
					entry({ Id: 'b', Labels: { 'homemedia.enable': 'false' } }),
					entry({ Id: 'c', Labels: { 'homemedia.enable': '1' } }),
					{ not: 'a container' }
				])
			);
		const result = await discoverLabelledContainers({ fetch });
		expect(result).toEqual({
			ok: true,
			containers: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'c' })]
		});
	});

	it('returns { ok: true, containers: [] } when nothing is labelled', async () => {
		const fetch = vi.fn().mockResolvedValue(jsonResponse([]));
		expect(await discoverLabelledContainers({ fetch })).toEqual({ ok: true, containers: [] });
	});

	it('returns { ok: false } — never throws — when the list call fails', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }));
		const result = await discoverLabelledContainers({ fetch });
		expect(result.ok).toBe(false);
		expect(result).toHaveProperty('reason');
	});

	it('returns { ok: false } when the proxy is unreachable', async () => {
		const fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		expect((await discoverLabelledContainers({ fetch })).ok).toBe(false);
	});

	it('returns { ok: false } for a non-array body — no list fabricated', async () => {
		const fetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'unexpected' }));
		expect((await discoverLabelledContainers({ fetch })).ok).toBe(false);
	});
});
