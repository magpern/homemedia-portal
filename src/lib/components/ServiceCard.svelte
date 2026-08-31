<script lang="ts">
	/**
	 * One dashboard tile (spec FR-017, FR-018, FR-029).
	 *
	 * - A tile with a resolved `href` is a single full-card link that opens in a
	 *   new browsing context (`target="_blank"` + `rel="noopener noreferrer"`) so
	 *   the portal never navigates away from itself.
	 * - A tile with `href === null` is **not** a link: it renders as a static card
	 *   marked "Link unconfigured" rather than pointing somewhere wrong.
	 *
	 * The whole card is the target; it is ≥ 44 px tall and keyboard-focusable via
	 * the native `<a>` (FR-019).
	 */
	import type { ServiceProjection } from '$lib/types';
	import Icon from './Icon.svelte';
	import LanOnlyBadge from './LanOnlyBadge.svelte';
	import StatusIndicator from './StatusIndicator.svelte';

	/**
	 * `descriptionFallback` (feature 002): text to show when the service has no
	 * `homemedia.description`. Passed by the "Manage media" section; omitted on the
	 * Portal v1 fallback view so that view is unchanged (a card with no description
	 * simply shows none).
	 */
	let {
		service,
		descriptionFallback = null
	}: { service: ServiceProjection; descriptionFallback?: string | null } = $props();

	const description = $derived(service.description ?? descriptionFallback ?? null);
</script>

{#snippet body()}
	<span class="card-head">
		<Icon id={service.iconId} />
		<span class="name">{service.name}</span>
		{#if service.lanOnly}<LanOnlyBadge />{/if}
	</span>
	{#if description}
		<span class="description">{description}</span>
	{/if}
	<span class="card-foot">
		<StatusIndicator status={service.status} label={service.statusLabel} />
		{#if service.href === null}
			<span class="unconfigured">Link unconfigured</span>
		{/if}
	</span>
{/snippet}

{#if service.href !== null}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external service destination, not an app route -->
	<a class="card" href={service.href} target="_blank" rel="noopener noreferrer">
		{@render body()}
	</a>
{:else}
	<div class="card card--static">
		{@render body()}
	</div>
{/if}

<style>
	.card {
		display: flex;
		min-height: 44px;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.85rem 0.9rem;
		border: 1px solid var(--hmp-border);
		border-radius: var(--hmp-radius);
		background: var(--hmp-surface);
		color: var(--hmp-text);
		text-decoration: none;
	}

	a.card:hover {
		border-color: var(--hmp-border-strong);
		background: var(--hmp-surface-raised);
	}

	a.card:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 2px;
	}

	.card--static {
		opacity: 0.85;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	.name {
		font-size: 1rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.description {
		font-size: 0.85rem;
		color: var(--hmp-text-dim);
		overflow-wrap: anywhere;
	}

	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.unconfigured {
		font-size: 0.75rem;
		font-style: italic;
		color: var(--hmp-text-dim);
	}

	@media (prefers-reduced-motion: no-preference) {
		.card {
			transition:
				border-color 0.12s ease,
				background-color 0.12s ease;
		}
	}
</style>
