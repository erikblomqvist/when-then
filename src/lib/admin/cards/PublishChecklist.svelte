<!--
    What a card needs before Publish, as a read-only checklist under the card editor's actions
    (`publishChecklist`): a heading, then every requirement in a framed box from the start, each
    ticked off once the form meets it, with a short note where one needs it. Below a line, the
    things worth adding that aren't required (`publishSuggestions`), only while missing. Publish
    points at it with `aria-describedby` while something is still open.
-->
<script lang="ts">
    import CircleIcon from '@lucide/svelte/icons/circle'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed'
    import type { PublishCheck, PublishSuggestion } from '#lib/cards/publish-checklist.js'

    type Props = { id: string; checks: PublishCheck[]; suggestions: PublishSuggestion[] }

    let { id, checks, suggestions }: Props = $props()
</script>

<section
    {id}
    aria-labelledby="{id}-heading"
    class="flex flex-col gap-2">
    <h2
        id="{id}-heading"
        class="font-medium">
        Required to publish
    </h2>
    <div class="flex flex-col gap-3 rounded-lg border p-3">
        <ul class="flex flex-col gap-1.5">
            {#each checks as check (check.key)}
                <li class="flex items-start gap-2">
                    <span class="flex h-5 shrink-0 items-center">
                        {#if check.done}
                            <CircleCheckIcon
                                class="size-4 text-tone-constructive"
                                aria-hidden="true" />
                        {:else}
                            <CircleIcon
                                class="size-4 text-muted-foreground/60"
                                aria-hidden="true" />
                        {/if}
                    </span>
                    <span class="flex min-w-0 flex-col">
                        <span class={check.done ? 'text-muted-foreground' : ''}>
                            <span class="sr-only">{check.done ? 'Done:' : 'To do:'}</span>
                            {check.label}
                        </span>
                        {#if check.detail}
                            <span class="text-xs break-words text-muted-foreground">
                                {check.detail}
                            </span>
                        {/if}
                    </span>
                </li>
            {/each}
        </ul>
        {#if suggestions.length > 0}
            <div
                role="group"
                aria-labelledby="{id}-suggestions"
                class="flex flex-col gap-1.5 border-t pt-3">
                <h3
                    id="{id}-suggestions"
                    class="text-xs font-medium text-muted-foreground">
                    Also worth adding
                </h3>
                <ul class="flex flex-col gap-1.5">
                    {#each suggestions as suggestion (suggestion.key)}
                        <li class="flex items-start gap-2">
                            <span class="flex h-5 shrink-0 items-center">
                                <CircleDashedIcon
                                    class="size-4 text-muted-foreground/60"
                                    aria-hidden="true" />
                            </span>
                            <span class="flex min-w-0 flex-col">
                                <span>{suggestion.label}</span>
                                {#if suggestion.detail}
                                    <span class="text-xs break-words text-muted-foreground">
                                        {suggestion.detail}
                                    </span>
                                {/if}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
    </div>
</section>
