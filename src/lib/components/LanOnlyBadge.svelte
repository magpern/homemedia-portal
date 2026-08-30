<script lang="ts">
	/**
	 * Visible "LAN only" marker (spec FR-029, SC-012). The portal still links to
	 * the destination; it just never proxies or tunnels to it, so opening the tile
	 * from outside the home network may simply not connect — which is expected.
	 */
</script>

<span class="lan-badge" title="Reachable only on the home network">LAN only</span>

<style>
	.lan-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--hmp-border-strong);
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--hmp-text-dim);
		white-space: nowrap;
	}
</style>
