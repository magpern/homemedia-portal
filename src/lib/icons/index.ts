/**
 * Local icon registry for Portal v1.
 *
 * Every icon is bundled into the build from `./svg/*.svg` and inlined here as
 * markup. Nothing is fetched at runtime from any URL, CDN, or third party
 * (spec FR-012, research R7); the resolver never throws and always yields a
 * bundled glyph.
 *
 * This is the **foundation** only — id → SVG resolution plus a safe generic
 * fallback. Card rendering, image-name guessing, label parsing, search, and any
 * service-specific presentation arrive in later work packages.
 *
 * Licence, attribution, and the pinned upstream revision for the non-authored
 * glyphs are in `./LICENSE`, `./NOTICE`, and `./PROVENANCE.md`.
 */

import genericSvg from './svg/generic.svg?raw';
import dashboardIconsSvg from './svg/dashboard-icons.svg?raw';
import dockerSvg from './svg/docker.svg?raw';
// Feature 002 — neutral household-role glyphs, authored for this project (like
// `generic.svg`); they name a *role*, not a product, so the tracked id list
// discloses nothing about the deployment's actual service inventory.
import watchSvg from './svg/watch.svg?raw';
import requestSvg from './svg/request.svg?raw';
import downloadSvg from './svg/download.svg?raw';
import settingsSvg from './svg/settings.svg?raw';
import activitySvg from './svg/activity.svg?raw';

/** Id of the neutral fallback glyph — always present, authored for this project. */
export const GENERIC_ICON_ID = 'generic';

/**
 * Bundled id → inline SVG markup. Frozen so the registry cannot be mutated at
 * runtime. Keys are the only accepted `homemedia.icon` values; anything else
 * resolves to {@link GENERIC_ICON_ID}.
 */
const ICON_SVG: Readonly<Record<string, string>> = Object.freeze({
	[GENERIC_ICON_ID]: genericSvg,
	'dashboard-icons': dashboardIconsSvg,
	docker: dockerSvg,
	watch: watchSvg,
	request: requestSvg,
	download: downloadSvg,
	settings: settingsSvg,
	activity: activitySvg
});

/** Every bundled icon id, sorted, including the generic fallback. */
export const bundledIconIds: readonly string[] = Object.freeze(Object.keys(ICON_SVG).sort());

/** True when `id` is exactly a bundled icon id (case-sensitive, no normalisation). */
export function hasIcon(id: string | null | undefined): id is string {
	return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ICON_SVG, id);
}

/**
 * Resolve a requested icon id to a bundled id. An unknown, empty, or malformed
 * value falls back to the generic glyph (spec US4 AC3). Never fetches, never
 * throws.
 */
export function resolveIconId(id: string | null | undefined): string {
	return hasIcon(id) ? id : GENERIC_ICON_ID;
}

/** Inline SVG markup for a requested icon id, with the generic-fallback rule applied. */
export function getIconSvg(id: string | null | undefined): string {
	return ICON_SVG[resolveIconId(id)];
}

/**
 * Attribution metadata for the bundled set, for a later "About"/footer notice
 * (Apache-2.0 §4). Values mirror `./PROVENANCE.md` and `./NOTICE`.
 */
export const ICON_SET_ATTRIBUTION = Object.freeze({
	name: 'Dashboard Icons',
	url: 'https://github.com/homarr-labs/dashboard-icons',
	pinnedCommit: '4256e78782f08829c043d67448092fb409878a3c',
	license: 'Apache-2.0',
	licenseFile: 'src/lib/icons/LICENSE',
	copyright: '© 2024 Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs',
	trademarkNotice:
		'All product names, trademarks and registered trademarks are the property of their respective owners. Icons are used for identification purposes only and do not imply endorsement.'
});
