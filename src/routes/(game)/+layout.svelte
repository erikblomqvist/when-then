<script lang="ts">
    import type { LayoutProps } from './$types'
    // Game styles load only in this group. Tailwind's theme variables share names with
    // tokens.css (--radius-md, --color-white, ...), so they must never meet on one page.
    import '#lib/styles/tokens.css'
    import '#lib/styles/components.css'
    import { Button, CornerMenu, Text } from '#lib'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js'

    let { data, children }: LayoutProps = $props()

    // A hydration signal for e2e tests (`#lib/testing/e2e-hydration.ts`), as in the admin.
    $effect(() => {
        document.documentElement.dataset.hydrated = ''
        return () => delete document.documentElement.dataset.hydrated
    })

    // No install prompt while the phone holds a seat: on iOS the installed app doesn't share
    // storage with Safari, so moving to it would lose the seat.
    $effect(() => {
        const holdBack = (event: Event) => {
            if (data.seat) event.preventDefault()
        }
        window.addEventListener('beforeinstallprompt', holdBack)
        return () => window.removeEventListener('beforeinstallprompt', holdBack)
    })

    // Each language in its own words, so a player can find theirs from any language.
    const languageNames: Record<Locale, string> = { en: 'English', sv: 'Svenska', nb: 'Norsk' }
    const locale = getLocale()
</script>

<CornerMenu label={m.menu()}>
    <Text role="caption">{m.app_language()}</Text>
    <!-- Switching sets the cookie and reloads the page, which finds the seat again. -->
    {#each locales as language (language)}
        <Button
            variant={language === locale ? 'ink' : 'ghost'}
            block
            lang={language}
            aria-pressed={language === locale}
            onclick={() => setLocale(language)}>{languageNames[language]}</Button>
    {/each}
</CornerMenu>

{@render children()}
