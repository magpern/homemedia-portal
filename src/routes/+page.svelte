<script lang="ts">
	/**
	 * Authenticated landing view.
	 *
	 * Feature 002 (Friendly Home View): when the operator has marked one or more
	 * services `homemedia.placement=home`, the view leads with those as large
	 * primary-action cards and puts every other service in a collapsed
	 * "Manage media" disclosure. With no `home` service it falls back to the
	 * Portal v1 grouped dashboard unchanged (spec FR-103 / SC-109).
	 *
	 * Renders from the server `load` model only — no client-side data request,
	 * never polls (FR-016). Search is client-side over the already-loaded model
	 * and spans both regions (FR-108).
	 */
	import type { PageData } from './$types';
	import CategorySection from '$lib/components/CategorySection.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageMediaSection from '$lib/components/ManageMediaSection.svelte';
	import PrimaryActionCard from '$lib/components/PrimaryActionCard.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import type { Category, ServiceProjection } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	let manageOpen = $state(false);

	const model = $derived(data.model);
	const term = $derived(query.trim().toLowerCase());
	const friendly = $derived(model.sourceOk && model.primary.length > 0);

	function matches(service: ServiceProjection, needle: string): boolean {
		if (service.name.toLowerCase().includes(needle)) return true;
		if (service.homeLabel?.toLowerCase().includes(needle)) return true;
		return service.description?.toLowerCase().includes(needle) ?? false;
	}

	function filterCategories(categories: Category[], needle: string): Category[] {
		if (needle === '') return categories;
		return categories
			.map((category) => ({
				...category,
				services: category.services.filter((service) => matches(service, needle))
			}))
			.filter((category) => category.services.length > 0);
	}

	function countServices(categories: Category[]): number {
		return categories.reduce((total, c) => total + c.services.length, 0);
	}

	// Fallback (Portal v1) view
	const filteredCategories = $derived(filterCategories(model.categories, term));

	// Friendly view
	const filteredPrimary = $derived(
		term === '' ? model.primary : model.primary.filter((s) => matches(s, term))
	);
	const filteredManage = $derived(filterCategories(model.manage, term));
	const manageMatchCount = $derived(countServices(filteredManage));

	const visibleCount = $derived(
		friendly ? filteredPrimary.length + manageMatchCount : countServices(filteredCategories)
	);

	// Force the disclosure open while a search matches something inside it; return
	// it to its collapsed default when the query is cleared. Re-runs only when the
	// query (or the match count) changes, so a manual toggle in between is kept.
	$effect(() => {
		if (!friendly) return;
		if (term === '') manageOpen = false;
		else manageOpen = manageMatchCount > 0;
	});

	const manageNote = $derived(
		term === '' ? null : `Showing ${manageMatchCount} of ${model.manageCount}`
	);
</script>

<svelte:head>
	<title>Home media</title>
</svelte:head>

<div class="dashboard-page">
	<header class="dashboard-header">
		<h1>Home media</h1>
		<div class="actions">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- deliberate full-document reload to re-run the server load -->
			<a class="link-refresh" href="/" data-sveltekit-reload rel="nofollow">Refresh</a>
			<form method="POST" action="/logout">
				<button type="submit" class="btn">Sign out</button>
			</form>
		</div>
	</header>

	<main class="dashboard-main">
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
					{model.counts.services} services · {model.counts.up} running · {model.counts
						.down} not running{#if model.counts.unknown > 0}
						· {model.counts.unknown} unavailable{/if}
				{/if}
			</p>

			<div class="results">
				{#if model.counts.services === 0}
					<EmptyState variant="no-services" />
				{:else if term !== '' && visibleCount === 0}
					<EmptyState variant="no-results" query={query.trim()} />
				{:else if friendly}
					{#if filteredPrimary.length > 0}
						<ul class="primary-list">
							{#each filteredPrimary as service (service.slug)}
								<li><PrimaryActionCard {service} /></li>
							{/each}
						</ul>
					{/if}
					{#if model.manageCount > 0}
						<ManageMediaSection
							categories={filteredManage}
							count={model.manageCount}
							bind:open={manageOpen}
							matchNote={manageNote}
						/>
					{/if}
				{:else}
					{#each filteredCategories as category (category.key)}
						<CategorySection {category} />
					{/each}
				{/if}
			</div>
		{/if}
	</main>

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
		align-items: center;
		gap: 0.75rem;
	}

	.actions form {
		margin: 0;
	}

	.link-refresh {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.35rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--hmp-text-faint);
		text-decoration: none;
	}

	.link-refresh:hover {
		color: var(--hmp-text-dim);
		text-decoration: underline;
	}

	.link-refresh:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 2px;
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

	.primary-list {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.btn {
			transition:
				border-color 0.12s ease,
				background-color 0.12s ease;
		}
	}
</style>
