/**
 * Service projection (spec FR-011/FR-017/FR-018/FR-029, data-model §3,
 * `contracts/label-contract.md`, product-owner decision A 2026-08-30).
 *
 * Server-only, pure, no I/O. Combines a discovered {@link RawContainer}, its
 * parsed {@link LabelSet}, and a {@link DerivedStatus} into one
 * {@link ServiceProjection} — the ephemeral shape a dashboard tile renders from.
 *
 * `href` resolution (first match wins):
 *   1. a valid absolute `homemedia.url` → used verbatim. The complete explicit
 *      destination; the **only** way to reach a non-`http` scheme.
 *   2. `homemedia.port` (and no valid `url`) **and** a configured
 *      `SERVICE_LINK_BASE` → `http://<SERVICE_LINK_BASE>:<port>`, always plain
 *      `http`. TLS is never inferred.
 *   3. otherwise → `null` → the tile shows "link unconfigured" (FR-018).
 */

import { GENERIC_ICON_ID, getIconSvg, hasIcon, resolveIconId } from '$lib/icons';
import type { ServiceProjection } from '$lib/types';
import type { LabelSet } from '$lib/server/labels';
import type { DerivedStatus } from './status';
import type { RawContainer } from './types';

/** Strip Docker's leading `/` from the first container name, if any. */
function primaryContainerName(names: string[]): string {
	const first = names.find((n) => typeof n === 'string' && n.trim().length > 0) ?? '';
	return first.replace(/^\/+/, '').trim();
}

/**
 * De-slugify a container name for display: `-`/`_` → space, collapse whitespace,
 * title-case each word. `media-alpha` → `Media Alpha`.
 */
export function deSlugify(containerName: string): string {
	const words = containerName
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter((w) => w.length > 0);
	if (words.length === 0) return 'Service';
	return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Slugify a display name for use as a stable list key / search token:
 * lower-case, non-alphanumerics → `-`, trimmed. Falls back to `service` so the
 * key is never empty.
 */
export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > 0 ? slug : 'service';
}

/**
 * Guess a bundled icon id from a container image reference, e.g.
 * `lscr.io/linuxserver/docker:1` → `docker`. Returns the id only when it matches
 * a bundled icon; otherwise `null` (the caller falls back to `generic`). Never
 * fetches anything.
 */
export function guessIconFromImage(image: string): string | null {
	if (typeof image !== 'string' || image.length === 0) return null;
	// Drop any digest, then any tag, then the registry/namespace path.
	const withoutDigest = image.split('@')[0];
	const withoutTag = withoutDigest.split(':')[0];
	const basename = withoutTag.split('/').filter(Boolean).pop() ?? '';
	if (basename.length === 0) return null;
	return hasIcon(basename) ? basename : null;
}

/** Build the `http://<base>:<port>` link — always plain `http` (decision A). */
function portHref(base: string, port: number): string {
	return `http://${base}:${port}`;
}

/**
 * Resolve the tile destination per data-model §3. `serviceLinkBase` is the
 * deployment's private `SERVICE_LINK_BASE` (bare host) or `null`.
 */
export function resolveHref(labels: LabelSet, serviceLinkBase: string | null): string | null {
	if (labels.url !== null) return labels.url;
	if (labels.port !== null && serviceLinkBase) return portHref(serviceLinkBase, labels.port);
	return null;
}

/** Inputs for {@link projectService} beyond the container + labels + status. */
export interface ProjectionContext {
	/** Deployment `SERVICE_LINK_BASE` (bare host) or `null` when unset. */
	serviceLinkBase: string | null;
}

/**
 * Project one discovered container into a dashboard tile. Pure; the caller has
 * already parsed the labels and derived the status.
 */
export function projectService(
	container: RawContainer,
	labels: LabelSet,
	status: DerivedStatus,
	context: ProjectionContext
): ServiceProjection {
	const name = labels.name ?? deSlugify(primaryContainerName(container.names));
	const iconId = labels.icon
		? resolveIconId(labels.icon)
		: (guessIconFromImage(container.image) ?? GENERIC_ICON_ID);

	return {
		slug: slugify(name),
		name,
		iconId,
		category: labels.category,
		categoryKey: labels.category.toLowerCase(),
		description: labels.description,
		href: resolveHref(labels, context.serviceLinkBase),
		lanOnly: labels.lanOnly,
		order: labels.order,
		status: status.status,
		statusLabel: status.statusLabel,
		placement: labels.placement,
		homeLabel: labels.homeLabel
	};
}

/** Re-export so tile renderers have one import site for icon markup. */
export { getIconSvg };
