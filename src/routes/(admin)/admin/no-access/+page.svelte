<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<svelte:head>
    <title>No access · When Then? admin</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
    <div class="w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <h1 class="text-2xl font-semibold tracking-tight">You don't have access yet</h1>
        <p class="mt-2 text-sm text-muted-foreground">
            You're signed in as <strong class="text-foreground">{data.email}</strong>, but this
            account isn't an editor or admin. Ask an admin to add you, then sign in again.
        </p>
        <div class="mt-6 flex gap-2">
            <form
                method="POST"
                action="/admin/sign-out">
                <Button
                    type="submit"
                    variant="outline">
                    Sign out
                </Button>
            </form>
            <Button
                href="/"
                variant="ghost"
                data-sveltekit-reload>
                Back to the game
            </Button>
        </div>
    </div>
</main>
