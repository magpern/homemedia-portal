import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '$lib/server/env';
import { safeRedirectTarget } from '$lib/server/auth/authorize';
import { verifyPortalPassword } from '$lib/server/auth/password';
import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE_SECONDS,
	signSession
} from '$lib/server/auth/session';
import {
	checkLoginAllowed,
	recordLoginFailure,
	recordLoginSuccess
} from '$lib/server/auth/rate-limit';
import type { Actions, PageServerLoad } from './$types';

/** One message for every credential failure — no field-level or user-existence hint (FR-004). */
const GENERIC_FAILURE = 'Invalid credentials.';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session) {
		redirect(302, safeRedirectTarget(url.searchParams.get('redirectTo')));
	}
	return { redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const clientId = getClientAddress();

		// Throttle check first — before any credential work (FR-005, SC-011).
		if (!checkLoginAllowed(clientId).allowed) {
			return fail(429, { error: 'Too many attempts. Try again later.' });
		}

		const form = await request.formData();
		const password = form.get('password');
		const usernameField = form.get('username');
		const redirectTo = safeRedirectTarget(
			form.get('redirectTo') ?? url.searchParams.get('redirectTo')
		);

		const usernameMatches =
			usernameField === null ||
			(typeof usernameField === 'string' && usernameField === getEnv().portalUsername);

		// Always run a verify (real or dummy hash) so timing does not leak whether
		// the username exists.
		const candidate = typeof password === 'string' ? password : '';
		const ok = await verifyPortalPassword(candidate, usernameMatches);

		if (!ok) {
			recordLoginFailure(clientId);
			// 200 re-render with the generic message (contract: bad credentials -> 200).
			return { error: GENERIC_FAILURE };
		}

		recordLoginSuccess(clientId);
		cookies.set(SESSION_COOKIE_NAME, signSession(getEnv().portalUsername), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE_SECONDS
		});
		redirect(303, redirectTo);
	}
};
