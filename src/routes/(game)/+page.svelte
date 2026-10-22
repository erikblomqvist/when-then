<script lang="ts">
    import { Card, sampleCategories, Surface, Text } from '#lib'
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
            category={sampleCategories.events}
            text="The Berlin Wall falls" />
        <Card
            face="timeline"
            category={sampleCategories.people}
            year="1490s"
            text="Columbus reaches America"
            state="locked" />
    </div>
    <a
        class="ui-button ui-button--lg"
        href="/new">{m.create_game()}</a>
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
