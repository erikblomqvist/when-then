<!-- A translation's state as a badge: missing, machine, reviewed or stale. -->
<script lang="ts">
    import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js'
    import { translationStateLabel, type TranslationState } from '#lib/cards/translation.js'

    let { state, ...rest }: { state: TranslationState; class?: string; 'data-testid'?: string } =
        $props()

    const variants: Record<TranslationState, BadgeVariant> = {
        missing: 'outline',
        machine: 'secondary',
        reviewed: 'default',
        stale: 'destructive',
    }
</script>

<Badge
    variant={variants[state]}
    {...rest}>
    {translationStateLabel[state]}
</Badge>
