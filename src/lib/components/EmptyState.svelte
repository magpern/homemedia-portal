<script lang="ts">
	/**
	 * The three non-list states the dashboard can show (spec FR-030, contract
	 * `GET /`):
	 *
	 * - `no-services`     — discovery worked, nothing is labelled yet. Friendly
	 *                       copy that never names or counts unlabelled containers.
	 * - `source-unavailable` — labelled-service discovery itself failed. Explicit,
	 *                       and rendered **instead of** any list (nothing stale).
	 * - `no-results`      — the search filter matched nothing.
	 */
	type Variant = 'no-services' | 'source-unavailable' | 'no-results';

	let { variant, query = '' }: { variant: Variant; query?: string } = $props();
</script>

<div class="empty" class:empty--error={variant === 'source-unavailable'} role="note">
	{#if variant === 'source-unavailable'}
		<p class="headline">The service directory is currently unavailable</p>
		<p>
			The portal could not reach the service source. No list is shown until it recovers —
			reload to try again.
		</p>
	{:else if variant === 'no-services'}
		<p class="headline">Nothing here yet</p>
		<p>
			No services have been added to the portal. Label a container with <code
				>homemedia.enable=true</code
			> to make it appear.
		</p>
	{:else}
		<p class="headline">No matches</p>
		<p>
			Nothing matches {query ? `“${query}”` : 'your search'}. Clear the filter to see
			everything.
		</p>
	{/if}
</div>

<style>
	.empty {
		margin-top: 1.5rem;
		padding: 1.25rem;
		border: 1px dashed var(--hmp-border-strong);
		border-radius: var(--hmp-radius);
		background: var(--hmp-surface);
		color: var(--hmp-text-dim);
	}

	.empty--error {
		border-style: solid;
		border-color: var(--hmp-status-down);
		color: var(--hmp-text);
	}

	.headline {
		margin: 0 0 0.4rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--hmp-text);
	}

	p {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		line-height: 1.45;
	}

	code {
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
		background: var(--hmp-surface-raised);
		font-size: 0.85em;
	}
</style>
