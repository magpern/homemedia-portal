/**
 * Throwaway local TLS terminator for the auth/session e2e tier (research R11).
 *
 * Topology mirrors production: an HTTPS front end terminates TLS and forwards to
 * the plain-HTTP `@sveltejs/adapter-node` server, injecting
 * `X-Forwarded-Proto: https`, so Playwright exercises the real
 * `Secure` / `__Host-` cookie code path.
 *
 * **Test tooling only.** Never imported by `src/`, never copied into the
 * container image, never part of a deployment or CI publish. The certificate is
 * generated in memory on every run and never written to disk.
 *
 * Both listeners are **`localhost`-bound** (never exposed beyond loopback) on
 * **OS-assigned ephemeral ports**: the terminator does `listen(0, 'localhost')`,
 * the adapter runs with `HOST=localhost` and `PORT=0`. No IP address or concrete
 * port number is written anywhere. {@link assertLoopback} re-checks each
 * listener's bound address at run time.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';
import {
	HARNESS_ECHO_PATH,
	HARNESS_HOST,
	HARNESS_PING_PATH,
	HARNESS_PREFIX,
	HARNESS_PROBE_COOKIE,
	HARNESS_SET_COOKIE_PATH
} from './constants.js';
import { assertLoopback, buildChildEnv } from './lib.js';

/** Read the adapter's actual bound host + ephemeral port from its stdout banner. */
function readAdapterAddress(child, timeoutMs = 60_000) {
	return new Promise((resolve, reject) => {
		let buffer = '';
		const timer = setTimeout(
			() => reject(new Error('adapter did not report a listening address')),
			timeoutMs
		);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			process.stderr.write(chunk);
			buffer += chunk;
			const match = buffer.match(/Listening on https?:\/\/(\[[^\]]+]|[^\s:]+):(\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve({ host: match[1], port: Number(match[2]) });
			}
		});
		child.once('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`adapter server exited before listening (code ${code})`));
		});
	});
}

function makeRequestHandler(getOrigin, getAdapterPort) {
	function proxyToAdapter(req, res) {
		const forwarded = {
			...req.headers,
			'x-forwarded-proto': 'https',
			'x-forwarded-host': new URL(getOrigin()).host,
			'x-forwarded-for': req.socket.remoteAddress ?? ''
		};
		const upstream = http.request(
			{
				host: HARNESS_HOST,
				port: getAdapterPort(),
				method: req.method,
				path: req.url,
				headers: forwarded
			},
			(upstreamRes) => {
				res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
				upstreamRes.pipe(res);
			}
		);
		upstream.on('error', () => {
			res.writeHead(502, { 'content-type': 'text/plain' });
			res.end('harness: upstream error');
		});
		req.pipe(upstream);
	}

	return function handle(req, res) {
		const path = (req.url ?? '/').split('?')[0];
		if (path === HARNESS_PING_PATH) {
			res.writeHead(200, { 'content-type': 'text/plain' });
			res.end('ok');
			return;
		}
		if (path === HARNESS_SET_COOKIE_PATH) {
			res.writeHead(200, {
				'content-type': 'text/plain',
				'set-cookie': `${HARNESS_PROBE_COOKIE}=1; Secure; HttpOnly; SameSite=Lax; Path=/`
			});
			res.end('cookie set');
			return;
		}
		if (path === HARNESS_ECHO_PATH) {
			res.writeHead(200, { 'content-type': 'text/plain' });
			res.end(`cookie: ${req.headers.cookie ?? ''}`);
			return;
		}
		if (path.startsWith(HARNESS_PREFIX)) {
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('harness: unknown fixture');
			return;
		}
		proxyToAdapter(req, res);
	};
}

/**
 * Start the TLS terminator + adapter, both `localhost`-bound on ephemeral ports.
 * @returns {Promise<{ httpsUrl: string, stop: () => Promise<void> }>}
 */
export async function startHarness() {
	const notAfterDate = new Date();
	notAfterDate.setDate(notAfterDate.getDate() + 2);
	// selfsigned v5 is async-only and returns PEM strings.
	const pems = await selfsigned.generate([{ name: 'commonName', value: HARNESS_HOST }], {
		keySize: 2048,
		algorithm: 'sha256',
		notAfterDate,
		extensions: [
			{ name: 'basicConstraints', cA: false },
			{ name: 'subjectAltName', altNames: [{ type: 2, value: HARNESS_HOST }] }
		]
	});

	let httpsUrl = '';
	let adapterPort = 0;
	const server = https.createServer(
		{ key: pems.private, cert: pems.cert },
		makeRequestHandler(
			() => httpsUrl,
			() => adapterPort
		)
	);

	await new Promise((resolve) => {
		server.listen(0, HARNESS_HOST, () => resolve(undefined));
	});
	const bound = /** @type {import('node:net').AddressInfo} */ (server.address());
	assertLoopback(bound.address, 'TLS terminator');
	httpsUrl = `https://${HARNESS_HOST}:${bound.port}`;

	const child = spawn(process.execPath, ['build'], {
		env: buildChildEnv(httpsUrl),
		stdio: ['ignore', 'pipe', 'inherit']
	});
	const adapter = await readAdapterAddress(child).catch(async (err) => {
		child.kill('SIGKILL');
		await new Promise((resolve) => server.close(() => resolve(undefined)));
		throw err;
	});
	assertLoopback(adapter.host, 'adapter server');
	adapterPort = adapter.port;

	async function stop() {
		child.kill('SIGTERM');
		await new Promise((resolve) => server.close(() => resolve(undefined)));
	}

	return { httpsUrl, stop };
}

// Run directly: start the harness and hold it open (Ctrl-C to stop).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const harness = await startHarness();
	console.error(`[harness] ready at ${harness.httpsUrl}`);
	const bye = () => harness.stop().finally(() => process.exit(0));
	process.on('SIGINT', bye);
	process.on('SIGTERM', bye);
}
