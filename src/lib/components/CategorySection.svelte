<script lang="ts">
	/** A category group of service tiles (spec FR-014, data-model §5). */
	import type { Category } from '$lib/types';
	import ServiceCard from './ServiceCard.svelte';

	/** `descriptionFallback` (feature 002) is forwarded to every tile — see ServiceCard. */
	let {
		category,
		descriptionFallback = null
	}: { category: Category; descriptionFallback?: string | null } = $props();
</script>

<section class="category" aria-labelledby="category-{category.key}">
	<h2 id="category-{category.key}">
		<span class="label">{category.label}</span>
		<span class="count" aria-hidden="true">{category.services.length}</span>
	</h2>
	<ul class="cards">
		{#each category.services as service (service.slug)}
			<li><ServiceCard {service} {descriptionFallback} /></li>
		{/each}
	</ul>
</section>

<style>
	.category {
		margin-top: 1.5rem;
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0 0 0.6rem;
		font-size: 0.95rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--hmp-text-dim);
	}

	.count {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--hmp-text-faint);
	}

	.cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
