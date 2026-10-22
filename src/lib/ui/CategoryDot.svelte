<script lang="ts">
    import CategoryIcon from './CategoryIcon.svelte'
    import type { CategoryLook } from './types'

    /** 22 px category badge: the category's icon on its colour. */
    let { category }: { category: CategoryLook } = $props()
</script>

<span
    class={['ui-category-dot', `cat-${category.colour}`]}
    role="img"
    aria-label={category.name}>
    <CategoryIcon icon={category.icon} />
</span>
