<script lang="ts" generics="T extends string">
	/** Segmented control on paper. */
	let {
		tabs,
		selected = $bindable(),
		label = 'Options',
		onchange
	}: {
		tabs: { id: T; label: string }[];
		selected?: T;
		label?: string;
		onchange?: (id: T) => void;
	} = $props();

	function select(id: T) {
		selected = id;
		onchange?.(id);
	}
</script>

<div class="ui-tabs" role="tablist" aria-label={label}>
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			class="ui-tab"
			aria-selected={selected === tab.id}
			tabindex={selected === tab.id ? 0 : -1}
			onclick={() => select(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
