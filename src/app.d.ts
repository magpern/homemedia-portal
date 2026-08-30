// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { SessionInfo } from '$lib/server/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The verified session for this request, or `null` when unauthenticated. */
			session: SessionInfo | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
