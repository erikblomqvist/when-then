<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import Stamp from './Stamp.svelte'

    const { Story } = defineMeta({
        title: 'Cards/Stamp',
        component: Stamp,
        tags: ['autodocs'],
        parameters: { surface: 'paper' },
        args: { variant: 'locked', animateIn: false },
        argTypes: { variant: { control: 'radio', options: ['locked', 'unlocked'] } },
    })
</script>

{#snippet frame(args: { variant?: 'locked' | 'unlocked'; animateIn?: boolean })}
    <!-- The stamp positions itself at the top centre of a timeline face. -->
    <div style="position: relative; width: 160px; height: 60px; font-size: 15px;">
        <Stamp {...args} />
    </div>
{/snippet}

<Story
    name="Locked"
    template={frame} />
<Story
    name="Unlocked"
    args={{ variant: 'unlocked' }}
    template={frame} />
<Story
    name="Stamp in"
    args={{ animateIn: true }}
    template={frame} />
