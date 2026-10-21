<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import { page } from '$app/state'
    import type { LayoutProps } from './$types'

    let { children, data }: LayoutProps = $props()

    // `section`: also current on the pages below it (/admin/cards/new, /admin/cards/<id>).
    const isCurrent = (href: string, section = false) =>
        page.url.pathname === href || (section && page.url.pathname.startsWith(`${href}/`))
    const current = (href: string, section = false) =>
        isCurrent(href, section) ? ('page' as const) : undefined
    const navLink = (href: string, section = false) =>
        `block rounded-md px-2 py-1.5 hover:bg-muted ${
            isCurrent(href, section) ? 'bg-muted font-medium' : 'text-muted-foreground'
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
                        class={navLink('/admin')}
                        aria-current={current('/admin')}>Home</a>
                </li>
                <li>
                    <a
                        href="/admin/cards"
                        class={navLink('/admin/cards', true)}
                        aria-current={current('/admin/cards', true)}>Cards</a>
                </li>
                {#if data.role === 'admin'}
                    <li>
                        <a
                            href="/admin/people"
                            class={navLink('/admin/people')}
                            aria-current={current('/admin/people')}>People</a>
                    </li>
                    <li>
                        <a
                            href="/admin/audit"
                            class={navLink('/admin/audit')}
                            aria-current={current('/admin/audit')}>Audit log</a>
                    </li>
                {/if}
            </ul>
        </nav>
        <main class="flex-1 p-6">
            {@render children()}
        </main>
    </div>
</div>
