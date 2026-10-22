<script lang="ts">
    import type { PlayerIcon } from '../game/player'
    import { playerIconComponents } from './player-icons'

    /** A player's icon, by its stored name from the curated set. Decorative: pair it with the name. */
    let { icon }: { icon: PlayerIcon } = $props()

    const Icon = $derived(playerIconComponents[icon])
</script>

<Icon aria-hidden="true" />
