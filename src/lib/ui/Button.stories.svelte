<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import { ArrowDownToLine, ChevronLeft, Lock, Users, X } from '@lucide/svelte'
    import type { ComponentProps } from 'svelte'
    import ActionButton from './ActionButton.svelte'
    import Button from './Button.svelte'
    import IconButton from './IconButton.svelte'

    const { Story } = defineMeta({
        title: 'Controls/Button',
        component: Button,
        tags: ['autodocs'],
        args: { variant: 'primary', size: 'md', block: false, disabled: false },
        argTypes: {
            variant: { control: 'radio', options: ['primary', 'ghost', 'ink'] },
            size: { control: 'radio', options: ['md', 'lg'] },
        },
    })
</script>

{#snippet template(args: Omit<ComponentProps<typeof Button>, 'children'>)}
    <Button {...args}>Create game</Button>
{/snippet}

<Story
    name="Primary"
    {template} />
<Story
    name="Ghost"
    args={{ variant: 'ghost' }}
    {template} />
<Story
    name="Ink"
    args={{ variant: 'ink' }}
    {template} />
<Story
    name="Large"
    args={{ size: 'lg' }}
    {template} />
<Story
    name="Block"
    args={{ block: true, size: 'lg' }}
    {template} />
<Story
    name="Disabled"
    args={{ disabled: true }}
    {template} />

<Story
    name="With icon"
    asChild>
    <Button variant="ghost"><ChevronLeft /> Back</Button>
</Story>

<!-- Ghost becomes an outline and ink turns brown on paper surfaces. -->
<Story
    name="On paper"
    parameters={{ surface: 'paper' }}
    asChild>
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <Button>Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="ink">Ink</Button>
    </div>
</Story>

<Story
    name="Icon buttons"
    asChild>
    <div style="display: flex; gap: 12px;">
        <IconButton label="Back"><ChevronLeft /></IconButton>
        <IconButton label="Close"><X /></IconButton>
        <IconButton
            label="View timelines"
            variant="ink"><Users /></IconButton>
    </div>
</Story>

<!-- The two game actions. "Lock in" ends the turn and locks the unlocked cards. -->
<Story
    name="Action buttons"
    asChild>
    <div style="display: flex; gap: 24px; align-items: center;">
        <ActionButton label="Place"><ArrowDownToLine /></ActionButton>
        <ActionButton
            label="Lock in"
            count="2 cards"><Lock /></ActionButton>
        <ActionButton
            label="Lock in"
            disabled><Lock /></ActionButton>
    </div>
</Story>
