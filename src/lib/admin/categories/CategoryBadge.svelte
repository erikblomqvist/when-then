<!-- A category's icon on its palette colour, as the admin shows it. The `.cat-<colour>` scopes
     come from category-colours.css, which admin.css shares with the game. -->
<script lang="ts">
    import type { CategoryColour, CategoryIconName } from '#lib/categories/look.js'
    import CategoryIcon from '#lib/ui/CategoryIcon.svelte'

    let { name, icon, colour }: { name: string; icon: CategoryIconName; colour: CategoryColour } =
        $props()
</script>

<span
    role="img"
    aria-label={name}
    class="cat-{colour} inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-(--cat) text-white shadow-[inset_0_-2px_0_var(--cat-dark)] [&_svg]:size-4">
    <CategoryIcon {icon} />
</span>
