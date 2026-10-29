<script lang="ts">
    // PROTOTYPE (#16), throwaway: the floating switcher. Deliberately not in the game's look, so
    // it's never mistaken for part of a design. Arrows (or ← →) switch the variant; the settings
    // pick whose phone you see, the moment of the game, and one phone or the whole table.
    type Option = { key: string; label: string }

    let {
        variants,
        variant,
        seats,
        seat,
        moments,
        moment,
        layout,
        onchange,
        onreset,
    }: {
        variants: Option[]
        variant: string
        seats: Option[]
        seat: string
        moments: Option[]
        moment: string
        layout: 'phone' | 'table'
        onchange: (changes: Record<string, string | null>) => void
        onreset: () => void
    } = $props()

    let open = $state(false)
    const index = $derived(variants.findIndex((v) => v.key === variant))
    const cycle = (by: number) =>
        onchange({ variant: variants[(index + by + variants.length) % variants.length].key })

    function keydown(event: KeyboardEvent) {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, select, [contenteditable]')) return
        if (event.key === 'ArrowLeft') cycle(-1)
        if (event.key === 'ArrowRight') cycle(1)
    }
</script>

<svelte:window onkeydown={keydown} />

<div class="bar">
    {#if open}
        <div class="panel">
            <span class="title">Whose phone</span>
            <div class="chips">
                {#each seats as s (s.key)}
                    <button
                        type="button"
                        aria-pressed={seat === s.key}
                        onclick={() => onchange({ seat: s.key })}>{s.label}</button>
                {/each}
            </div>
            <label class="title">
                Moment
                <select
                    value={moment}
                    onchange={(event) => onchange({ moment: event.currentTarget.value })}>
                    {#each moments as m (m.key)}
                        <option value={m.key}>{m.label}</option>
                    {/each}
                </select>
            </label>
            <span class="title">Layout</span>
            <div class="chips">
                <button
                    type="button"
                    aria-pressed={layout === 'phone'}
                    onclick={() => onchange({ layout: null })}>One phone</button>
                <button
                    type="button"
                    aria-pressed={layout === 'table'}
                    onclick={() => onchange({ layout: 'table' })}>Whole table</button>
                <button
                    type="button"
                    onclick={onreset}>↺ Restart moment</button>
            </div>
        </div>
    {/if}
    <div class="pill">
        <button
            type="button"
            aria-label="Previous variant"
            onclick={() => cycle(-1)}>←</button>
        <span class="label"><b>{variant}</b> {variants[index]?.label}</span>
        <button
            type="button"
            aria-label="Next variant"
            onclick={() => cycle(1)}>→</button>
        <button
            type="button"
            aria-label="Prototype settings"
            aria-expanded={open}
            onclick={() => (open = !open)}>⚙</button>
    </div>
</div>

<style>
    .bar {
        position: fixed;
        left: 50%;
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 100;
        display: grid;
        justify-items: center;
        gap: 8px;
        transform: translateX(-50%);
        font:
            13px/1.3 ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        color: #fff;
    }
    .pill,
    .panel {
        background: #111;
        box-shadow:
            0 0 0 1px #fff3,
            0 8px 24px #0008;
    }
    .pill {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        white-space: nowrap;
    }
    .label {
        padding: 0 8px;
    }
    button {
        min-width: 36px;
        height: 36px;
        padding: 0 10px;
        border: none;
        border-radius: 999px;
        font: inherit;
        color: inherit;
        background: #fff1;
        cursor: pointer;
    }
    button[aria-pressed='true'] {
        color: #111;
        background: #ffe14d;
    }
    .panel {
        display: grid;
        gap: 6px;
        width: min(92vw, 380px);
        padding: 12px;
        border-radius: 14px;
    }
    .title {
        display: grid;
        gap: 4px;
        color: #fffa;
    }
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .chips button {
        height: 30px;
    }
    select {
        height: 32px;
        border-radius: 8px;
        font: inherit;
    }
</style>
