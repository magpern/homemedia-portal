<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	let password = $state('');
</script>

<svelte:head>
	<title>Sign in · homemedia-portal</title>
</svelte:head>

<main class="login">
	<h1>Sign in</h1>
	<p class="lede">This portal is private. Enter the household password to continue.</p>

	<form method="POST" novalidate>
		<input type="hidden" name="redirectTo" value={data.redirectTo} />

		<label for="password">Password</label>
		<input
			id="password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
			bind:value={password}
		/>

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<button type="submit">Sign in</button>
	</form>
</main>

<style>
	.login {
		max-width: 22rem;
		margin: 0 auto;
		padding: 2rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.lede {
		margin: 0;
		color: #444;
		font-size: 0.95rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-weight: 600;
	}

	input {
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		font-size: 1rem;
		border: 1px solid #888;
		border-radius: 6px;
	}

	.error {
		margin: 0;
		color: #b00020;
		font-size: 0.95rem;
	}

	button {
		min-height: 44px;
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 1rem;
		font-weight: 600;
		border: 0;
		border-radius: 6px;
		background: #1f2933;
		color: #fff;
		cursor: pointer;
	}

	button:hover {
		background: #111820;
	}

	@media (prefers-color-scheme: dark) {
		.lede {
			color: #bbb;
		}
		input {
			background: #1a1a1a;
			color: #eee;
			border-color: #555;
		}
		.error {
			color: #ff6b6b;
		}
		button {
			background: #3a4a5a;
		}
	}
</style>
