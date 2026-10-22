<script lang="ts">
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const roles = ['editor', 'admin'] as const
</script>

<svelte:head>
    <title>People · When Then? admin</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">People</h1>
<p class="mt-2 max-w-prose text-muted-foreground">
    Editors write and publish cards. Admins can also manage categories and people. Add someone by
    the email of their Google account; their role attaches when they first sign in.
</p>

{#if form && 'message' in form}
    <p
        role="status"
        class="mt-4 rounded-md border bg-muted px-3 py-2 text-sm">
        {form.message}
    </p>
{:else if form && 'error' in form}
    <p
        role="alert"
        class="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        {form.error}
    </p>
{/if}

<form
    method="POST"
    action="?/add"
    use:enhance
    class="mt-6 flex flex-wrap items-end gap-3">
    <div class="flex flex-col gap-1.5">
        <label
            for="add-email"
            class="text-sm font-medium">
            Email
        </label>
        <Input
            id="add-email"
            name="email"
            type="email"
            required
            autocomplete="off"
            placeholder="name@example.com"
            class="w-72" />
    </div>
    <div class="flex flex-col gap-1.5">
        <label
            for="add-role"
            class="text-sm font-medium">
            Role
        </label>
        <NativeSelect.Root
            id="add-role"
            name="role">
            {#each roles as role (role)}
                <NativeSelect.Option value={role}>{role}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <Button type="submit">Add person</Button>
</form>

<section
    aria-labelledby="people-heading"
    class="mt-10">
    <h2
        id="people-heading"
        class="text-lg font-semibold">
        People with a role
    </h2>
    <Table.Root class="mt-3">
        <Table.Header>
            <Table.Row>
                <Table.Head>Email</Table.Head>
                <Table.Head>Role</Table.Head>
                <Table.Head><span class="sr-only">Actions</span></Table.Head>
            </Table.Row>
        </Table.Header>
        <Table.Body>
            {#each data.people as person (person.userId)}
                {@const locked = person.role === 'admin' && data.onlyAdmin}
                <Table.Row>
                    <Table.Cell>
                        {person.email}
                        {#if person.userId === data.me}
                            <span class="text-muted-foreground">(you)</span>
                        {/if}
                    </Table.Cell>
                    <Table.Cell>
                        <form
                            method="POST"
                            action="?/setRole"
                            use:enhance
                            class="flex items-center gap-2">
                            <input
                                type="hidden"
                                name="userId"
                                value={person.userId} />
                            <input
                                type="hidden"
                                name="email"
                                value={person.email} />
                            <NativeSelect.Root
                                name="role"
                                aria-label="Role for {person.email}"
                                value={person.role}
                                disabled={locked}>
                                {#each roles as role (role)}
                                    <NativeSelect.Option value={role}>{role}</NativeSelect.Option>
                                {/each}
                            </NativeSelect.Root>
                            <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                disabled={locked}>
                                Save
                            </Button>
                        </form>
                    </Table.Cell>
                    <Table.Cell class="text-right">
                        {#if locked}
                            <span class="text-sm text-muted-foreground">The only admin</span>
                        {:else}
                            <form
                                method="POST"
                                action="?/revoke"
                                use:enhance>
                                <input
                                    type="hidden"
                                    name="userId"
                                    value={person.userId} />
                                <input
                                    type="hidden"
                                    name="email"
                                    value={person.email} />
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm">
                                    Revoke
                                </Button>
                            </form>
                        {/if}
                    </Table.Cell>
                </Table.Row>
            {/each}
        </Table.Body>
    </Table.Root>
</section>

<section
    aria-labelledby="invites-heading"
    class="mt-10">
    <h2
        id="invites-heading"
        class="text-lg font-semibold">
        Pending invites
    </h2>
    {#if data.invites.length === 0}
        <p class="mt-3 text-sm text-muted-foreground">No pending invites.</p>
    {:else}
        <Table.Root class="mt-3">
            <Table.Header>
                <Table.Row>
                    <Table.Head>Email</Table.Head>
                    <Table.Head>Role</Table.Head>
                    <Table.Head><span class="sr-only">Actions</span></Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#each data.invites as invite (invite.email)}
                    <Table.Row>
                        <Table.Cell>{invite.email}</Table.Cell>
                        <Table.Cell>
                            <form
                                method="POST"
                                action="?/setInviteRole"
                                use:enhance
                                class="flex items-center gap-2">
                                <input
                                    type="hidden"
                                    name="email"
                                    value={invite.email} />
                                <NativeSelect.Root
                                    name="role"
                                    aria-label="Role for {invite.email}"
                                    value={invite.role}>
                                    {#each roles as role (role)}
                                        <NativeSelect.Option value={role}
                                            >{role}</NativeSelect.Option>
                                    {/each}
                                </NativeSelect.Root>
                                <Button
                                    type="submit"
                                    variant="outline"
                                    size="sm">
                                    Save
                                </Button>
                            </form>
                        </Table.Cell>
                        <Table.Cell class="text-right">
                            <form
                                method="POST"
                                action="?/withdraw"
                                use:enhance>
                                <input
                                    type="hidden"
                                    name="email"
                                    value={invite.email} />
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm">
                                    Withdraw
                                </Button>
                            </form>
                        </Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    {/if}
</section>
