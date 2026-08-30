import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	checkLoginAllowed,
	recordLoginFailure,
	recordLoginSuccess,
	resetRateLimiterForTests,
	sweepRateLimiterForTests
} from '$lib/server/auth/rate-limit';

// The limiter keys on an opaque client id (production: `getClientAddress()`).
const CLIENT = 'client-one';
const WINDOW_MS = 15 * 60 * 1000;
const COOLOFF_MS = 15 * 60 * 1000;

beforeEach(() => resetRateLimiterForTests());
afterEach(() => resetRateLimiterForTests());

describe('checkLoginAllowed — window + cool-off (FR-005, SC-011)', () => {
	it('allows a fresh client', () => {
		expect(checkLoginAllowed(CLIENT, 0).allowed).toBe(true);
	});

	it('allows the first five failed attempts, refuses the sixth', () => {
		let now = 1000;
		for (let attempt = 1; attempt <= 5; attempt++) {
			expect(checkLoginAllowed(CLIENT, now).allowed).toBe(true);
			recordLoginFailure(CLIENT, now);
			now += 1000;
		}
		const sixth = checkLoginAllowed(CLIENT, now);
		expect(sixth.allowed).toBe(false);
		expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('keeps refusing during the 15-minute cool-off, even with no new attempts', () => {
		let now = 0;
		for (let i = 0; i < 5; i++) {
			recordLoginFailure(CLIENT, now);
			now += 100;
		}
		// trips the block
		expect(checkLoginAllowed(CLIENT, now).allowed).toBe(false);

		expect(checkLoginAllowed(CLIENT, now + COOLOFF_MS - 1).allowed).toBe(false);
		expect(checkLoginAllowed(CLIENT, now + COOLOFF_MS + 1).allowed).toBe(true);
	});

	it('does not count failures that have aged out of the rolling window', () => {
		for (let i = 0; i < 5; i++) recordLoginFailure(CLIENT, 1000 + i * 1000);
		// well after the window: every recorded failure has expired
		expect(checkLoginAllowed(CLIENT, 5000 + WINDOW_MS + 1).allowed).toBe(true);
	});

	it('clears a client on successful login', () => {
		for (let i = 0; i < 5; i++) recordLoginFailure(CLIENT, i * 100);
		recordLoginSuccess(CLIENT);
		expect(checkLoginAllowed(CLIENT, 500).allowed).toBe(true);
	});
});

describe('per-client isolation', () => {
	it('one blocked client does not block another', () => {
		let now = 0;
		for (let i = 0; i < 5; i++) {
			recordLoginFailure('client-a', now);
			now += 100;
		}
		expect(checkLoginAllowed('client-a', now).allowed).toBe(false);
		expect(checkLoginAllowed('client-b', now).allowed).toBe(true);
	});
});

describe('housekeeping', () => {
	it('sweep drops fully-expired clients', () => {
		recordLoginFailure(CLIENT, 0);
		sweepRateLimiterForTests(WINDOW_MS + 1);
		// after the sweep the client is gone → treated as fresh
		expect(checkLoginAllowed(CLIENT, WINDOW_MS + 2).allowed).toBe(true);
	});

	it('reset wipes all state', () => {
		for (let i = 0; i < 5; i++) recordLoginFailure(CLIENT, i);
		resetRateLimiterForTests();
		expect(checkLoginAllowed(CLIENT, 10).allowed).toBe(true);
	});
});
