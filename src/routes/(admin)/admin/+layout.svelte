<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import type { LayoutProps } from './$types'
    // Admin-only Tailwind + shadcn styles. Admin copy is English-only, without Paraglide (#14).
    import './admin.css'

    let { children }: LayoutProps = $props()
</script>

<div class="flex min-h-svh flex-col">
    <header class="flex h-14 items-center gap-4 border-b px-6">
        <span class="font-semibold">When Then? admin</span>
        <!-- Full reload: preloaded admin CSS (Tailwind preflight) is never removed on
             client-side navigation, so it would leak into the game. -->
        <Button
            href="/"
            variant="ghost"
            size="sm"
            class="ml-auto"
            data-sveltekit-reload>
            Back to the game
        </Button>
    </header>
    <div class="flex flex-1">
        <nav
            aria-label="Admin"
            class="w-56 shrink-0 border-r p-4 text-sm text-muted-foreground">
            <p>Cards, categories and people will appear here.</p>
        </nav>
        <main class="flex-1 p-6">
            {@render children()}
        </main>
    </div>
</div>
