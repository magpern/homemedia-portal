/**
 * `homemedia.*` label parsing (spec FR-009/FR-011, data-model §2,
 * `contracts/label-contract.md`).
 *
 * Server-only, pure, no I/O. Turns a container's raw label map into a
 * {@link LabelSet} of validated, normalised values with the contract's defaults
 * applied. Two container-derived defaults are **not** resolved here because they
 * need the `RawContainer` (the de-slugified name, and the image-name icon
 * guess) — `name` and `icon` stay `null` when the label is absent and
 * `docker/projection.ts` fills them in.
 *
 * Guardrails from the contract:
 *   - a malformed value for any optional key is **not** an error: the key falls
 *     back to its default and the tile still renders;
 *   - only `homemedia.enable` (handled in `docker/discovery.ts`) can drop a
 *     container;
 *   - unknown `homemedia.*` keys are ignored (forward compatibility);
 *   - non-`homemedia.*` labels are never read for presentation.
 */

/** The label key namespace. Nothing outside it is ever read for presentation. */
const LABEL_PREFIX = 'homemedia.';

/** Default category when `homemedia.category` is absent or blank. */
export const DEFAULT_CATEGORY = 'Services';

/** Default sort weight when `homemedia.order` is absent or malformed. */
export const DEFAULT_ORDER = 100;

/** Parsed, validated `homemedia.*` labels for one container (data-model §2). */
export interface LabelSet {
	/** `homemedia.name`, trimmed — or `null` to use the de-slugified container name. */
	name: string | null;
	/** `homemedia.icon` verbatim (trimmed) — or `null` to guess from the image name. */
	icon: string | null;
	/** `homemedia.category`, trimmed + whitespace-collapsed; defaults to {@link DEFAULT_CATEGORY}. */
	category: string;
	/** `homemedia.description`, trimmed — `undefined` when absent or blank. */
	description: string | undefined;
	/**
	 * `homemedia.url` — a valid absolute `http`/`https` URL (verbatim, trimmed),
	 * or `null`. The complete explicit destination; always wins over {@link port}
	 * and is the only way to reach a non-`http` scheme (data-model §3, decision A).
	 */
	url: string | null;
	/** `homemedia.port` — integer 1–65535, or `null`. Builds an `http`-only link. */
	port: number | null;
	/** `homemedia.order` — any integer; malformed → {@link DEFAULT_ORDER}. */
	order: number;
	/** `homemedia.lan_only` — `true` for `true`/`1`/`yes` (case-insensitive). */
	lanOnly: boolean;
}

/** `true` for `true` / `1` / `yes` (case-insensitive, trimmed); everything else `false`. */
export function parseBooleanLabel(value: string | undefined): boolean {
	if (typeof value !== 'string') return false;
	return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

/** Collapse internal whitespace runs to a single space and trim the ends. */
function collapseWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

/** Parse an exact base-10 integer (optionally signed); `null` on anything else. */
function parseIntegerLabel(value: string | undefined): number | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!/^-?\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isSafeInteger(n) ? n : null;
}

/** A valid absolute `http`/`https` URL → the trimmed input verbatim; else `null`. */
function parseUrlLabel(value: string | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
	return trimmed;
}

/** An integer in 1–65535 → that number; else `null`. */
function parsePortLabel(value: string | undefined): number | null {
	const n = parseIntegerLabel(value);
	if (n === null || n < 1 || n > 65535) return null;
	return n;
}

/**
 * Parse a container's raw label map into a {@link LabelSet}.
 *
 * Never throws. Only keys under `homemedia.` are considered; unknown ones in
 * that namespace are ignored. A malformed optional value falls back to its
 * default (the tile still renders).
 */
export function parseLabels(labels: Record<string, string>): LabelSet {
	const get = (key: string): string | undefined => {
		const raw = labels[`${LABEL_PREFIX}${key}`];
		return typeof raw === 'string' ? raw : undefined;
	};

	const rawName = get('name')?.trim();
	const rawIcon = get('icon')?.trim();
	const rawCategory = get('category');
	const category = rawCategory ? collapseWhitespace(rawCategory) : '';
	const rawDescription = get('description')?.trim();

	return {
		name: rawName ? rawName : null,
		icon: rawIcon ? rawIcon : null,
		category: category.length > 0 ? category : DEFAULT_CATEGORY,
		description: rawDescription ? rawDescription : undefined,
		url: parseUrlLabel(get('url')),
		port: parsePortLabel(get('port')),
		order: parseIntegerLabel(get('order')) ?? DEFAULT_ORDER,
		lanOnly: parseBooleanLabel(get('lan_only'))
	};
}
