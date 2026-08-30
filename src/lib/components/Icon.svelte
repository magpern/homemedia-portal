<script lang="ts">
	/**
	 * Renders a bundled icon by id. Markup comes from the local, build-time
	 * registry only (`$lib/icons`) — never a network fetch (spec FR-012). An
	 * unknown id falls back to the generic glyph inside the registry.
	 *
	 * `aria-hidden`: the icon is always paired with the service name as visible
	 * text, so it adds nothing for assistive technology.
	 */
	import { getIconSvg } from '$lib/icons';

	let { id }: { id: string } = $props();
</script>

<span class="icon" aria-hidden="true">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted, authored/vetted bundled SVG markup -->
	{@html getIconSvg(id)}
</span>

<style>
	.icon {
		display: inline-flex;
		width: 1.75rem;
		height: 1.75rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		color: var(--hmp-text-dim);
	}

	.icon :global(svg) {
		width: 100%;
		height: 100%;
	}
</style>
