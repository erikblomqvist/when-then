<script lang="ts">
    import { Button, Card, Surface, Text } from '#lib'
    import { m } from '#lib/paraglide/messages.js'
</script>

<Surface
    kind="table"
    grain
    class="page">
    <Text role="heading-1">{m.app_name()}</Text>
    <Text role="body">{m.tagline()}</Text>
    <div class="cards">
        <Card
            category="events"
            text="The Berlin Wall falls" />
        <Card
            face="timeline"
            category="people"
            year="1490s"
            text="Columbus reaches America"
            state="locked" />
    </div>
    <Button
        variant="ghost"
        disabled>{m.create_game()}</Button>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.page) {
        min-height: 100vh;
        display: grid;
        gap: 24px;
        align-content: center;
        justify-items: center;
        padding: 32px;
        box-sizing: border-box;
        text-align: center;
    }
    .cards {
        display: flex;
        gap: 24px;
    }
</style>
