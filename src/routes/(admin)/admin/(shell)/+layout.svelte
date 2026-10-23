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
    <!-- Phone-sized screens get the nav as a scrolling row under the header (#60: adding a card
         from a photo happens on a phone). -->
    <header class="flex h-14 items-center gap-2 border-b px-4 sm:gap-4 md:px-6">
        <span class="font-semibold">When Then? admin</span>
        <span
            class="ml-auto hidden text-sm text-muted-foreground sm:inline"
            data-testid="signed-in-as">
            {data.email} · {data.role}
        </span>
        <!-- Full reload: preloaded admin CSS (Tailwind preflight) is never removed on
             client-side navigation, so it would leak into the game. -->
        <Button
            href="/"
            variant="ghost"
            size="sm"
            class="ml-auto sm:ml-0"
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
    <div class="flex flex-1 flex-col md:flex-row">
        <nav
            aria-label="Admin"
            class="shrink-0 overflow-x-auto border-b px-4 py-2 text-sm md:w-56 md:border-r md:border-b-0 md:p-4">
            <ul class="flex gap-1 whitespace-nowrap md:flex-col">
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
                            href="/admin/categories"
                            class={navLink('/admin/categories', true)}
                            aria-current={current('/admin/categories', true)}>Categories</a>
                    </li>
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
        <!-- Room under every page (pb-40), so its end can be scrolled up from the window's edge;
             inside main, so the nav's line beside it still runs to the bottom. -->
        <main class="min-w-0 flex-1 p-4 pb-40 md:p-6 md:pb-40">
            {@render children()}
        </main>
    </div>
</div>
