import { defineConfig } from '@playwright/test';

// Minimal scaffold config. The local-HTTPS harness, mobile viewport projects and
// accessibility wiring are added in WP11a (see specs/001-portal-v1/tasks.md).
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.{ts,js}',
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	}
});
