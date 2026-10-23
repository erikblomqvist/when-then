<script lang="ts">
    import { Button, Card, CodeInput, sampleCategories, Surface, Text } from '#lib'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<Surface
    kind="table"
    grain
    class="home">
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
    <!-- Find my seat: the way back while the phone's seat is in a game that hasn't finished. -->
    {#if data.seat}
        <Button
            size="lg"
            href="/game/{data.seat.code}">{m.back_to_game({ code: data.seat.code })}</Button>
    {/if}
    <Button
        size="lg"
        variant={data.seat ? 'ghost' : 'primary'}
        href="/new">{m.create_game()}</Button>
    <!-- A plain GET form, so a typed code joins even before the page hydrates. -->
    <form
        class="join"
        method="get"
        action="/join">
        <CodeInput
            name="code"
            label={m.game_code()} />
        <Button
            type="submit"
            variant="ghost"
            size="lg">{m.join_game()}</Button>
    </form>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.home) {
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
    .join {
        display: grid;
        gap: 16px;
        justify-items: center;
    }
</style>
