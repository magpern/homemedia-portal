import { describe, expect, it } from 'vitest';
import { authorizeRequest, isPublicPath, safeRedirectTarget } from '$lib/server/auth/authorize';

describe('isPublicPath', () => {
	it.each([
		'/login',
		'/logout',
		'/healthz',
		'/robots.txt',
		'/favicon.ico',
		'/_app/immutable/x.js'
	])('%s is public', (path) => {
		expect(isPublicPath(path)).toBe(true);
	});

	it.each(['/', '/dashboard', '/settings', '/api/services', '/loginx'])(
		'%s is not public',
		(path) => {
			expect(isPublicPath(path)).toBe(false);
		}
	);
});

describe('safeRedirectTarget — no open redirect, no scheme, no control chars', () => {
	it.each([
		['/', '/'],
		['/dashboard', '/dashboard'],
		['/a/b/c', '/a/b/c'],
		['/a/b?x=1#y', '/a/b']
	])('keeps a safe same-origin path %j', (input, expected) => {
		expect(safeRedirectTarget(input)).toBe(expected);
	});

	it.each([
		'//evil.example',
		'/\\evil.example',
		'https://evil.example',
		'http://evil.example',
		'javascript:alert(1)',
		'mailto:x@y',
		'',
		'   /x',
		'/x y',
		'/x\nSet-Cookie: a=b',
		'relative/path'
	])('rejects %j to "/"', (input) => {
		expect(safeRedirectTarget(input)).toBe('/');
	});

	it('rejects non-strings', () => {
		for (const bad of [null, undefined, 42, {}]) {
			expect(safeRedirectTarget(bad)).toBe('/');
		}
	});
});

describe('authorizeRequest', () => {
	it('allows any path for an authenticated request', () => {
		expect(authorizeRequest('/', true)).toEqual({ type: 'allow' });
		expect(authorizeRequest('/api/services', true)).toEqual({ type: 'allow' });
		expect(authorizeRequest('/anything', true)).toEqual({ type: 'allow' });
	});

	it('allows public paths without a session', () => {
		for (const path of [
			'/login',
			'/logout',
			'/healthz',
			'/_app/immutable/a.css',
			'/robots.txt'
		]) {
			expect(authorizeRequest(path, false)).toEqual({ type: 'allow' });
		}
	});

	it('redirects an unauthenticated app route to /login with a sanitized redirectTo', () => {
		expect(authorizeRequest('/', false)).toEqual({
			type: 'redirect',
			location: '/login?redirectTo=%2F'
		});
		expect(authorizeRequest('/settings/profile', false)).toEqual({
			type: 'redirect',
			location: '/login?redirectTo=%2Fsettings%2Fprofile'
		});
	});

	it('never reflects an unsafe path into the redirect', () => {
		const decision = authorizeRequest('//evil.example', false);
		expect(decision).toEqual({ type: 'redirect', location: '/login?redirectTo=%2F' });
	});

	it('returns 401 (not a redirect) for an unauthenticated /api/* request', () => {
		expect(authorizeRequest('/api/services', false)).toEqual({ type: 'unauthorized' });
		expect(authorizeRequest('/api', false)).toEqual({ type: 'unauthorized' });
	});
});
