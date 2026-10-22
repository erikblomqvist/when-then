<script lang="ts">
    import type { WithElementRef } from '#lib/utils.js'
    import type { HTMLOptionAttributes } from 'svelte/elements'

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLOptionAttributes> = $props()
</script>

<option
    bind:this={ref}
    data-slot="native-select-option"
    class={className}
    {...restProps}>
    {@render children?.()}
</option>
