<script lang="ts">
	/**
	 * Per-service status, conveyed on three independent channels so it is never
	 * colour-alone (FR-021, SC-006): a shape (circle / square / triangle), a
	 * colour, and the human-readable label text.
	 */
	import type { ServiceStatus } from '$lib/types';

	let { status, label }: { status: ServiceStatus; label: string } = $props();
</script>

<span class="status status--{status}">
	<span class="glyph" aria-hidden="true"></span>
	<span class="label">{label}</span>
</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8125rem;
		color: var(--hmp-text-dim);
	}

	.glyph {
		width: 0.7rem;
		height: 0.7rem;
		flex: 0 0 auto;
	}

	/* Running — filled circle. */
	.status--up .glyph {
		background: var(--hmp-status-up);
		border-radius: 50%;
	}
	.status--up .label {
		color: var(--hmp-status-up-text);
	}

	/* Not running — filled square. */
	.status--down .glyph {
		background: var(--hmp-status-down);
		border-radius: 2px;
	}
	.status--down .label {
		color: var(--hmp-status-down-text);
	}

	/* Status unavailable / starting — hollow triangle. */
	.status--unknown .glyph {
		background: var(--hmp-status-unknown);
		clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
	}
</style>
