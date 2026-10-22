<script lang="ts">
    import type { CategoryLook } from './types'

    /** Square swatch in the category's colour plus its name (or `label`), for legends. */
    let { category, label }: { category: CategoryLook; label?: string } = $props()
</script>

<span class={['ui-category-legend-item', `cat-${category.colour}`]}>{label ?? category.name}</span>
