<script lang="ts">
    import { playerIcons, type PlayerIcon as Icon } from '../game/player'
    import PlayerIcon from './PlayerIcon.svelte'

    /**
     * Pick one icon from the curated player set: a grid of radio buttons named `name`, so it
     * posts with its form. `labels` names each icon for screen readers. `taken` icons belong to
     * other players: greyed out and disabled, and a picked icon that becomes taken is unpicked.
     */
    let {
        name,
        legend,
        labels,
        taken = [],
        value = $bindable(),
    }: {
        name: string
        legend: string
        labels: Record<Icon, string>
        taken?: readonly Icon[]
        value?: Icon
    } = $props()

    $effect(() => {
        if (value && taken.includes(value)) value = undefined
    })
</script>

<fieldset class="picker">
    <legend class="ui-caption">{legend}</legend>
    <div class="grid">
        {#each playerIcons as icon (icon)}
            <label
                class="option"
                title={labels[icon]}>
                <input
                    type="radio"
                    {name}
                    value={icon}
                    required
                    disabled={taken.includes(icon)}
                    aria-label={labels[icon]}
                    bind:group={value} />
                <PlayerIcon {icon} />
            </label>
        {/each}
    </div>
</fieldset>

<style>
    .picker {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: none;
    }
    legend {
        margin-bottom: var(--space-4);
        padding: 0;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: var(--space-3);
    }
    .option {
        position: relative;
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        border-radius: var(--radius-sm);
        color: var(--text-on-paper);
        background: var(--surface-paper-sunken);
        cursor: pointer;
    }
    .option:has(input:checked) {
        color: var(--text-on-table-strong);
        background: var(--surface-table);
    }
    .option:has(input:focus-visible) {
        box-shadow: var(--focus-ring);
    }
    .option:has(input:disabled) {
        opacity: 0.35;
        cursor: not-allowed;
    }
    /* Invisible, over the whole tile: the tile is what you see and tap. */
    input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }
    input:disabled {
        cursor: not-allowed;
    }
</style>
