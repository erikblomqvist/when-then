<script lang="ts">
	/** Round rank or order number. Empty is the outline version. */
	let { value, empty = false }: { value?: number | string; empty?: boolean } = $props();
</script>

<span class={['ui-number-badge', empty && 'ui-number-badge--empty']}>{value ?? ''}</span>
