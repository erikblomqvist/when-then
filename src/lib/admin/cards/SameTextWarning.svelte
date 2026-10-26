<!--
    Under the editor's English text: the other cards (not archived) with the same text, case,
    punctuation and spacing aside, so a card isn't made twice. A warning, not a block. Asks the
    `same-text` endpoint once typing pauses; leaves out the card being edited (`exceptId`).
-->
<script lang="ts">
    import type { SameTextCard } from '#lib/server/duplicate-cards.js'

    type Props = {
        text: string
        exceptId?: string
    }

    let { text, exceptId }: Props = $props()

    let cards: SameTextCard[] = $state([])

    $effect(() => {
        const typed = text.trim()
        if (!typed) {
            cards = []
            return
        }
        const asked = new AbortController()
        const params = new URLSearchParams({ text: typed, ...(exceptId && { except: exceptId }) })
        const wait = setTimeout(async () => {
            try {
                const response = await fetch(`/admin/cards/same-text?${params}`, {
                    signal: asked.signal,
                })
                if (response.ok)
                    cards = ((await response.json()) as { cards: SameTextCard[] }).cards
            } catch {
                // Aborted by newer typing, or offline: the warning is a help, not a check.
            }
        }, 400)
        return () => {
            clearTimeout(wait)
            asked.abort()
        }
    })
</script>

{#if cards.length > 0}
    <div
        role="status"
        class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p>
            {cards.length === 1 ? 'Another card has' : `${cards.length} other cards have`} the same text:
        </p>
        <ul class="mt-1 list-disc pl-5">
            {#each cards as card (card.id)}
                <li>
                    <a
                        href="/admin/cards/{card.id}"
                        target="_blank"
                        class="underline underline-offset-4">{card.text}</a>
                </li>
            {/each}
        </ul>
    </div>
{/if}
