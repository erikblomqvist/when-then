<script lang="ts">
    import { Lightbulb, MapPin, User, Zap } from '@lucide/svelte'
    import type { Category } from './types'

    let { category }: { category: Category } = $props()

    const icons = { events: Zap, people: User, inventions: Lightbulb, places: MapPin } as const
    const Icon = $derived(icons[category])
</script>

<Icon aria-hidden="true" />
