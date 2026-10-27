<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import SeatingEditor from './SeatingEditor.svelte'
    import SeatingTable from './SeatingTable.svelte'

    const { Story } = defineMeta({
        title: 'Players/Seating',
        component: SeatingEditor,
        tags: ['autodocs'],
    })

    const names = [
        'Astrid',
        'Bjørn',
        'Cecilia',
        'Dag',
        'Elin',
        'Farid',
        'Greta',
        'Hugo',
        'Ines',
        'Jon',
    ]
    const players = names.map((name) => ({ id: name.toLowerCase(), name }))
    // Join order, the editor's default starting seating.
    const joined = (n: number) => players.slice(0, n).map((p) => p.id)
</script>

<!-- The host's editor, starting from join order. Drag onto a player to swap, between two to move,
     or tap two players to swap them. -->
<Story
    name="Editor"
    args={{ players: players.slice(0, 6), seating: joined(6), anchor: 'astrid' }} />

<Story
    name="Editor, 10 players"
    args={{ players, seating: joined(10), anchor: 'astrid' }} />

<!-- Three players can only sit two ways round, so there is just Reverse. -->
<Story
    name="Editor, 3 players"
    args={{ players: players.slice(0, 3), seating: joined(3), anchor: 'astrid' }} />

<Story
    name="Editor, 2 players"
    args={{ players: players.slice(0, 2), seating: joined(2), anchor: 'astrid' }} />

<!-- What every other phone shows: the same seating, drawn from the viewer's own seat. -->
<Story
    name="Table from your seat"
    asChild>
    <div style="display: flex; flex-wrap: wrap; gap: 32px;">
        {#each ['astrid', 'cecilia', 'elin'] as me (me)}
            <SeatingTable
                players={players.slice(0, 6)}
                seating={joined(6)}
                {me}>Turns go<br />to the left</SeatingTable>
        {/each}
    </div>
</Story>
