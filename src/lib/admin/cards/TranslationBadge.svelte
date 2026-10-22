<!-- A translation's state as a badge: missing, machine, reviewed or stale. `unsaved` draws it
     as an outline with an amber dot inside, for a state the editor shows before it is saved. -->
<script lang="ts">
    import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js'
    import { translationStateLabel, type TranslationState } from '#lib/cards/translation.js'

    let {
        state,
        unsaved = false,
        ...rest
    }: {
        state: TranslationState
        unsaved?: boolean
        class?: string
        'data-testid'?: string
    } = $props()

    const variants: Record<TranslationState, BadgeVariant> = {
        missing: 'outline',
        machine: 'secondary',
        reviewed: 'default',
        stale: 'destructive',
    }
</script>

<Badge
    variant={unsaved ? 'outline' : variants[state]}
    {...rest}>
    {translationStateLabel[state]}
    {#if unsaved}
        <span
            class="size-1.5 rounded-full bg-amber-400"
            aria-hidden="true"></span>
        <span class="sr-only">(unsaved)</span>
    {/if}
</Badge>
