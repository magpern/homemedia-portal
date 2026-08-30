<script lang="ts">
	/**
	 * Text filter over the visible service fields (spec FR-014). Purely
	 * client-side: it narrows the already-loaded model, it never triggers a new
	 * server request or a Docker read.
	 */
	let { value = $bindable('') }: { value?: string } = $props();
</script>

<div class="searchbar">
	<label for="service-search">Search services</label>
	<input
		id="service-search"
		type="search"
		name="q"
		autocomplete="off"
		autocapitalize="none"
		spellcheck="false"
		placeholder="Filter by name or description"
		bind:value
	/>
</div>

<style>
	.searchbar {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.75rem 0;
		background: var(--hmp-bg);
	}

	label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--hmp-text-dim);
	}

	input {
		width: 100%;
		min-height: 44px;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--hmp-border);
		border-radius: var(--hmp-radius);
		background: var(--hmp-surface);
		color: var(--hmp-text);
		font-size: 1rem;
	}

	input:focus-visible {
		outline: 3px solid var(--hmp-focus);
		outline-offset: 1px;
	}
</style>
