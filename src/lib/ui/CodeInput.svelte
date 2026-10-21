<script lang="ts">
    /**
     * Fixed-length play code. Shows N boxes over one invisible field.
     * `readonly` renders the small paper display variant.
     */
    type Props = {
        value?: string
        length?: number
        readonly?: boolean
        label?: string
        oncomplete?: (code: string) => void
    }

    let {
        value = $bindable(''),
        length = 4,
        readonly = false,
        label = 'Play code',
        oncomplete,
    }: Props = $props()

    let focused = $state(false)
    const chars = $derived(Array.from({ length }, (_, i) => value[i] ?? ''))

    function oninput(e: Event & { currentTarget: HTMLInputElement }) {
        value = e.currentTarget.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, length)
        e.currentTarget.value = value
        if (value.length === length) oncomplete?.(value)
    }
</script>

<div
    class={['ui-code-input', readonly && 'ui-code-input--sm']}
    style:--code-length={length}>
    {#each chars as ch, i (i)}
        <div
            class={[
                'ui-code-input__box',
                !readonly && ch === '' && 'ui-code-input__box--empty',
                !readonly && focused && i === value.length && 'ui-code-input__box--next',
            ]}
            aria-hidden="true">
            {ch}
        </div>
    {/each}
    {#if !readonly}
        <input
            class="ui-code-input__field"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            autocapitalize="characters"
            maxlength={length}
            aria-label={label}
            {value}
            {oninput}
            onfocus={() => (focused = true)}
            onblur={() => (focused = false)} />
    {:else}
        <span class="sr-only">{label}: {value}</span>
    {/if}
</div>

<style>
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }
</style>
