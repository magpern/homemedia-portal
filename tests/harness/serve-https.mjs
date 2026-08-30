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
 * Ports are **OS-assigned ephemeral loopback ports**: the terminator listens on
 * `:0`, the adapter runs with `PORT=0`. No port number is written anywhere. The
 * chosen `https://` origin is returned from {@link startHarness} (and printed
 * when this file is run directly).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';
import {
	HARNESS_ECHO_PATH,
	HARNESS_PING_PATH,
	HARNESS_PREFIX,
	HARNESS_PROBE_COOKIE,
	HARNESS_SET_COOKIE_PATH
} from './constants.js';

/** A shape-valid Argon2id PHC string for a throwaway test password (not a secret). */
function synthPhc() {
	return [
		'',
		'argon2id',
		'v=19',
		'm=19456,t=2,p=1',
		randomBytes(16).toString('base64'),
		randomBytes(32).toString('base64')
	].join('$');
}

/** Synthetic, safe env for the adapter child when the caller supplies none. */
function childEnv(origin, adapterPortValue) {
	return {
		...process.env,
		PORT: adapterPortValue,
		ORIGIN: origin,
		PORTAL_USERNAME: process.env.PORTAL_USERNAME ?? 'e2e-user',
		SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(48).toString('base64'),
		PORTAL_PASSWORD_ARGON2: process.env.PORTAL_PASSWORD_ARGON2 ?? synthPhc(),
		DOCKER_PROXY_URL: process.env.DOCKER_PROXY_URL ?? 'http://socket-proxy.invalid/'
	};
}

/** Read the actual (ephemeral) port the adapter bound, from its stdout banner. */
function readAdapterPort(child, timeoutMs = 60_000) {
	return new Promise((resolve, reject) => {
		let buffer = '';
		const timer = setTimeout(
			() => reject(new Error('adapter did not report a listening port')),
			timeoutMs
		);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			process.stderr.write(chunk);
			buffer += chunk;
			const match = buffer.match(/Listening on https?:\/\/[^\s:]+:(\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve(Number(match[1]));
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
				host: 'localhost',
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
 * Build the app, then start the TLS terminator + adapter on ephemeral ports.
 * @returns {Promise<{ httpsUrl: string, stop: () => Promise<void> }>}
 */
export async function startHarness() {
	const notAfterDate = new Date();
	notAfterDate.setDate(notAfterDate.getDate() + 2);
	// selfsigned v5 is async-only and returns PEM strings.
	const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
		keySize: 2048,
		algorithm: 'sha256',
		notAfterDate,
		extensions: [
			{ name: 'basicConstraints', cA: false },
			{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }
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

	// Bind every loopback address family so the port is reachable whichever one
	// `localhost` resolves to for the test runner.
	await new Promise((resolve) => server.listen(0, resolve));
	httpsUrl = `https://localhost:${server.address().port}`;

	const child = spawn(process.execPath, ['build'], {
		env: childEnv(httpsUrl, '0'),
		stdio: ['ignore', 'pipe', 'inherit']
	});
	adapterPort = await readAdapterPort(child).catch(async (err) => {
		child.kill('SIGKILL');
		await new Promise((r) => server.close(r));
		throw err;
	});

	async function stop() {
		child.kill('SIGTERM');
		await new Promise((resolve) => server.close(() => resolve()));
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
