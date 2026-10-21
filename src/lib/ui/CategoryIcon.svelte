<script lang="ts">
    import type { CategoryIconName } from '../categories/look'
    import { categoryIconComponents } from './category-icons'

    /** A category's icon, by its stored name from the curated set. Decorative: pair it with the name. */
    let { icon }: { icon: CategoryIconName } = $props()

    const Icon = $derived(categoryIconComponents[icon])
</script>

<Icon aria-hidden="true" />
