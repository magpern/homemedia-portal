import { describe, expect, it } from 'vitest';
import {
	applyCacheControl,
	applySecurityHeaders,
	contentSecurityPolicy,
	cspDirectives,
	permissionsPolicy,
	securityHeaders,
	serializeCsp
} from '$lib/server/security-headers';

describe('Content-Security-Policy', () => {
	it('is strict same-origin with no inline/eval or external origins', () => {
		expect(contentSecurityPolicy).toContain("default-src 'self'");
		expect(contentSecurityPolicy).toContain("object-src 'none'");
		expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
		expect(contentSecurityPolicy).toContain("base-uri 'self'");
		expect(contentSecurityPolicy).toContain("form-action 'self'");

		expect(contentSecurityPolicy).not.toContain('unsafe-inline');
		expect(contentSecurityPolicy).not.toContain('unsafe-eval');
		expect(contentSecurityPolicy).not.toMatch(/https?:\/\//);
		expect(contentSecurityPolicy).not.toMatch(/(^|[ ;])\*/);
	});

	it('script-src and style-src are self only (SvelteKit adds per-page hashes)', () => {
		expect(cspDirectives['script-src']).toEqual(['self']);
		expect(cspDirectives['style-src']).toEqual(['self']);
	});

	it('serializeCsp quotes keywords but not scheme sources', () => {
		const out = serializeCsp({ 'img-src': ['self', 'data:'], 'default-src': ['none'] });
		expect(out).toBe("img-src 'self' data:; default-src 'none'");
	});
});

describe('static security headers', () => {
	it('sets nosniff, same-origin referrer, DENY framing and a permissions policy', () => {
		expect(securityHeaders['x-content-type-options']).toBe('nosniff');
		expect(securityHeaders['referrer-policy']).toBe('same-origin');
		expect(securityHeaders['x-frame-options']).toBe('DENY');
		expect(securityHeaders['permissions-policy']).toBe(permissionsPolicy);
	});

	it('permissions policy denies features the portal never uses', () => {
		for (const feature of ['camera', 'microphone', 'geolocation', 'usb', 'payment']) {
			expect(permissionsPolicy).toContain(`${feature}=()`);
		}
	});
});

describe('applySecurityHeaders', () => {
	it('sets every header including CSP on a bare response', () => {
		const headers = new Headers();
		applySecurityHeaders(headers);
		expect(headers.get('content-security-policy')).toBe(contentSecurityPolicy);
		expect(headers.get('x-content-type-options')).toBe('nosniff');
		expect(headers.get('x-frame-options')).toBe('DENY');
		expect(headers.get('referrer-policy')).toBe('same-origin');
		expect(headers.get('permissions-policy')).toBe(permissionsPolicy);
	});

	it('does not overwrite a CSP already set by SvelteKit (per-page hashes)', () => {
		const pageCsp = "default-src 'self'; script-src 'self' 'sha256-abc123'";
		const headers = new Headers({ 'content-security-policy': pageCsp });
		applySecurityHeaders(headers);
		expect(headers.get('content-security-policy')).toBe(pageCsp);
		expect(headers.get('x-content-type-options')).toBe('nosniff');
	});
});

describe('applyCacheControl', () => {
	it('no-stores HTML documents', () => {
		const headers = new Headers();
		applyCacheControl(headers, '/', 'text/html; charset=utf-8');
		expect(headers.get('cache-control')).toBe('no-store');
	});

	it('no-stores the machine endpoints', () => {
		for (const path of ['/healthz', '/api/services']) {
			const headers = new Headers();
			applyCacheControl(headers, path, 'application/json');
			expect(headers.get('cache-control')).toBe('no-store');
		}
	});

	it('leaves immutable build assets untouched', () => {
		const headers = new Headers({ 'cache-control': 'public,max-age=31536000,immutable' });
		applyCacheControl(headers, '/_app/immutable/chunks/abc.js', 'text/javascript');
		expect(headers.get('cache-control')).toBe('public,max-age=31536000,immutable');
	});

	it('leaves other static files (robots.txt) untouched', () => {
		const headers = new Headers();
		applyCacheControl(headers, '/robots.txt', 'text/plain');
		expect(headers.get('cache-control')).toBeNull();
	});
});
