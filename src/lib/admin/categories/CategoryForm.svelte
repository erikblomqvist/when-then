<!-- The category form of /admin/categories/new and /admin/categories/[id]: names per locale,
     an icon from the curated set and a colour from the palette. Posts to the page's `?/save`. -->
<script lang="ts">
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import type { CategoryFormErrors, CategoryFormValues } from '#lib/categories/category-form.js'
    import {
        categoryColours,
        categoryIcons,
        isCategoryColour,
        isCategoryIcon,
    } from '#lib/categories/look.js'
    import CategoryIcon from '#lib/ui/CategoryIcon.svelte'
    import CategoryBadge from './CategoryBadge.svelte'

    type Props = {
        values: CategoryFormValues
        errors?: CategoryFormErrors
        /** A refusal from the database (a duplicate English name, say). */
        error?: string
    }

    let { values: initial, errors = {}, error }: Props = $props()

    // svelte-ignore state_referenced_locally -- the form owns its values once it is shown
    let values = $state({ ...initial })

    const names = [
        { field: 'name_en', label: 'English name', hint: 'Required. CSV import matches on it.' },
        { field: 'name_sv', label: 'Swedish name', hint: 'Optional.' },
        { field: 'name_nb', label: 'Norwegian name', hint: 'Optional.' },
    ] as const

    const tile =
        'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm has-checked:border-primary has-checked:bg-muted has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50'
</script>

{#snippet fieldError(name: keyof CategoryFormValues)}
    {#if errors[name]}
        <p
            id="{name}-error"
            class="text-sm text-destructive">
            {errors[name]}
        </p>
    {/if}
{/snippet}

<form
    method="POST"
    action="?/save"
    use:enhance
    class="flex max-w-3xl flex-col gap-8">
    {#if error}
        <p
            role="alert"
            class="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
            {error}
        </p>
    {/if}

    <div class="grid gap-4 sm:grid-cols-3">
        {#each names as { field, label, hint } (field)}
            <div class="flex flex-col gap-1.5">
                <Label for={field}>{label}</Label>
                <Input
                    id={field}
                    name={field}
                    bind:value={values[field]}
                    autocomplete="off"
                    aria-invalid={errors[field] ? 'true' : undefined}
                    aria-describedby={errors[field] ? `${field}-error` : `${field}-hint`} />
                <p
                    id="{field}-hint"
                    class="text-xs text-muted-foreground">
                    {hint}
                </p>
                {@render fieldError(field)}
            </div>
        {/each}
    </div>

    <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">Icon</legend>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each categoryIcons as icon (icon)}
                <label class={tile}>
                    <input
                        type="radio"
                        name="icon"
                        value={icon}
                        bind:group={values.icon}
                        class="accent-primary" />
                    <span class="[&_svg]:size-4"><CategoryIcon {icon} /></span>
                    {icon}
                </label>
            {/each}
        </div>
        {@render fieldError('icon')}
    </fieldset>

    <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">Colour</legend>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each categoryColours as colour (colour)}
                <label class={tile}>
                    <input
                        type="radio"
                        name="colour"
                        value={colour}
                        bind:group={values.colour}
                        class="accent-primary" />
                    <span
                        class="cat-{colour} size-4 rounded-full bg-(--cat)"
                        aria-hidden="true"></span>
                    {colour}
                </label>
            {/each}
        </div>
        {@render fieldError('colour')}
    </fieldset>

    <div class="flex items-center gap-4">
        <Button type="submit">Save</Button>
        {#if isCategoryIcon(values.icon) && isCategoryColour(values.colour)}
            <span class="flex items-center gap-2 text-sm text-muted-foreground">
                Preview
                <CategoryBadge
                    name={values.name_en || 'New category'}
                    icon={values.icon}
                    colour={values.colour} />
            </span>
        {/if}
        <Button
            href="/admin/categories"
            variant="ghost">
            Cancel
        </Button>
    </div>
</form>
