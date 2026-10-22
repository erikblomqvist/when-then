<script lang="ts">
    import type { WithElementRef } from '#lib/utils.js'
    import type { HTMLOptgroupAttributes } from 'svelte/elements'

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLOptgroupAttributes> = $props()
</script>

<optgroup
    bind:this={ref}
    data-slot="native-select-optgroup"
    class={className}
    {...restProps}>
    {@render children?.()}
</optgroup>
