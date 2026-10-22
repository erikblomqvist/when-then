<script lang="ts">
    import type { LayoutProps } from './$types'
    // Game styles load only in this group. Tailwind's theme variables share names with
    // tokens.css (--radius-md, --color-white, ...), so they must never meet on one page.
    import '#lib/styles/tokens.css'
    import '#lib/styles/components.css'

    let { children }: LayoutProps = $props()

    // A hydration signal for e2e tests (`#lib/testing/e2e-hydration.ts`), as in the admin.
    $effect(() => {
        document.documentElement.dataset.hydrated = ''
        return () => delete document.documentElement.dataset.hydrated
    })
</script>

{@render children()}
