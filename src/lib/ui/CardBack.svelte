<script lang="ts">
    import type { CardSize } from './types'

    /** The deck: a face-down card. */
    let { size = 'lg', class: className }: { size?: CardSize; class?: string } = $props()
</script>

<div class={['ui-card-back', `ui-card--${size}`, className]}>
    <span class="ui-card-back__emblem"><b>?</b></span>
</div>
