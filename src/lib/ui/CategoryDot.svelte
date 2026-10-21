<script lang="ts">
    import CategoryIcon from './CategoryIcon.svelte'
    import { categoryLabel, type Category } from './types'

    /** 22 px category badge with the category icon. */
    let { category }: { category: Category } = $props()
</script>

<span
    class={['ui-category-dot', `cat-${category}`]}
    role="img"
    aria-label={categoryLabel[category]}>
    <CategoryIcon {category} />
</span>
