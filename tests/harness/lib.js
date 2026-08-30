/**
 * Pure, unit-testable helpers for the local-HTTPS e2e harness.
 *
 * Kept free of servers, `spawn`, and TLS so it can be imported by both
 * `serve-https.mjs` and a Vitest spec.
 */
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import { HARNESS_HOST } from './constants.js';

/** Addresses the OS reports as belonging to internal (loopback) interfaces. */
export function loopbackAddresses() {
	return new Set(
		Object.values(os.networkInterfaces())
			.flat()
			.flatMap((iface) => (iface && iface.internal ? [iface.address] : []))
	);
}

/**
 * Throw unless `address` is a loopback address the OS actually reports. Used to
 * prove a listener never reached the LAN — no external connectivity test needed.
 * @param {unknown} address
 * @param {string} label
 * @returns {string}
 */
export function assertLoopback(address, label) {
	const normalised = String(address ?? '').replace(/^\[(.+)]$/, '$1');
	if (!loopbackAddresses().has(normalised)) {
		throw new Error(`harness ${label} bound a non-loopback address: ${String(address)}`);
	}
	return normalised;
}

/** A shape-valid Argon2id PHC string for a throwaway test password (not a secret). */
export function synthPhc() {
	return [
		'',
		'argon2id',
		'v=19',
		'm=19456,t=2,p=1',
		randomBytes(16).toString('base64'),
		randomBytes(32).toString('base64')
	].join('$');
}

/**
 * Env for the adapter child: always `HOST=localhost` and `PORT=0` (ephemeral),
 * plus synthetic safe values for anything the caller did not supply.
 * @param {string} origin
 * @returns {NodeJS.ProcessEnv}
 */
export function buildChildEnv(origin) {
	return {
		...process.env,
		HOST: HARNESS_HOST,
		PORT: '0',
		ORIGIN: origin,
		PORTAL_USERNAME: process.env.PORTAL_USERNAME ?? 'e2e-user',
		SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(48).toString('base64'),
		PORTAL_PASSWORD_ARGON2: process.env.PORTAL_PASSWORD_ARGON2 ?? synthPhc(),
		DOCKER_PROXY_URL: process.env.DOCKER_PROXY_URL ?? 'http://socket-proxy.invalid/'
	};
}
