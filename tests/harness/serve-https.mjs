/**
 * Throwaway local TLS terminator for the auth/session e2e tier (research R11).
 *
 * Topology mirrors production: an HTTPS front end terminates TLS and forwards to
 * the plain-HTTP `@sveltejs/adapter-node` server, injecting
 * `X-Forwarded-Proto: https`. This lets Playwright exercise the real
 * `Secure` / `__Host-` cookie code path.
 *
 * **Test tooling only.** Never imported by `src/`, never copied into the
 * container image, never part of a deployment or CI publish. The certificate is
 * generated in memory on every run and never written to disk. For a locally
 * trusted CA instead of `ignoreHTTPSErrors`, see `tests/harness/README.md`
 * (Caddy / local-ssl-proxy).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { once } from 'node:events';
import selfsigned from 'selfsigned';
import {
	ADAPTER_HTTP_PORT,
	HARNESS_ECHO_PATH,
	HARNESS_PING_PATH,
	HARNESS_PREFIX,
	HARNESS_PROBE_COOKIE,
	HARNESS_SET_COOKIE_PATH,
	HTTPS_ORIGIN,
	HTTPS_PORT
} from './ports.js';

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

const childEnv = {
	...process.env,
	PORT: String(ADAPTER_HTTP_PORT),
	ORIGIN: HTTPS_ORIGIN,
	PORTAL_USERNAME: process.env.PORTAL_USERNAME ?? 'e2e-user',
	SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(48).toString('base64'),
	PORTAL_PASSWORD_ARGON2: process.env.PORTAL_PASSWORD_ARGON2 ?? synthPhc(),
	DOCKER_PROXY_URL: process.env.DOCKER_PROXY_URL ?? 'http://socket-proxy.invalid/'
};

const child = spawn(process.execPath, ['build'], {
	env: childEnv,
	stdio: ['ignore', 'inherit', 'inherit']
});
child.on('exit', (code) => {
	console.error(`[harness] adapter server exited (${code})`);
	process.exit(code ?? 1);
});

/** Resolve once the adapter server accepts a TCP connection (or time out). */
async function waitForAdapter(timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const socket = net.connect(ADAPTER_HTTP_PORT, 'localhost');
		socket.once('error', () => {});
		try {
			await once(socket, 'connect');
			socket.destroy();
			return;
		} catch {
			socket.destroy();
			if (Date.now() > deadline) throw new Error('adapter server did not start in time');
			await new Promise((r) => setTimeout(r, 200));
		}
	}
}

function proxyToAdapter(req, res) {
	const forwarded = {
		...req.headers,
		'x-forwarded-proto': 'https',
		'x-forwarded-host': new URL(HTTPS_ORIGIN).host,
		'x-forwarded-for': req.socket.remoteAddress ?? ''
	};
	const upstream = http.request(
		{
			host: 'localhost',
			port: ADAPTER_HTTP_PORT,
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

function handle(req, res) {
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
}

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

const server = https.createServer({ key: pems.private, cert: pems.cert }, handle);

function shutdown() {
	child.kill('SIGTERM');
	server.close();
	process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await waitForAdapter();
server.listen(HTTPS_PORT, () => {
	console.error(
		`[harness] HTTPS terminator ready at ${HTTPS_ORIGIN} -> adapter :${ADAPTER_HTTP_PORT}`
	);
});
