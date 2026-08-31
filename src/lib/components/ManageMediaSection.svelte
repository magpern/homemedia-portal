<script lang="ts">
	/**
	 * The collapsed "Manage media" section on the friendly landing view
	 * (feature 002, spec FR-102, FR-108, FR-116).
	 *
	 * A native `<details>` / `<summary>` disclosure: keyboard-operable and
	 * state-exposing with no ARIA or JS of its own. Collapsed by default; the page
	 * sets `open` to force-expand it while a search matches something inside, and
	 * clears it when the query is cleared. Inside, the `placement=manage` services
	 * are grouped exactly as the Portal v1 dashboard.
	 */
	import type { Category } from '$lib/types';
	import { MANAGE_FALLBACK_DESCRIPTION } from '$lib/description';
	import CategorySection from './CategorySection.svelte';

	let {
		categories,
		count,
		open = $bindable(false),
		matchNote = null
	}: {
		categories: Category[];
		count: number;
		open?: boolean;
		matchNote?: string | null;
	} = $props();
</script>

<details class="manage" bind:open>
	<summary>
		<span class="summary-label">Manage media</span>
		<span class="summary-count">{count} {count === 1 ? 'tool' : 'tools'}</span>
	</summary>

	<div class="manage-body">
		{#if matchNote}
			<p class="match-note" role="status">{matchNote}</p>
		{/if}
		{#each categories as category (category.key)}
			<CategorySection {category} descriptionFallback={MANAGE_FALLBACK_DESCRIPTION} />
		{/each}
	</div>
</details>

<style>
	.manage {
		margin-top: 1.75rem;
		border-top: 1px solid var(--hmp-border);
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0.75rem 0.25rem;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--hmp-text-dim);
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::before {
		content: '▸';
		display: inline-block;
		margin-right: 0.5rem;
		font-size: 0.8em;
		color: var(--hmp-text-faint);
	}

	.manage[open] summary::before {
		content: '▾';
	}

	summary:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.summary-count {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: none;
		letter-spacing: 0;
		color: var(--hmp-text-faint);
	}

	.manage-body {
		padding-bottom: 0.5rem;
	}

	.match-note {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--hmp-text-dim);
	}
</style>
