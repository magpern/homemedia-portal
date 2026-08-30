<script lang="ts">
	// This component is never rendered: `+page.server.ts` `load` always returns 405
	// for GET, and the POST form action redirects. It exists only so `/logout` is a
	// valid page route that can host the logout form action.
</script>

<p>Sign out by submitting the sign-out form.</p>
