<!--
    A keyboard shortcut drawn as keycaps, for inside a button: ⌘ S on a Mac, Ctrl S elsewhere.
    Hidden from assistive technology; give the button `aria-keyshortcuts` instead (see
    `ariaKeyshortcuts` in ./shortcut.js). The platform is only known in the browser, so the
    caps appear once the page has hydrated. `look`: 'tinted' (the default) takes the button's
    text colour, for a filled button; 'raised' draws plain caps on the page background, standing
    out from a tinted row (`ContextMenu`).
-->
<script lang="ts">
    import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left'
    import type { ShortcutKey } from './shortcut.js'

    type Props = { keys: readonly ShortcutKey[]; look?: 'tinted' | 'raised' }

    let { keys, look = 'tinted' }: Props = $props()

    const looks = {
        tinted: 'border-current/25 shadow-[0_2px_0_color-mix(in_oklab,currentColor_25%,transparent)] bg-current/10',
        raised: 'border-border bg-background text-foreground shadow-[0_2px_0_var(--border)]',
    }

    let mac: boolean | null = $state(null)
    $effect(() => {
        mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    })

    // Enter is an icon: the ↵ character sits high in the font, above the caps' middle.
    const label = (key: Exclude<ShortcutKey, 'enter'>) =>
        key === 'mod' ? (mac ? '⌘' : 'Ctrl') : 'S'
</script>

{#if mac !== null}
    <!-- data-icon: the button keeps less padding on this side (see Button's sizes). -->
    <span
        data-icon="inline-end"
        class="ms-1 inline-flex -translate-y-px gap-0.5"
        aria-hidden="true">
        {#each keys as key (key)}
            <kbd
                class={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-sans text-[11px] leading-none font-medium',
                    // Lifts the letters to look centred; the icon is centred by its box.
                    key !== 'enter' && 'pb-0.5',
                    looks[look],
                ]}>
                {#if key === 'enter'}
                    <!-- Sized and weighted to match the ⌘ beside it. -->
                    <CornerDownLeftIcon
                        class="size-2.5"
                        strokeWidth={2.75} />
                {:else}
                    {label(key)}
                {/if}
            </kbd>
        {/each}
    </span>
{/if}
