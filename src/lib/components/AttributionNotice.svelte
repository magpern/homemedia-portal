<script lang="ts">
	/**
	 * Minimal, unstyled attribution stub for the bundled icon set (Apache-2.0 §4,
	 * spec FR-012 / research R7). A later work package places and styles the
	 * portal's real "About"/footer; this component only guarantees the required
	 * credit, licence pointer, and trademark notice have a home in the UI.
	 */
	import { ICON_SET_ATTRIBUTION } from '$lib/icons';

	const attribution = ICON_SET_ATTRIBUTION;
</script>

<small class="attribution-notice">
	Icons from {attribution.name} ({attribution.url}) — {attribution.copyright}, licensed under
	{attribution.license}. {attribution.trademarkNotice}
</small>
