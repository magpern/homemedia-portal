import type { LayoutServerLoad } from './$types';

/**
 * Expose **only** whether the request is authenticated — never the username,
 * token, timestamps, or any service data (T039, Constitution V).
 */
export const load: LayoutServerLoad = ({ locals }) => {
	return { authenticated: locals.session !== null };
};
