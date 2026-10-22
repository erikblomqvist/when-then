<!--
    The card editor's locale tabs (sv, nb): text, note and a "reviewed" tick per locale, inside
    the editor's form so they share its save and unsaved-changes guard. Every panel stays in
    the form (inactive ones are hidden), so a save posts all locales.

    Each tab shows the saved state and, when a save would change it, what it becomes
    (`statusOnSave` in `#lib/cards/translation.js`, mirroring the database's rules).

    `actions` renders inside each panel with `{ locale, english, fill }`: `fill(text)` puts a
    machine translation into the tab, unsaved (status machine until someone edits it or ticks
    reviewed). AI translation (#41) plugs its "Translate from English" button in there.
-->
<script
    module
    lang="ts">
    import type { Snippet } from 'svelte'
    import type { TranslationLocale } from '#lib/cards/translation.js'

    export type TranslationActions = Snippet<
        [{ locale: TranslationLocale; english: string; fill: (text: string) => void }]
    >
</script>

<script lang="ts">
    import { Label } from '#lib/components/ui/label/index.js'
    import { Textarea } from '#lib/components/ui/textarea/index.js'
    import type { Card } from '#lib/cards/card.js'
    import {
        cardTextMaxLength,
        fillMachineTranslationField,
        translationDraft,
        type CardFormErrors,
        type CardFormValues,
    } from '#lib/cards/card-form.js'
    import {
        localeName,
        statusOnSave,
        translationLocales,
        translationStateLabel,
    } from '#lib/cards/translation.js'
    import TranslationBadge from './TranslationBadge.svelte'

    type Props = {
        values: CardFormValues
        card?: Card
        errors?: CardFormErrors
        actions?: TranslationActions
    }

    let { values = $bindable(), card, errors = {}, actions }: Props = $props()

    const erroredLocale = () =>
        translationLocales.find((locale) => errors[`text_${locale}`] ?? errors[`note_${locale}`])

    // svelte-ignore state_referenced_locally -- the starting tab; later errors switch below
    let active: TranslationLocale = $state(erroredLocale() ?? 'sv')
    $effect(() => {
        const locale = erroredLocale()
        if (locale) active = locale
    })

    const englishChanged = $derived(
        card !== undefined && values.text_en.trim() !== (card.translations.en?.text ?? ''),
    )
    const savedState = (locale: TranslationLocale) =>
        card?.translations[locale]?.status ?? 'missing'
    const stateOnSave = (locale: TranslationLocale) =>
        statusOnSave({
            saved: card?.translations[locale],
            draft: translationDraft(values, locale),
            englishChanged,
        })

    const fill = (locale: TranslationLocale) => (text: string) => {
        values = fillMachineTranslationField(values, locale, text)
        active = locale
    }

    const tabs: Record<string, HTMLButtonElement> = {}
    function onkeydown(event: KeyboardEvent) {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        event.preventDefault()
        const count = translationLocales.length
        active = translationLocales[(translationLocales.indexOf(active) + step + count) % count]
        tabs[active]?.focus()
    }
</script>

<section
    aria-labelledby="translations-heading"
    class="flex flex-col gap-3">
    <h2
        id="translations-heading"
        class="text-sm font-medium">
        Translations
    </h2>
    <div
        role="tablist"
        aria-label="Translations"
        tabindex="-1"
        class="flex gap-1 border-b"
        {onkeydown}>
        {#each translationLocales as locale (locale)}
            <button
                bind:this={tabs[locale]}
                type="button"
                role="tab"
                id="tab-{locale}"
                aria-controls="panel-{locale}"
                aria-selected={active === locale}
                tabindex={active === locale ? 0 : -1}
                class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm {active ===
                locale
                    ? 'border-primary font-medium'
                    : 'border-transparent text-muted-foreground'}"
                onclick={() => (active = locale)}>
                {localeName[locale]}
                <TranslationBadge state={savedState(locale)} />
            </button>
        {/each}
    </div>

    {#each translationLocales as locale (locale)}
        {@const draft = translationDraft(values, locale)}
        {@const onSave = stateOnSave(locale)}
        {@const textError = errors[`text_${locale}`]}
        <div
            role="tabpanel"
            id="panel-{locale}"
            aria-labelledby="tab-{locale}"
            hidden={active !== locale}
            class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
                <Label for="text_{locale}">{localeName[locale]} text</Label>
                <Textarea
                    id="text_{locale}"
                    name="text_{locale}"
                    rows={3}
                    maxlength={cardTextMaxLength}
                    bind:value={values[`text_${locale}`]}
                    aria-invalid={textError ? 'true' : undefined}
                    aria-describedby={textError ? `text_${locale}-error` : undefined} />
                {#if textError}
                    <p
                        id="text_{locale}-error"
                        class="text-sm text-destructive">
                        {textError}
                    </p>
                {/if}
            </div>
            <div class="flex flex-col gap-2">
                <Label for="note_{locale}">{localeName[locale]} note (optional)</Label>
                <Textarea
                    id="note_{locale}"
                    name="note_{locale}"
                    rows={2}
                    bind:value={values[`note_${locale}`]} />
            </div>
            {#if draft.machineText !== null}
                <input
                    type="hidden"
                    name="machine_text_{locale}"
                    value={draft.machineText} />
            {/if}
            <div class="flex flex-wrap items-center gap-4 text-sm">
                <label class="flex items-center gap-2">
                    <input
                        type="checkbox"
                        name="reviewed_{locale}"
                        value="true"
                        class="size-4 accent-primary"
                        checked={onSave === 'reviewed'}
                        disabled={!draft.text.trim() || (onSave === 'reviewed' && !draft.reviewed)}
                        onchange={(event) =>
                            (values[`reviewed_${locale}`] = event.currentTarget.checked
                                ? 'true'
                                : '')} />
                    Reviewed
                </label>
                <p class="text-muted-foreground">
                    {#if onSave !== savedState(locale)}
                        {onSave === 'missing'
                            ? 'Removed when saved'
                            : `${translationStateLabel[onSave]} when saved`}
                    {:else if onSave === 'stale'}
                        The English text changed since this was reviewed.
                    {:else if onSave === 'machine'}
                        Machine translated: edit it or tick Reviewed once you have read it.
                    {/if}
                </p>
            </div>
            {@render actions?.({ locale, english: values.text_en, fill: fill(locale) })}
        </div>
    {/each}
</section>
