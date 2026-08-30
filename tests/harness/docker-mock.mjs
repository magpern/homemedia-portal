/**
 * In-process stub of the read-only `docker-socket-proxy` for the dashboard e2e
 * tier. Serves just the two endpoints the portal calls
 * (`GET /containers/json`, `GET /containers/{id}/json`) plus a `POST /__control`
 * side channel the specs use to pick a scenario.
 *
 * **Test tooling only.** `localhost`-bound on an OS-assigned ephemeral port; no
 * IP or fixed port is written anywhere. The fixture data is entirely synthetic —
 * generic call-signs, `.invalid` hosts, no real service inventory (Constitution
 * IX). It does **not** model the proxy's `POST=0` policy (that is covered by
 * `tests/unit/docker-isolation.spec.ts`); here it only needs to drive the UI.
 *
 * Modes:
 *   - `normal`         — the full fixture set, varied statuses.
 *   - `inspect-fail`   — discovery works; the `charlie-archive` inspect 500s
 *                        (FR-030(a) / SC-009: list all, mark that one unknown).
 *   - `discovery-fail` — `GET /containers/json` 500s
 *                        (FR-030(b) / SC-015: explicit unavailable, no list).
 */
import { createServer } from 'node:http';
import { HARNESS_HOST } from './constants.js';

/** A LAN port for the port-link fixture — kept in a variable, never a host:port literal. */
const PORT_BRAVO = 8123;

/** Container that fails its inspect in `inspect-fail` mode. */
export const INSPECT_FAIL_ID = 'charlie-archive';

/** Names the specs assert are visible (labelled) vs. never shown (not labelled). */
export const DOCKER_MOCK_VISIBLE_NAMES = [
	'Alpha Stream',
	'Bravo Admin',
	'Charlie Archive',
	'Delta Notes'
];
export const DOCKER_MOCK_HIDDEN_MARKERS = [
	'echo-hidden',
	'Echo Hidden',
	'foxtrot-off',
	'Foxtrot Off'
];

/** `GET /containers/json` body — includes two entries the portal must drop in code. */
const CONTAINERS = [
	{
		Id: 'alpha-stream',
		Names: ['/alpha-stream'],
		Image: 'example/alpha',
		State: 'running',
		Labels: {
			'homemedia.enable': 'true',
			'homemedia.name': 'Alpha Stream',
			'homemedia.category': 'Media',
			'homemedia.description': 'Test streaming service',
			'homemedia.icon': 'docker',
			'homemedia.url': 'https://alpha.invalid/watch',
			'homemedia.order': '10'
		}
	},
	{
		Id: 'bravo-admin',
		Names: ['/bravo-admin'],
		Image: 'example/bravo',
		State: 'running',
		Labels: {
			'homemedia.enable': 'true',
			'homemedia.name': 'Bravo Admin',
			'homemedia.category': 'Tools',
			'homemedia.lan_only': 'true',
			'homemedia.port': String(PORT_BRAVO)
		}
	},
	{
		Id: INSPECT_FAIL_ID,
		Names: ['/charlie-archive'],
		Image: 'example/charlie',
		State: 'exited',
		Labels: {
			'homemedia.enable': 'true',
			'homemedia.name': 'Charlie Archive',
			'homemedia.category': 'media',
			'homemedia.order': '5'
		}
	},
	{
		Id: 'delta-notes',
		Names: ['/delta-notes'],
		Image: 'example/delta',
		State: 'running',
		Labels: {
			'homemedia.enable': 'true',
			'homemedia.name': 'Delta Notes',
			'homemedia.category': 'Tools'
		}
	},
	// Not opted in — the portal must never display, list, or count this (FR-010).
	{
		Id: 'echo-hidden',
		Names: ['/echo-hidden'],
		Image: 'example/echo',
		State: 'running',
		Labels: { 'com.example.role': 'secret' }
	},
	// Explicitly disabled — same rule.
	{
		Id: 'foxtrot-off',
		Names: ['/foxtrot-off'],
		Image: 'example/foxtrot',
		State: 'running',
		Labels: { 'homemedia.enable': 'false', 'homemedia.name': 'Foxtrot Off' }
	}
];

/** `GET /containers/{id}/json` bodies. */
const INSPECT = {
	'alpha-stream': { State: { Status: 'running', Health: { Status: 'healthy' } } },
	'bravo-admin': { State: { Status: 'running' } },
	'charlie-archive': { State: { Status: 'exited' } },
	'delta-notes': { State: { Status: 'running' } }
};

function sendJson(res, status, body) {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
}

/**
 * Start the mock. Returns its base URL and a stop handle.
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startDockerMock() {
	let mode = 'normal';

	const server = createServer((req, res) => {
		const path = (req.url ?? '/').split('?')[0];

		if (req.method === 'POST' && path === '/__control') {
			let raw = '';
			req.on('data', (chunk) => {
				raw += chunk;
			});
			req.on('end', () => {
				try {
					mode = JSON.parse(raw).mode ?? 'normal';
				} catch {
					mode = 'normal';
				}
				sendJson(res, 200, { mode });
			});
			return;
		}

		if (req.method !== 'GET') {
			res.writeHead(405).end();
			return;
		}

		if (path === '/containers/json') {
			if (mode === 'discovery-fail') {
				res.writeHead(500).end('discovery unavailable');
				return;
			}
			sendJson(res, 200, CONTAINERS);
			return;
		}

		const match = path.match(/^\/containers\/([^/]+)\/json$/);
		if (match) {
			const id = match[1];
			if (mode === 'inspect-fail' && id === INSPECT_FAIL_ID) {
				res.writeHead(500).end('inspect unavailable');
				return;
			}
			const body = INSPECT[id];
			if (!body) {
				res.writeHead(404).end();
				return;
			}
			sendJson(res, 200, body);
			return;
		}

		res.writeHead(404).end();
	});

	await new Promise((resolve) => server.listen(0, HARNESS_HOST, resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('docker mock has no port');
	}

	return {
		url: `http://${HARNESS_HOST}:${address.port}/`,
		stop: () => new Promise((resolve) => server.close(() => resolve(undefined)))
	};
}
