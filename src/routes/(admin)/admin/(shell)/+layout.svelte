<script lang="ts">
    import { page } from '$app/state'
    import { Button } from '#lib/components/ui/button/index.js'
    import type { LayoutProps } from './$types'

    let { children, data }: LayoutProps = $props()

    const navLink = (href: string) =>
        `block rounded-md px-2 py-1.5 hover:bg-muted ${
            page.url.pathname === href ? 'bg-muted font-medium' : 'text-muted-foreground'
        }`
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
            class="w-56 shrink-0 border-r p-4 text-sm">
            <ul class="flex flex-col gap-1">
                <li>
                    <a
                        href="/admin"
                        class={navLink('/admin')}>Home</a>
                </li>
                {#if data.role === 'admin'}
                    <li>
                        <a
                            href="/admin/people"
                            class={navLink('/admin/people')}>People</a>
                    </li>
                {/if}
            </ul>
        </nav>
        <main class="flex-1 p-6">
            {@render children()}
        </main>
    </div>
</div>
