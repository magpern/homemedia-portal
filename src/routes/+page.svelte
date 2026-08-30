<script lang="ts">
	// Placeholder authenticated landing route. Reaching it means the session guard
	// (WP3) let the request through. The real dashboard replaces this in WP6.
</script>

<svelte:head>
	<title>homemedia-portal</title>
</svelte:head>

<main>
	<h1>homemedia-portal</h1>
	<p>You are signed in. The dashboard arrives in a later work package.</p>

	<form method="POST" action="/logout">
		<button type="submit">Sign out</button>
	</form>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 0 auto;
		padding: 2rem 1.25rem;
	}

	button {
		min-height: 44px;
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
	}
</style>
