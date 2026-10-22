<script lang="ts">
    import type { LayoutProps } from './$types'
    // Admin-only Tailwind + shadcn styles. Admin copy is English-only, without Paraglide (#14).
    import './admin.css'

    let { children }: LayoutProps = $props()

    // A hydration signal for e2e tests (`#lib/testing/e2e-hydration.ts`): before it, a click or
    // select on the server-rendered page can do nothing.
    $effect(() => {
        document.documentElement.dataset.hydrated = ''
        return () => delete document.documentElement.dataset.hydrated
    })
</script>

{@render children()}
