<script lang="ts">
    import { page } from '$app/state'
    import { Button } from '#lib/components/ui/button/index.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    // Keep `redirectTo` on the action URL, so Google sign-in returns to where you were going.
    const action = $derived(`?/google${page.url.search ? `&${page.url.search.slice(1)}` : ''}`)
</script>

<svelte:head>
    <title>Sign in · When Then? admin</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
    <div class="w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <h1 class="text-2xl font-semibold tracking-tight">Sign in to the admin</h1>
        <p class="mt-2 text-sm text-muted-foreground">
            For editors and admins of When Then? Sign in with the Google account you were invited
            with.
        </p>
        {#if data.failed || form?.failed}
            <p
                role="alert"
                class="mt-4 text-sm text-destructive">
                Google sign-in did not complete. Please try again.
            </p>
        {/if}
        <form
            method="POST"
            {action}
            class="mt-6">
            <Button
                type="submit"
                class="w-full">
                Sign in with Google
            </Button>
        </form>
    </div>
</main>
