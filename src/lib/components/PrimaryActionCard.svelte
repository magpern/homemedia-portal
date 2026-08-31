<script lang="ts">
	/**
	 * A primary household action on the friendly landing view (feature 002,
	 * spec FR-101, FR-105, FR-109, FR-110, FR-115).
	 *
	 * A large version of {@link ServiceCard}: the whole card is one `<a>` opening
	 * the service in a new browsing context (or a static card marked "Link
	 * unconfigured" when `href === null`). Title is the action-phrased
	 * `homemedia.home_label`, falling back to the service name. Status and the
	 * "LAN only" marker are shown but visually secondary.
	 */
	import type { ServiceProjection } from '$lib/types';
	import { resolveDescription } from '$lib/description';
	import Icon from './Icon.svelte';
	import LanOnlyBadge from './LanOnlyBadge.svelte';
	import StatusIndicator from './StatusIndicator.svelte';

	let { service }: { service: ServiceProjection } = $props();

	const title = $derived(service.homeLabel ?? service.name);
	const description = $derived(resolveDescription(service.description, 'home'));
</script>

{#snippet body()}
	<span class="head">
		<span class="icon"><Icon id={service.iconId} /></span>
		<span class="title">{title}</span>
	</span>
	<span class="description">{description}</span>
	<span class="foot">
		<StatusIndicator status={service.status} label={service.statusLabel} />
		{#if service.lanOnly}<LanOnlyBadge />{/if}
		{#if service.href === null}<span class="unconfigured">Link unconfigured</span>{/if}
	</span>
{/snippet}

{#if service.href !== null}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- external service destination, not an app route -->
	<a
		class="primary-card"
		href={service.href}
		target="_blank"
		rel="noopener noreferrer"
		aria-label={`${title} — ${service.name}`}
	>
		{@render body()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<div class="primary-card primary-card--static">
		{@render body()}
	</div>
{/if}

<style>
	.primary-card {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-height: 44px;
		padding: 1.15rem 1.1rem;
		border: 1px solid var(--hmp-border-strong);
		border-radius: var(--hmp-radius);
		background: var(--hmp-surface-raised);
		color: var(--hmp-text);
		text-decoration: none;
	}

	a.primary-card:hover {
		border-color: var(--hmp-accent);
	}

	a.primary-card:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 2px;
	}

	.primary-card--static {
		opacity: 0.85;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.icon {
		display: inline-flex;
		width: 2.25rem;
		height: 2.25rem;
		flex: 0 0 auto;
		color: var(--hmp-accent);
	}

	.icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.title {
		font-size: 1.2rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.description {
		font-size: 0.95rem;
		line-height: 1.4;
		color: var(--hmp-text-dim);
		overflow-wrap: anywhere;
	}

	/* Status + LAN-only kept but visually secondary (FR-109/FR-110). */
	.foot {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: var(--hmp-text-faint);
	}

	.unconfigured {
		font-style: italic;
		color: var(--hmp-text-dim);
	}

	@media (prefers-reduced-motion: no-preference) {
		.primary-card {
			transition:
				border-color 0.12s ease,
				background-color 0.12s ease;
		}
	}
</style>
