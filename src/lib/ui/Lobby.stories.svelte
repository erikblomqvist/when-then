<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import { playerIcons } from '../game/player'
    import PlayerIconPicker from './PlayerIconPicker.svelte'
    import QrCode from './QrCode.svelte'
    import Surface from './Surface.svelte'

    const { Story } = defineMeta({
        title: 'Players/Lobby',
        component: PlayerIconPicker,
        tags: ['autodocs'],
    })

    // Stories show the icon names as they are; the app passes translated ones.
    const labels = Object.fromEntries(playerIcons.map((icon) => [icon, icon])) as Record<
        (typeof playerIcons)[number],
        string
    >
</script>

<!-- Creating or joining a game: one icon per player, from the curated set. -->
<Story
    name="Icon picker"
    asChild>
    <Surface
        kind="sheet"
        style="max-width: 360px;">
        <PlayerIconPicker
            name="icon"
            legend="Pick an icon"
            {labels}
            value="cat" />
    </Surface>
</Story>

<!-- The join link as a QR code, for friends at the table to scan. -->
<Story
    name="Join QR code"
    asChild>
    <QrCode
        value="https://when-then-gamma.vercel.app/join/KXRM"
        label="QR code to join the game" />
</Story>
