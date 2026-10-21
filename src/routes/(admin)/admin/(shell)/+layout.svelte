<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import type { LayoutProps } from './$types'

    let { children, data }: LayoutProps = $props()
</script>

<div class="flex min-h-svh flex-col">
    <header class="flex h-14 items-center gap-4 border-b px-6">
        <span class="font-semibold">When Then? admin</span>
        <span
            class="ml-auto text-sm text-muted-foreground"
            data-testid="signed-in-as">
            {data.email} · {data.role}
        </span>
        <!-- Full reload: preloaded admin CSS (Tailwind preflight) is never removed on
             client-side navigation, so it would leak into the game. -->
        <Button
            href="/"
            variant="ghost"
            size="sm"
            data-sveltekit-reload>
            Back to the game
        </Button>
        <form
            method="POST"
            action="/admin/sign-out">
            <Button
                type="submit"
                variant="outline"
                size="sm">
                Sign out
            </Button>
        </form>
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
