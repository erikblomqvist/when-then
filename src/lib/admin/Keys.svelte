<!--
    A keyboard shortcut drawn as keycaps, for inside a button: ⌘ S on a Mac, Ctrl S elsewhere.
    Hidden from assistive technology; give the button `aria-keyshortcuts` instead (see
    `ariaKeyshortcuts` in ./shortcut.js). The platform is only known in the browser, so the
    caps appear once the page has hydrated.
-->
<script lang="ts">
    import type { ShortcutKey } from './shortcut.js'

    let { keys }: { keys: readonly ShortcutKey[] } = $props()

    let mac: boolean | null = $state(null)
    $effect(() => {
        mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    })

    const label = (key: ShortcutKey) =>
        key === 'mod' ? (mac ? '⌘' : 'Ctrl') : key === 's' ? 'S' : '↵'
</script>

{#if mac !== null}
    <!-- data-icon: the button keeps less padding on this side (see Button's sizes). -->
    <span
        data-icon="inline-end"
        class="ms-1 inline-flex -translate-y-px gap-0.5"
        aria-hidden="true">
        {#each keys as key (key)}
            <kbd
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-current/25 shadow-[0_2px_0_color-mix(in_oklab,currentColor_25%,transparent)] bg-current/10 px-1 pb-0.5 font-sans text-[11px] leading-none font-medium">
                {label(key)}
            </kbd>
        {/each}
    </span>
{/if}
