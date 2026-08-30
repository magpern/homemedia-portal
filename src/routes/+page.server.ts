import type { PageServerLoad } from './$types';
import { buildDashboardModel } from '$lib/server/docker/dashboard';

/**
 * Dashboard SSR load (spec FR-010/FR-014/FR-030, `contracts/http-routes.md`
 * `GET /`).
 *
 * The route guard in `hooks.server.ts` has already required a valid session, so
 * this only runs for an authenticated request. It performs a single read-only
 * Docker read (discovery + per-container status) within the client's time
 * budget and returns the {@link DashboardModel}.
 *
 * Only labelled services are ever in the model — `buildDashboardModel` never
 * carries a container that lacks `homemedia.enable=true`, and no raw Docker
 * field (id, image, host/port internals) leaves the server beyond the resolved
 * `href`. `Cache-Control: no-store` is applied to this HTML response by the hook.
 *
 * There is no `/api/services` endpoint in this bundle: a refresh is a full
 * navigation back to `/`, which re-runs this load. Nothing polls.
 */
export const load: PageServerLoad = async () => {
	return { model: await buildDashboardModel() };
};
