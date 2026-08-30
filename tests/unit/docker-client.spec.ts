import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DOCKER_PER_CALL_TIMEOUT_MS,
	DockerDiscoveryError,
	DockerInspectError,
	dockerGetContainerInspect,
	dockerGetContainersJson
} from '$lib/server/docker/client';
import { resetEnvForTests } from '$lib/server/env';

const PROXY = 'http://socket-proxy.invalid/';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init
	});
}

const savedEnv = { ...process.env };

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
	vi.useRealTimers();
});

describe('docker client — permitted request surface', () => {
	it('discovery issues exactly one GET to /containers/json with the label filter', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse([]));
		await dockerGetContainersJson({ fetch: fetchSpy });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0];
		const parsed = new URL(String(url));
		expect(parsed.origin + parsed.pathname).toBe(`${PROXY}containers/json`);
		expect(parsed.searchParams.get('all')).toBe('1');
		expect(parsed.searchParams.get('filters')).toBe('{"label":["homemedia.enable=true"]}');
		expect(init.method).toBe('GET');
		expect(init.redirect).toBe('error');
	});

	it('inspect issues exactly one GET to /containers/{id}/json', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ State: { Status: 'running' } }));
		await dockerGetContainerInspect('abc123', { fetch: fetchSpy });

		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe(`${PROXY}containers/abc123/json`);
		expect(init.method).toBe('GET');
	});

	it('never issues a non-GET request', async () => {
		const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
		await dockerGetContainersJson({ fetch: fetchSpy });
		await dockerGetContainerInspect('abc', { fetch: fetchSpy });
		for (const [, init] of fetchSpy.mock.calls) {
			expect(init.method).toBe('GET');
			expect(init.body).toBeUndefined();
		}
	});

	it('refuses an unsafe container reference before any request', async () => {
		const fetchSpy = vi.fn();
		for (const bad of ['../../etc', 'a/b', 'id json', 'x?y', '']) {
			await expect(
				dockerGetContainerInspect(bad, { fetch: fetchSpy })
			).rejects.toBeInstanceOf(DockerInspectError);
		}
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('exposes no generic request/path/method helper', async () => {
		const mod = await import('$lib/server/docker/client');
		expect(Object.keys(mod).sort()).toEqual(
			[
				'DOCKER_OVERALL_BUDGET_MS',
				'DOCKER_PER_CALL_TIMEOUT_MS',
				'DockerDiscoveryError',
				'DockerInspectError',
				'ENABLE_LABEL_FILTER',
				'dockerGetContainerInspect',
				'dockerGetContainersJson'
			].sort()
		);
	});
});

describe('docker client — failure handling', () => {
	it('maps a non-2xx discovery response to DockerDiscoveryError', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
		await expect(dockerGetContainersJson({ fetch: fetchSpy })).rejects.toBeInstanceOf(
			DockerDiscoveryError
		);
	});

	it('maps a non-2xx inspect response to DockerInspectError carrying the ref', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
		await expect(dockerGetContainerInspect('c1', { fetch: fetchSpy })).rejects.toMatchObject({
			name: 'DockerInspectError',
			containerRef: 'c1'
		});
	});

	it('maps a transport throw to the typed error for that call kind', async () => {
		const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(dockerGetContainersJson({ fetch: fetchSpy })).rejects.toBeInstanceOf(
			DockerDiscoveryError
		);
	});

	it('maps a non-JSON body to the typed error', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
		await expect(dockerGetContainersJson({ fetch: fetchSpy })).rejects.toBeInstanceOf(
			DockerDiscoveryError
		);
	});

	it('aborts a hung call at the per-call timeout and reports a timeout', async () => {
		vi.useFakeTimers();
		const fetchSpy = vi.fn(
			(_url: unknown, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener('abort', () =>
						reject(new DOMException('aborted', 'AbortError'))
					);
				})
		);
		const pending = dockerGetContainersJson({ fetch: fetchSpy as unknown as typeof fetch });
		const assertion = expect(pending).rejects.toThrow(/timed out/);
		await vi.advanceTimersByTimeAsync(DOCKER_PER_CALL_TIMEOUT_MS + 1);
		await assertion;
	});

	it('skips the call entirely once the overall budget is exhausted', async () => {
		const fetchSpy = vi.fn();
		const now = () => 10_000;
		await expect(
			dockerGetContainersJson({ fetch: fetchSpy, now, deadline: 9_000 })
		).rejects.toThrow(/time budget/);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('docker client — source surface has no mutation or shell path', () => {
	const raw = readFileSync(
		fileURLToPath(new URL('../../src/lib/server/docker/client.ts', import.meta.url)),
		'utf8'
	);
	// Strip comments so the "endpoints we never call" documentation is not a false hit.
	const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

	it('contains no non-GET HTTP method', () => {
		expect(code).toMatch(/method: 'GET'/);
		expect(code).not.toMatch(/method:\s*['"`](?:POST|PUT|PATCH|DELETE|HEAD)['"`]/i);
	});

	it('constructs no Docker mutation or non-contract endpoint', () => {
		expect(code).not.toMatch(/['"`][^'"`]*\/(exec|start|stop|kill|restart|pause|unpause)\b/);
		expect(code).not.toMatch(/['"`][^'"`]*\/(events|version|_ping|images|networks|volumes)\b/);
		expect(code).not.toMatch(/containers\/\$\{[^}]*\}\/(stats|logs|exec|top|attach)/);
	});

	it('never shells out', () => {
		expect(code).not.toMatch(/child_process|execSync|\bspawn\b/);
	});
});
