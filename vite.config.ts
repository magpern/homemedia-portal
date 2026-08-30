import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { cspDirectives } from './src/lib/server/security-headers.ts';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Strict same-origin CSP. `mode: 'hash'` lets SvelteKit add hashes for its
			// own inline bootstrap script without opening `unsafe-inline`.
			// `src/lib/server/security-headers.ts` re-serialises the same directives
			// for non-page responses. See specs/001-portal-v1/contracts/README.md.
			csp: {
				mode: 'hash',
				directives: Object.fromEntries(
					Object.entries(cspDirectives).map(([name, sources]) => [name, [...sources]])
				)
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'tests/unit/**/*.{test,spec}.{js,ts}'
					],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
