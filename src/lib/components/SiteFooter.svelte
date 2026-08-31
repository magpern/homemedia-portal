<script lang="ts">
	/**
	 * Always-reachable "About" area. Holds the icon-set attribution required by
	 * the Dashboard Icons licence (Apache-2.0 §4, spec FR-012 / research R7) —
	 * this is the UI home for that notice.
	 */
	import AttributionNotice from './AttributionNotice.svelte';
</script>

<footer class="site-footer">
	<h2>About</h2>
	<p>
		Home media — a private, read-only directory of this household's services. It links to
		services; it never controls them.
	</p>
	<AttributionNotice />
</footer>

<style>
	.site-footer {
		margin-top: 2.5rem;
		padding: 1.25rem 0 2rem;
		border-top: 1px solid var(--hmp-border);
		color: var(--hmp-text-faint);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	h2 {
		margin: 0 0 0.4rem;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--hmp-text-dim);
	}

	p {
		margin: 0 0 0.6rem;
	}

	.site-footer :global(.attribution-notice) {
		display: block;
		color: var(--hmp-text-faint);
	}
</style>
