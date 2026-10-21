<script lang="ts">
    import { categoryLabel, type Category } from './types'

    /** Square swatch plus the category name, for legends. */
    let { category, label }: { category: Category; label?: string } = $props()
</script>

<span class={['ui-category-legend-item', `cat-${category}`]}
    >{label ?? categoryLabel[category]}</span>
