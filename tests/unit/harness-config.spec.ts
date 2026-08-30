import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { HARNESS_HOST } from '../harness/constants.js';
import { assertLoopback, buildChildEnv } from '../harness/lib.js';

/**
 * The local-HTTPS harness must be loopback-only *in fact*: both listeners bind
 * `localhost`, never a wildcard address that would briefly expose the test
 * server on the LAN.
 */
describe('HTTPS harness — loopback-only configuration', () => {
	it('binds only localhost', () => {
		expect(HARNESS_HOST).toBe('localhost');
	});

	it('configures the adapter child for localhost + an OS-assigned port', () => {
		const env = buildChildEnv('https://localhost');
		expect(env.HOST).toBe('localhost');
		expect(env.PORT).toBe('0');
		expect(env.ORIGIN).toBe('https://localhost');
	});

	it('assertLoopback accepts a real OS loopback address', () => {
		const loopback = Object.values(os.networkInterfaces())
			.flat()
			.find((iface) => iface?.internal)?.address;
		expect(loopback, 'the OS reports at least one internal interface').toBeTruthy();
		expect(() => assertLoopback(loopback, 'test')).not.toThrow();
		// brackets (as adapter-node prints for IPv6) are tolerated
		expect(() => assertLoopback(`[${loopback}]`, 'test')).not.toThrow();
	});

	it('assertLoopback rejects a non-loopback address', () => {
		expect(() => assertLoopback('portal.example', 'test')).toThrow(/non-loopback/);
		expect(() => assertLoopback(undefined, 'test')).toThrow(/non-loopback/);
	});
});
