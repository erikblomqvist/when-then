<!--
    "Suggest date" under the card's date fields (#42). Asks the card's suggest-date endpoint for
    a sourced year for the English text as it is in the form, and shows the year, how the AI
    read the statement, its confidence, the source quote and link, and alternatives. Accept (or
    an alternative) fills the form through `apply`, unsaved; Dismiss changes nothing. Either
    way the decision is logged against the request. Rendered by CardEditor's `dateActions`.
-->
<script lang="ts">
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import type { SuggestedDate } from '#lib/cards/card-form.js'
    import { formatCardDate } from '#lib/cards/date-parts.js'
    import type { DateSuggestion } from '#lib/server/ai-suggest-date.js'

    type Props = {
        cardId: string
        english: string
        apply: (date: SuggestedDate) => void
    }

    let { cardId, english, apply }: Props = $props()

    let busy = $state(false)
    let problem = $state<string | null>(null)
    let shown = $state<{ suggestion: DateSuggestion; requestId: number } | null>(null)

    const yearText = (year: number) =>
        formatCardDate({ decade: null, year, month: null, day: null })
    const confidenceText = { high: 'High', medium: 'Medium', low: 'Low' }
    const viaText = { wikidata: 'Found on Wikidata', web_search: 'Found by web search' }

    async function suggest() {
        busy = true
        problem = null
        shown = null
        try {
            const response = await fetch(`/admin/cards/${cardId}/suggest-date`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({ english }),
            })
            const answer = (await response.json().catch(() => ({}))) as {
                suggestion?: DateSuggestion
                requestId?: number
                message?: string
            }
            if (response.ok && answer.suggestion && typeof answer.requestId === 'number') {
                shown = { suggestion: answer.suggestion, requestId: answer.requestId }
            } else problem = answer.message ?? 'The date suggestion failed. Try again.'
        } catch {
            problem = 'The date suggestion failed. Check your connection and try again.'
        } finally {
            busy = false
        }
    }

    async function decide(decision: 'accepted' | 'rejected', date?: SuggestedDate) {
        if (!shown) return
        const { requestId } = shown
        if (date) apply(date)
        shown = null
        try {
            const response = await fetch(`/admin/cards/${cardId}/suggest-date/decision`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ requestId, decision, year: date?.year }),
            })
            if (!response.ok) throw new Error()
        } catch {
            problem = 'Your choice was applied, but it could not be logged.'
        }
    }
</script>

<div class="flex flex-col gap-3 text-sm">
    <div class="flex flex-wrap items-center gap-3">
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !english.trim()}
            onclick={suggest}>
            {busy ? 'Looking up the date…' : 'Suggest date'}
        </Button>
        {#if !english.trim()}
            <span class="text-muted-foreground">Write the English text first.</span>
        {:else}
            <span class="text-muted-foreground">
                AI suggestion from Wikidata or the web; check the source before you save.
            </span>
        {/if}
    </div>
    {#if problem}
        <p
            role="alert"
            class="text-destructive">
            {problem}
        </p>
    {/if}
    {#if shown}
        {@const { suggestion } = shown}
        <section
            aria-labelledby="date-suggestion-heading"
            class="flex flex-col gap-3 rounded-md border p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h3
                    id="date-suggestion-heading"
                    class="font-medium">
                    Date suggestion
                </h3>
                <span class="text-muted-foreground">{viaText[suggestion.via]}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3">
                <span class="text-2xl font-semibold tabular-nums">
                    {yearText(suggestion.year)}
                </span>
                <Badge variant="secondary">
                    {confidenceText[suggestion.confidence]} confidence
                </Badge>
            </div>
            {#if suggestion.interpretation}
                <p>{suggestion.interpretation}</p>
            {/if}
            <figure class="flex flex-col gap-1">
                {#if suggestion.sourceQuote}
                    <blockquote class="border-l-2 pl-3 italic">
                        {suggestion.sourceQuote}
                    </blockquote>
                {/if}
                <figcaption class="break-all text-muted-foreground">
                    Source:
                    <a
                        href={suggestion.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="underline underline-offset-2">
                        {suggestion.sourceUrl}
                    </a>
                </figcaption>
            </figure>
            {#if suggestion.alternatives.length > 0}
                <div class="flex flex-col gap-2">
                    <h4 class="font-medium">Alternatives</h4>
                    <ul class="flex flex-col gap-2">
                        {#each suggestion.alternatives as alternative (alternative.year)}
                            <li class="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label="Use {yearText(alternative.year)}"
                                    onclick={() =>
                                        decide('accepted', {
                                            year: alternative.year,
                                            sourceUrl: alternative.sourceUrl,
                                            sourceQuote: alternative.sourceQuote,
                                        })}>
                                    Use {yearText(alternative.year)}
                                </Button>
                                <span>{alternative.reason}</span>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
            <div class="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    onclick={() =>
                        decide('accepted', {
                            year: suggestion.year,
                            sourceUrl: suggestion.sourceUrl,
                            sourceQuote: suggestion.sourceQuote,
                        })}>
                    Accept {yearText(suggestion.year)}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onclick={() => decide('rejected')}>
                    Dismiss
                </Button>
            </div>
        </section>
    {/if}
</div>
