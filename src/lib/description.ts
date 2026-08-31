/**
 * Plain-language service description with a deterministic fallback
 * (feature 002 — Friendly Home View, spec FR-105).
 *
 * The friendly landing view shows a description on every card. When the operator
 * has set `homemedia.description` that value is used verbatim; otherwise a fixed
 * sentence chosen **solely by the service's placement** is shown. The fallback
 * names no service, no category, and no infrastructure — it is a safety net for
 * a not-yet-curated or malformed service, never the intended experience
 * (spec FR-113).
 *
 * Not under `$lib/server/**` on purpose: the primary-action card and the
 * "Manage media" tiles resolve the display text at render time.
 */

import type { Placement } from '$lib/server/labels';

/** Shown on a `placement=home` card when `homemedia.description` is missing. */
export const PRIMARY_FALLBACK_DESCRIPTION =
	'One of the main things to do here. Ask an admin to add a short description.';

/** Shown on a `placement=manage` tile when `homemedia.description` is missing. */
export const MANAGE_FALLBACK_DESCRIPTION =
	'A tool for keeping the media services running. Ask an admin for details.';

/**
 * The text to display for a service. `raw` is `homemedia.description` (already
 * trimmed by the label parser, `undefined` when absent/blank). Never returns an
 * empty string.
 */
export function resolveDescription(raw: string | undefined | null, placement: Placement): string {
	const trimmed = typeof raw === 'string' ? raw.trim() : '';
	if (trimmed.length > 0) return trimmed;
	return placement === 'home' ? PRIMARY_FALLBACK_DESCRIPTION : MANAGE_FALLBACK_DESCRIPTION;
}
