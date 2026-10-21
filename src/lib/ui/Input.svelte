<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements'

    /** Inset paper text field, in serif. */
    let { value = $bindable(''), class: className, ...rest }: HTMLInputAttributes = $props()
</script>

<input
    class={['ui-input', className]}
    bind:value
    {...rest} />
