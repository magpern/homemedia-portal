import { error, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

/** `GET /logout` is not supported — logout must be a POST form action (contract). */
export const load: PageServerLoad = () => {
	error(405, 'Method not allowed');
};

export const actions: Actions = {
	default: ({ cookies }) => {
		// Clear the cookie with attributes matching how it was set (`__Host-` rules).
		cookies.delete(SESSION_COOKIE_NAME, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax'
		});
		redirect(303, '/login');
	}
};
