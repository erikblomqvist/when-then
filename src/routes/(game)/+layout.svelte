<script lang="ts">
    import type { LayoutProps } from './$types'
    // Game styles load only in this group. Tailwind's theme variables share names with
    // tokens.css (--radius-md, --color-white, ...), so they must never meet on one page.
    import '#lib/styles/tokens.css'
    import '#lib/styles/components.css'

    let { children }: LayoutProps = $props()
</script>

{@render children()}
