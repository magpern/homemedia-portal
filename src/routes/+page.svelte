<script lang="ts">
	/**
	 * Authenticated mobile-first dashboard (spec US1, FR-014/FR-017/FR-018/FR-020,
	 * FR-029/FR-030). Renders from the server `load` model only — it issues no
	 * client-side data request and never polls (FR-016).
	 */
	import type { PageData } from './$types';
	import CategorySection from '$lib/components/CategorySection.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import type { ServiceProjection } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

	const model = $derived(data.model);
	const term = $derived(query.trim().toLowerCase());

	function matches(service: ServiceProjection, needle: string): boolean {
		if (service.name.toLowerCase().includes(needle)) return true;
		return service.description?.toLowerCase().includes(needle) ?? false;
	}

	const filteredCategories = $derived(
		term === ''
			? model.categories
			: model.categories
					.map((category) => ({
						...category,
						services: category.services.filter((service) => matches(service, term))
					}))
					.filter((category) => category.services.length > 0)
	);

	const visibleCount = $derived(
		filteredCategories.reduce((total, category) => total + category.services.length, 0)
	);
</script>

<svelte:head>
	<title>homemedia-portal</title>
</svelte:head>

<div class="dashboard-page">
	<header class="dashboard-header">
		<h1>homemedia-portal</h1>
		<div class="actions">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- deliberate full-document reload to re-run the server load -->
			<a class="btn" href="/" data-sveltekit-reload rel="nofollow">Refresh</a>
			<form method="POST" action="/logout">
				<button type="submit" class="btn">Sign out</button>
			</form>
		</div>
	</header>

	{#if !model.sourceOk}
		<EmptyState variant="source-unavailable" />
	{:else}
		<SearchBar bind:value={query} />

		<p class="summary" role="status">
			{#if model.counts.services === 0}
				No services configured
			{:else if term !== ''}
				{visibleCount} of {model.counts.services} services match
			{:else}
				{model.counts.services} services · {model.counts.up} running · {model.counts.down} not
				running{#if model.counts.unknown > 0}
					· {model.counts.unknown} unavailable{/if}
			{/if}
		</p>

		<div class="results">
			{#if model.counts.services === 0}
				<EmptyState variant="no-services" />
			{:else if visibleCount === 0}
				<EmptyState variant="no-results" query={query.trim()} />
			{:else}
				{#each filteredCategories as category (category.key)}
					<CategorySection {category} />
				{/each}
			{/if}
		</div>
	{/if}

	<SiteFooter />
</div>

<style>
	:global(body) {
		margin: 0;
		background: var(--hmp-bg);
		color: var(--hmp-text);
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
	}

	.dashboard-page {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem 0;
	}

	.dashboard-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h1 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions form {
		margin: 0;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		padding: 0.5rem 0.85rem;
		border: 1px solid var(--hmp-border-strong);
		border-radius: var(--hmp-radius);
		background: var(--hmp-surface);
		color: var(--hmp-text);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	.btn:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 2px;
	}

	.summary {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--hmp-text-dim);
	}

	@media (prefers-reduced-motion: no-preference) {
		.btn {
			transition:
				border-color 0.12s ease,
				background-color 0.12s ease;
		}
	}
</style>
