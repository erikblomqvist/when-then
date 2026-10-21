<script lang="ts">
    import type { LayoutProps } from './$types'
    // Admin-only Tailwind + shadcn styles. Admin copy is English-only, without Paraglide (#14).
    import './admin.css'

    let { children }: LayoutProps = $props()
</script>

{@render children()}
