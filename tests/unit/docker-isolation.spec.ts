/**
 * Integration check for the read-only Docker isolation contract
 * (`contracts/docker-api-contract.md`, Constitution IV). Runs the portal's
 * discovery + inspect against a local stub that models a `docker-socket-proxy`
 * with `CONTAINERS=1, POST=0`: only `GET` to the two container endpoints
 * succeeds; every non-GET or non-contract path is refused `403`.
 *
 * No Docker, no socket, no fixed address — the stub binds `localhost` on an
 * OS-assigned ephemeral port (same rule as `tests/harness`).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { discoverLabelledContainers } from '$lib/server/docker/discovery';
import { dockerGetContainerInspect } from '$lib/server/docker/client';
import { resetEnvForTests } from '$lib/server/env';

interface Recorded {
	method: string;
	path: string;
}

let server: Server;
let baseUrl: string;
const seen: Recorded[] = [];

function handler(req: IncomingMessage, res: ServerResponse) {
	const path = (req.url ?? '').split('?')[0];
	seen.push({ method: req.method ?? '', path });

	// A read-only proxy with POST=0: anything but GET/HEAD is refused daemon-wide.
	if (req.method !== 'GET') {
		res.writeHead(403).end('Forbidden: read-only proxy');
		return;
	}
	if (path === '/containers/json') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(
			JSON.stringify([
				{
					Id: 'svc1',
					Names: ['/svc1'],
					Image: 'img',
					State: 'running',
					Labels: { 'homemedia.enable': 'true' }
				}
			])
		);
		return;
	}
	if (/^\/containers\/[^/]+\/json$/.test(path)) {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ State: { Status: 'running', Health: { Status: 'healthy' } } }));
		return;
	}
	// /containers/{id}/start, /exec, /images, … are not exposed by the proxy config.
	res.writeHead(403).end('Forbidden: endpoint not permitted');
}

beforeAll(async () => {
	server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('stub proxy has no port');
	baseUrl = `http://localhost:${address.port}/`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

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
		DOCKER_PROXY_URL: baseUrl
	});
	resetEnvForTests();
	seen.length = 0;
});
afterEach(() => {
	process.env = { ...savedEnv };
	resetEnvForTests();
});

describe('docker isolation — the portal only reads', () => {
	it('discovers and inspects over the contract-shaped proxy', async () => {
		const discovery = await discoverLabelledContainers();
		expect(discovery).toEqual({
			ok: true,
			containers: [expect.objectContaining({ id: 'svc1' })]
		});

		const state = await dockerGetContainerInspect('svc1');
		expect(state).toMatchObject({ State: { Status: 'running' } });
	});

	it('made only GET requests, and only to the two contract endpoints', async () => {
		await discoverLabelledContainers();
		await dockerGetContainerInspect('svc1');

		expect(seen.length).toBeGreaterThan(0);
		for (const { method, path } of seen) {
			expect(method).toBe('GET');
			expect(path === '/containers/json' || /^\/containers\/[^/]+\/json$/.test(path)).toBe(
				true
			);
		}
	});

	it('the modelled proxy refuses mutation the portal never attempts', async () => {
		for (const attempt of [
			{ method: 'POST', path: 'containers/svc1/start' },
			{ method: 'POST', path: 'containers/svc1/exec' },
			{ method: 'DELETE', path: 'containers/svc1' },
			{ method: 'GET', path: 'events' }
		]) {
			const res = await fetch(new URL(attempt.path, baseUrl), { method: attempt.method });
			expect(res.status).toBe(403);
		}
	});
});

describe('docker modules — source grep: zero non-GET / mutation / shell', () => {
	const dir = fileURLToPath(new URL('../../src/lib/server/docker/', import.meta.url));
	const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

	it.each(files)('%s', (file) => {
		const code = readFileSync(dir + file, 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:])\/\/.*$/gm, '$1');
		expect(code).not.toMatch(/method:\s*['"`](?:POST|PUT|PATCH|DELETE)['"`]/i);
		expect(code).not.toMatch(
			/['"`][^'"`]*containers\/[^'"`]*\/(start|stop|kill|restart|exec|pause)/
		);
		expect(code).not.toMatch(/child_process|execSync|\bspawn\(/);
	});
});
