<!--
    One locale's translation in the card list's review mode, editable in place: click the text
    (or an empty one, to add it), change it, and Enter or leaving the field saves it, reviewed,
    as an edit in the editor would. Escape puts the saved text back; an emptied text is put back
    too, since removing a translation is the editor's job. Shows the translation's state under
    it, and why a save was refused.
-->
<script lang="ts">
    import TranslationBadge from '#lib/admin/cards/TranslationBadge.svelte'
    import {
        localeName,
        type TranslationLocale,
        type TranslationState,
    } from '#lib/cards/translation.js'
    import CheckIcon from '@lucide/svelte/icons/check'

    type Props = {
        cardId: string
        locale: TranslationLocale
        text: string | undefined
        translationState: TranslationState
        /** What the translation is of, for its accessible name. */
        of: string
    }

    let { cardId, locale, text, translationState, of }: Props = $props()

    // What is saved: the list's text and state, until an edit here saves another.
    let saved = $derived({ text: text ?? null, state: translationState })
    let busy = $state(false)
    let problem = $state<string | null>(null)

    // Sets the field's text (an attachment too, so a new save shows): the field holds no Svelte
    // text node for the person's typing to clash with.
    function shown(element: HTMLElement) {
        element.textContent = saved.text ?? ''
    }

    async function commit(element: HTMLElement) {
        const edited = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!edited || edited === saved.text) {
            shown(element)
            problem = null
            return
        }
        busy = true
        problem = null
        try {
            const response = await fetch(`/admin/cards/${cardId}/translation`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({ locale, text: edited, was: saved.text }),
            })
            if (response.ok) saved = { text: edited, state: 'reviewed' }
            else {
                const answer = (await response.json().catch(() => ({}))) as { message?: string }
                problem = answer.message ?? 'The translation could not be saved. Try again.'
            }
        } catch {
            problem = 'The translation could not be saved. Check your connection and try again.'
        } finally {
            busy = false
        }
    }

    function onkeydown(event: KeyboardEvent) {
        const element = event.currentTarget as HTMLElement
        if (event.key === 'Enter') {
            event.preventDefault()
            element.blur()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            shown(element)
            problem = null
            element.blur()
        }
    }
</script>

<div
    contenteditable={busy ? 'false' : 'plaintext-only'}
    role="textbox"
    tabindex="0"
    aria-label="{localeName[locale]} text of {of}"
    aria-busy={busy}
    aria-invalid={problem ? 'true' : undefined}
    data-placeholder="Add {localeName[locale]} text"
    class={[
        '-mx-1 cursor-text self-stretch rounded-sm px-1 font-medium outline-none hover:bg-muted focus:bg-background focus:ring-2 focus:ring-ring',
        'empty:before:font-normal empty:before:text-muted-foreground empty:before:italic empty:before:content-[attr(data-placeholder)]',
        busy && 'opacity-60',
    ]}
    {@attach shown}
    {onkeydown}
    onblur={(event) => commit(event.currentTarget)}>
</div>
{#if saved.state === 'reviewed'}
    <span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon
            class="size-3.5"
            aria-hidden="true" />
        Reviewed
    </span>
{:else}
    <TranslationBadge state={saved.state} />
{/if}
{#if problem}
    <p
        role="alert"
        class="text-xs text-destructive">
        {problem}
    </p>
{/if}
