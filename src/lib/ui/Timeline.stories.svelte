<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import Card from './Card.svelte'
    import CardBack from './CardBack.svelte'
    import Timeline from './Timeline.svelte'
    import TimelineGap from './TimelineGap.svelte'
    import TimelineSlot from './TimelineSlot.svelte'
    import { sampleCategories } from './types'

    const { Story } = defineMeta({
        title: 'Timeline/Timeline',
        component: Timeline,
        tags: ['autodocs'],
    })
</script>

<!-- A timeline at the start of a game: only the anchor year. -->
<Story
    name="Only the anchor"
    asChild>
    <Timeline>
        <TimelineSlot
            ><Card
                face="timeline"
                category={sampleCategories.events}
                year={1969}
                state="anchor" /></TimelineSlot>
    </Timeline>
</Story>

<!-- Mid-turn: two locked cards, one unlocked card and the insertion gap open between neighbours. -->
<Story
    name="Placing a card"
    asChild>
    <Timeline>
        <TimelineSlot>
            <Card
                face="timeline"
                category={sampleCategories.people}
                year="1490s"
                text="Columbus reaches America"
                state="locked" />
        </TimelineSlot>
        <TimelineSlot
            ><Card
                face="timeline"
                category={sampleCategories.events}
                year={1789}
                state="anchor" /></TimelineSlot>
        <TimelineGap />
        <TimelineSlot>
            <Card
                face="timeline"
                category={sampleCategories.inventions}
                year={1876}
                text="The telephone is patented"
                state="unlocked"
                wobble={1}
                nudged />
        </TimelineSlot>
        <TimelineGap
            selected
            onselect={() => {}} />
        <TimelineSlot>
            <Card
                face="timeline"
                category={sampleCategories.events}
                year={1989}
                text="The Berlin Wall falls"
                state="locked"
                nudged />
        </TimelineSlot>
        <TimelineGap />
    </Timeline>
</Story>

<Story
    name="With the deck"
    asChild>
    <div style="display: flex; gap: 24px; align-items: center;">
        <CardBack size="md" />
        <Timeline>
            <TimelineSlot
                ><Card
                    face="timeline"
                    category={sampleCategories.places}
                    year={1952}
                    state="anchor" /></TimelineSlot>
            <TimelineSlot>
                <Card
                    face="timeline"
                    category={sampleCategories.events}
                    year={2001}
                    text="Wikipedia launches"
                    state="locked" />
            </TimelineSlot>
        </Timeline>
    </div>
</Story>
