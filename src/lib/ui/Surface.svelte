<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLAttributes } from 'svelte/elements'

    type Props = HTMLAttributes<HTMLDivElement> & {
        /** table: the dark navy felt. tray: inset on the table. paper, sheet, panel: cream surfaces. veil: dimming overlay. */
        kind: 'table' | 'tray' | 'paper' | 'sheet' | 'panel' | 'veil'
        /** Table only: add the felt grain texture. */
        grain?: boolean
        children?: Snippet
    }

    let { kind, grain = false, class: className, children, ...rest }: Props = $props()
    const grainId = $props.id()
</script>

<div
    class={[`ui-${kind}`, className]}
    {...rest}>
    {#if kind === 'table' && grain}
        <svg
            class="ui-table__grain"
            aria-hidden="true">
            <filter id={grainId}>
                <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.85"
                    numOctaves="2"
                    stitchTiles="stitch" />
                <feColorMatrix
                    type="saturate"
                    values="0" />
            </filter>
            <rect
                width="100%"
                height="100%"
                filter="url(#{grainId})" />
        </svg>
    {/if}
    {#if children}{@render children()}{/if}
</div>
