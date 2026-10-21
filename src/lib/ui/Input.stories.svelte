<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import CodeInput from './CodeInput.svelte'
    import Input from './Input.svelte'

    const { Story } = defineMeta({
        title: 'Controls/Inputs',
        component: Input,
        tags: ['autodocs'],
    })
</script>

<Story
    name="Text field"
    asChild>
    <div style="max-width: 360px;">
        <Input
            placeholder="Your name"
            aria-label="Your name" />
    </div>
</Story>

<!-- Entering the play code to join a game. -->
<Story
    name="Play code entry"
    asChild>
    <div style="max-width: 360px;">
        <CodeInput value="K7" />
    </div>
</Story>

<!-- Showing the play code in the lobby, on paper. -->
<Story
    name="Play code display"
    parameters={{ surface: 'paper' }}
    asChild>
    <div style="max-width: 240px;">
        <CodeInput
            value="K7QD"
            readonly />
    </div>
</Story>
