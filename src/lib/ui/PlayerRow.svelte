<script lang="ts">
	/** One player in a list. Without a name it shows the empty text. */
	let {
		number,
		name,
		emptyText = 'Waiting for a player…',
		role
	}: { number: number; name?: string; emptyText?: string; role?: string } = $props();
</script>

<div class="ui-player-row">
	<span class="ui-player-row__number">{number}</span>
	{#if name}
		<span class="ui-player-row__name">{name}</span>
	{:else}
		<span class="ui-player-row__empty">{emptyText}</span>
	{/if}
	<span class="ui-role-tag">{role ?? ''}</span>
</div>
