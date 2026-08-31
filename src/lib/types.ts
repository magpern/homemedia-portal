/**
 * Shared types for Portal v1.
 *
 * These mirror `specs/001-portal-v1/data-model.md`. This file is types only —
 * no parsing, Docker access, auth, or environment logic lives here (that arrives
 * in later work packages). Nothing here is persisted; every value is derived
 * per request or held briefly in memory.
 */

/** Service reachability, derived only from Docker state + healthchecks (data-model §4). */
export type ServiceStatus = 'up' | 'down' | 'unknown';

/**
 * One dashboard tile (data-model §3). Derived from a labelled container plus its
 * parsed `homemedia.*` labels and the status mapping. Ephemeral.
 */
export interface ServiceProjection {
	/** Slugified `name`; stable per container name; used as list key + search. */
	slug: string;
	/** Display title (`homemedia.name`, or the de-slugified container name). */
	name: string;
	/** Bundled icon id, resolved against the bundled set, else `generic`. */
	iconId: string;
	/** Category display casing (first occurrence wins). */
	category: string;
	/** Casefold of `category`, used for grouping / dedupe. */
	categoryKey: string;
	/** Optional secondary text (`homemedia.description`). */
	description: string | undefined;
	/**
	 * Resolved destination, or `null` when no link is configured (FR-018).
	 * `homemedia.url` (absolute http/https) wins; otherwise a plain-http link is
	 * built from `homemedia.port` + `SERVICE_LINK_BASE`. TLS is never inferred.
	 */
	href: string | null;
	/** `homemedia.lan_only` — drives the visible "LAN only" badge (FR-029). */
	lanOnly: boolean;
	/** Sort weight within a category (`homemedia.order`, default 100). */
	order: number;
	/** Reachability bucket. */
	status: ServiceStatus;
	/** Human-readable status text ("Running", "Not running", "Starting", "Status unavailable"). */
	statusLabel: string;
	/**
	 * Landing-view placement (feature 002). `home` → large primary-action card;
	 * `manage` (default) → inside the collapsed "Manage media" section.
	 */
	placement: 'home' | 'manage';
	/**
	 * `homemedia.home_label` (feature 002) — action-phrased primary-card title, or
	 * `null`. Only meaningful when `placement === 'home'`; the card title resolves
	 * `homeLabel ?? name`.
	 */
	homeLabel: string | null;
}

/** A display grouping of services (data-model §5). */
export interface Category {
	/** Grouping key (casefold category). */
	key: string;
	/** First-seen display casing. */
	label: string;
	/** Members, sorted by `order` asc then `name` (locale, case-insensitive). */
	services: ServiceProjection[];
	/** Minimum `order` among members, so categories sort predictably. */
	order: number;
}

/** Aggregate status counts for the dashboard (data-model §6). */
export interface DashboardCounts {
	services: number;
	up: number;
	down: number;
	unknown: number;
}

/**
 * The SSR payload / `/api/services` body (data-model §6).
 *
 * `sourceOk` is `false` ONLY when labelled-service *discovery* failed; a failed
 * per-container inspect does not clear it — that service is just `unknown`.
 * When `sourceOk` is `false`, `categories` is `[]` and nothing is fabricated,
 * cached, or retained (FR-030).
 */
export interface DashboardModel {
	/** ISO 8601 timestamp of when this model was built. */
	generatedAt: string;
	/** `false` only when labelled-service discovery itself failed. */
	sourceOk: boolean;
	/**
	 * The Portal v1 grouped view of **every** discovered service. Retained
	 * unconditionally: it is what the landing view renders in the no-home
	 * fallback (feature 002), and it keeps the totals honest.
	 * `[]` when `sourceOk` is `false` or none are labelled.
	 */
	categories: Category[];
	/**
	 * Feature 002 — services with `placement === 'home'`, sorted by `order` asc
	 * then `name`. Rendered as large primary-action cards. Empty → the landing
	 * view falls back to {@link categories}. Disjoint from {@link manage}.
	 */
	primary: ServiceProjection[];
	/**
	 * Feature 002 — the Portal v1 grouping applied to `placement === 'manage'`
	 * services only; the contents of the collapsed "Manage media" section.
	 * Disjoint from {@link primary}; `primary ∪ manage` = every discovered service.
	 */
	manage: Category[];
	/** Feature 002 — number of `placement === 'manage'` services (for the disclosure control). */
	manageCount: number;
	counts: DashboardCounts;
}

/**
 * Stateless session token payload (data-model §7). Serialised, then signed with
 * HMAC-SHA256 and delivered as the `__Host-hmp_session` cookie. No server-side
 * session store.
 */
export interface SessionPayload {
	/** Schema version; only `1` is accepted in v1. */
	v: 1;
	/** Subject — must equal the configured `PORTAL_USERNAME`. */
	sub: string;
	/** Issued-at, unix seconds. */
	iat: number;
	/** Expiry, unix seconds — exactly `iat + 2_592_000` (30 days). */
	exp: number;
}
