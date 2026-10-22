<!--
    "Translate from English" for one locale tab (#41). Asks the card's translate endpoint for a
    machine translation of the English text as it is in the form, and fills the tab with it
    (`fill` from TranslationTabs' `actions` snippet): unsaved, marked machine until reviewed.
-->
<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import { localeName, type TranslationLocale } from '#lib/cards/translation.js'

    type Props = {
        cardId: string
        locale: TranslationLocale
        english: string
        fill: (text: string) => void
    }

    let { cardId, locale, english, fill }: Props = $props()

    let busy = $state(false)
    let problem = $state<string | null>(null)

    async function translate() {
        busy = true
        problem = null
        try {
            const response = await fetch(`/admin/cards/${cardId}/translate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({ locale, english }),
            })
            const answer = (await response.json().catch(() => ({}))) as {
                text?: string
                message?: string
            }
            if (response.ok && answer.text) fill(answer.text)
            else problem = answer.message ?? 'The translation failed. Try again.'
        } catch {
            problem = 'The translation failed. Check your connection and try again.'
        } finally {
            busy = false
        }
    }
</script>

<div class="flex flex-wrap items-center gap-3 text-sm">
    <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !english.trim()}
        onclick={translate}>
        {busy ? 'Translating…' : 'Translate from English'}
    </Button>
    {#if !english.trim()}
        <span class="text-muted-foreground">Write the English text first.</span>
    {:else}
        <span class="text-muted-foreground">
            Machine translation into {localeName[locale]}; check it before you save.
        </span>
    {/if}
    {#if problem}
        <p
            role="alert"
            class="w-full text-destructive">
            {problem}
        </p>
    {/if}
</div>
