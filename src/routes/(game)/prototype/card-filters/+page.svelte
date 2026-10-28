<script lang="ts">
    // PROTOTYPE (#100), throwaway: static mockups of the host setting card filters per player
    // (difficulty, oldest cards, categories, insider cards) over one shared deck, switched with
    // `?view=`, and `?who=astrid` for a veteran's filters. Made-up data, nothing saved, so its
    // words aren't translated.
    import CheckIcon from '@lucide/svelte/icons/check'
    import SlidersIcon from '@lucide/svelte/icons/sliders-horizontal'
    import TrendingUpIcon from '@lucide/svelte/icons/trending-up'
    import { page } from '$app/state'
    import {
        Button,
        Card,
        CategoryDot,
        Notepad,
        PlayerIcon,
        PlayerRow,
        Surface,
        Tabs,
        Text,
        type CategoryLook,
    } from '#lib'

    const view = $derived(page.url.searchParams.get('view') ?? 'host')
    const countries = [
        { code: 'SE', name: 'Sweden' },
        { code: 'NO', name: 'Norway' },
    ]

    const categories = [
        { name: 'Events', icon: 'zap', colour: 'red' },
        { name: 'People', icon: 'user', colour: 'blue' },
        { name: 'Inventions', icon: 'lightbulb', colour: 'amber' },
        { name: 'Places', icon: 'map-pin', colour: 'green' },
        { name: 'Sports', icon: 'trophy', colour: 'orange' },
        { name: 'Music', icon: 'music', colour: 'purple' },
        { name: 'Wars', icon: 'swords', colour: 'teal' },
    ] as const satisfies CategoryLook[]

    const levels = ['Easy', 'Medium', 'Hard', 'Obscure']

    // Ella, a child, gets easy cards from 1900 and no Sports or Wars; Astrid, a veteran, gets
    // no easy cards; Dag didn't grow up in Sweden. Cecilia has no filters. Difficulty is a
    // range of levels, from and to, both counted from 1.
    const filterSets = {
        ella: {
            name: 'Ella',
            icon: 'rabbit',
            from: 1,
            to: 2,
            off: ['Sports', 'Wars'],
            leftOut: ['NO'],
            era: '1900',
        },
        astrid: { name: 'Astrid', icon: 'cat', from: 2, to: 4, off: [], leftOut: [], era: 'any' },
    } as const
    const who = $derived(
        filterSets[page.url.searchParams.get('who') === 'astrid' ? 'astrid' : 'ella'],
    )

    const players = [
        { name: 'Astrid', icon: 'cat', role: 'Host', filters: 'Medium to Obscure' },
        { name: 'Dag', icon: 'fish', role: undefined, filters: 'No Swedish insider cards' },
        {
            name: 'Ella',
            icon: 'rabbit',
            role: undefined,
            filters: 'Easy to Medium · from 1900 · no Sports, Wars · no Norwegian insider cards',
        },
        { name: 'Cecilia', icon: 'bird', role: undefined, filters: null },
    ] as const
</script>

<svelte:head>
    <title>Prototype: card filters · When Then?</title>
</svelte:head>

{#snippet pips(count: number)}
    <span
        class="pips"
        aria-hidden="true">
        {#each [1, 2, 3, 4] as level (level)}
            <span class={['pip', level <= count && 'pip--on']}></span>
        {/each}
    </span>
{/snippet}

{#snippet notepad(you: string)}
    <Notepad
        title="Players"
        meta="4 of 10">
        {#each players as player, i (player.name)}
            <PlayerRow
                number={i + 1}
                name={player.name}
                icon={player.icon}
                role={player.name === you ? (player.role ?? 'You') : player.role}>
                {#snippet action()}
                    {#if player.filters}
                        <span
                            class="has-filters"
                            title="Has card filters"><SlidersIcon /></span>
                    {/if}
                {/snippet}
            </PlayerRow>
        {/each}
    </Notepad>
{/snippet}

<Surface
    kind="table"
    grain
    class="proto-page">
    {#if view === 'host'}
        <div class="column">
            <Text role="heading-1">Lobby</Text>
            {@render notepad('Astrid')}

            <Surface
                kind="sheet"
                class="filters">
                <Text role="heading-2">Card filters</Text>
                <p class="note">
                    Cards a player won’t be dealt. Agree on them together. Everyone else can still
                    get those cards.
                </p>
                <ul class="people">
                    {#each players as player (player.name)}
                        <li>
                            <span class="person-icon"><PlayerIcon icon={player.icon} /></span>
                            <span class="person">
                                <b>{player.name}</b>
                                <span class={['what', !player.filters && 'what--none']}
                                    >{player.filters ?? 'No filters'}</span>
                            </span>
                            <Button variant="ghost">{player.filters ? 'Change' : 'Add'}</Button>
                        </li>
                    {/each}
                </ul>
            </Surface>
        </div>
    {:else if view === 'edit'}
        <div class="column top-space">
            <Surface
                kind="sheet"
                class="chooser">
                <div class="head">
                    <span class="head-icon"><PlayerIcon icon={who.icon} /></span>
                    <Text role="heading-2">Filters for {who.name}</Text>
                </div>

                <section>
                    <div class="section-head">
                        <span class="ui-caption">Difficulty</span>
                        <span class="hint"
                            >Levels that are off are filtered out. Easy is what most people know;
                            Obscure is trivia-night material.</span>
                    </div>
                    <div class="levels">
                        {#each levels as level, i (level)}
                            {@const on = i + 1 >= who.from && i + 1 <= who.to}
                            <button
                                type="button"
                                class={['tile', on && 'tile--on']}
                                aria-pressed={on}>
                                {@render pips(i + 1)}
                                <span class="tile-name">{level}</span>
                            </button>
                        {/each}
                    </div>
                </section>

                <section>
                    <div class="section-head">
                        <span class="ui-caption">Oldest cards</span>
                        <span class="hint">Cards from earlier years are filtered out.</span>
                    </div>
                    <Tabs
                        label="Oldest cards"
                        tabs={[
                            { id: 'any', label: 'Any time' },
                            { id: '1500', label: 'From 1500' },
                            { id: '1900', label: 'From 1900' },
                        ]}
                        selected={who.era} />
                </section>

                <section>
                    <div class="section-head">
                        <span class="ui-caption">Categories</span>
                        <span class="hint">Categories that are off are filtered out.</span>
                    </div>
                    <div class="cats">
                        {#each categories as category (category.name)}
                            {@const on = !(who.off as readonly string[]).includes(category.name)}
                            <button
                                type="button"
                                class={['cat', on && 'cat--on', `cat-${category.colour}`]}
                                aria-pressed={on}>
                                <CategoryDot {category} />
                                <span>{category.name}</span>
                                <span class="check">
                                    {#if on}<CheckIcon />{/if}
                                </span>
                            </button>
                        {/each}
                    </div>
                </section>

                <section>
                    <div class="section-head">
                        <span class="ui-caption">Insider cards</span>
                        <span class="hint"
                            >Cards you almost had to grow up in the country to know. Not every card
                            about the country is one.</span>
                    </div>
                    <div class="levels">
                        {#each countries as country (country.code)}
                            {@const on = !(who.leftOut as readonly string[]).includes(country.code)}
                            <button
                                type="button"
                                class={['tile', on && 'tile--on']}
                                aria-pressed={on}>
                                <span class="tile-name">{country.name}</span>
                            </button>
                        {/each}
                    </div>
                </section>

                <div class="loosen">
                    <TrendingUpIcon />
                    <p>
                        When every card that matches {who.name}’s filters has been dealt, the
                        filters loosen one step at a time: the nearest difficulty level first, then
                        oldest cards, then categories and insider cards come back.
                    </p>
                </div>

                <Button
                    size="lg"
                    block>Done</Button>
            </Surface>
        </div>
    {:else if view === 'player'}
        <div class="column">
            <Text role="heading-1">Lobby</Text>
            {@render notepad('Ella')}
            <Surface
                kind="sheet"
                class="settings">
                <Text
                    role="heading-2"
                    class="settings-title">Settings</Text>
                <dl class="settings-list">
                    <div>
                        <dt class="ui-caption">Target score</dt>
                        <dd>10</dd>
                    </div>
                    <div>
                        <dt class="ui-caption">Exact-year rule</dt>
                        <dd>Off</dd>
                    </div>
                    <div>
                        <dt class="ui-caption">Card language</dt>
                        <dd>English</dd>
                    </div>
                </dl>
                <div class="yours">
                    <span class="ui-caption">Your card filters</span>
                    <ul class="summary">
                        <li>{@render pips(2)} Easy to Medium</li>
                        <li><span class="era">1900</span> From 1900</li>
                        <li>
                            <span class="dots">
                                <CategoryDot category={categories[4]} />
                                <CategoryDot category={categories[6]} />
                            </span>
                            No Sports or Wars
                        </li>
                        <li><span class="era">NO</span> No Norwegian insider cards</li>
                    </ul>
                </div>
                <p class="note">Only the host can change these.</p>
            </Surface>
        </div>
    {:else if view === 'loosened'}
        <div class="column play">
            <div class="turn">
                <span class="who"><PlayerIcon icon="rabbit" /> Ella places · You read</span>
                <span class="to">to 10</span>
            </div>
            <div class="loosened">
                <TrendingUpIcon />
                <span
                    ><b>Hard cards now match Ella’s filters.</b> Every card that matched the original
                    filters has been dealt.</span>
            </div>
            <Text
                role="caption"
                class="on-table">Category draw · People</Text>
            <div class="card-wrap">
                <Card
                    category={categories[1]}
                    text="The town elects its first mayor"
                    size="xl" />
            </div>
            <Surface
                kind="sheet"
                class="reader-sheet">
                <Text role="heading-2">Read it aloud to Ella</Text>
                <p class="note">
                    Ella’s filters now: Easy to Hard · from 1900 · no Sports, Wars · no Norwegian
                    insider cards.
                </p>
            </Surface>
        </div>
    {:else if view === 'steal'}
        <div class="column play">
            <div class="turn">
                <span class="who"><PlayerIcon icon="cat" /> Astrid missed</span>
                <span class="to">to 10</span>
            </div>
            <div class="card-wrap">
                <Card
                    face="sleeve"
                    category={categories[0]} />
            </div>
            <div class="outside">
                <span class="outside-label">Filtered out for you</span>
                {@render pips(3)}
                <span>Hard</span>
            </div>
            <Surface
                kind="sheet"
                class="reader-sheet">
                <Text role="heading-2">Your chance to steal</Text>
                <p class="note">
                    You’re not dealt cards like this, but anyone can steal any card. Have a go!
                </p>
                <ol class="order">
                    <li class="done">
                        <PlayerIcon icon="fish" /> Dag
                        <span class="flag">filtered</span>
                        <span class="state">missed</span>
                    </li>
                    <li class="now">
                        <PlayerIcon icon="rabbit" /> You
                        <span class="flag">filtered</span>
                        <span class="state">trying now</span>
                    </li>
                    <li>
                        <PlayerIcon icon="bird" /> Cecilia <span class="state">next</span>
                    </li>
                </ol>
                <Button
                    size="lg"
                    block>Place it on your timeline</Button>
            </Surface>
        </div>
    {/if}
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.proto-page) {
        min-height: 100vh;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    .column {
        display: grid;
        gap: var(--space-9);
        width: min(100%, 420px);
        margin: 0 auto;
        text-align: center;
    }
    .top-space {
        padding-top: 64px;
    }
    .column :global(.ui-notepad),
    .column :global(.ui-sheet) {
        text-align: start;
    }
    .has-filters {
        display: inline-flex;
        color: var(--text-on-paper-secondary);
    }
    .has-filters :global(svg) {
        width: 20px;
        height: 20px;
    }
    .pips {
        display: inline-flex;
        gap: 3px;
        vertical-align: middle;
    }
    .pip {
        width: 7px;
        height: 7px;
        border-radius: var(--radius-round);
        border: 1.5px solid currentColor;
        box-sizing: border-box;
    }
    .pip--on {
        background: currentColor;
    }
    .note,
    .hint {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        color: var(--text-on-paper-secondary);
    }
    .hint {
        font-size: var(--font-size-13);
    }
    .people {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .people li {
        display: flex;
        align-items: center;
        gap: var(--space-5);
        padding: var(--space-5) 0;
        border-top: 1px solid var(--border-on-paper);
    }
    .person-icon,
    .head-icon {
        display: inline-flex;
        flex: none;
    }
    .person-icon :global(svg) {
        width: 26px;
        height: 26px;
    }
    .person {
        display: grid;
        gap: 2px;
        flex: 1;
        min-width: 0;
        font-family: var(--font-family-sans);
    }
    .person b {
        font-size: var(--font-size-16);
    }
    .what {
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-paper-secondary);
    }
    .what--none {
        color: var(--text-on-paper-subtle);
    }
    .head {
        display: flex;
        align-items: center;
        gap: var(--space-4);
    }
    .head-icon :global(svg) {
        width: 32px;
        height: 32px;
    }
    section {
        display: grid;
        gap: var(--space-4);
    }
    .section-head {
        display: grid;
        gap: var(--space-1);
    }
    /* Each setting set apart by room and, after the first, a rule. */
    .column :global(.chooser) {
        gap: var(--space-9);
    }
    section + section {
        padding-top: var(--space-9);
        border-top: 1px solid var(--border-on-paper);
    }
    section :global(.ui-tabs) {
        justify-self: start;
    }
    .levels {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-2);
    }
    .tile {
        display: grid;
        gap: var(--space-2);
        justify-items: center;
        padding: var(--space-4) var(--space-1);
        border: 2px solid var(--border-on-paper);
        border-radius: var(--radius-md);
        background: transparent;
        font-family: var(--font-family-sans);
        color: var(--text-on-paper-subtle);
        cursor: pointer;
    }
    .tile--on {
        border-color: var(--color-ink-900);
        background: var(--color-ink-900);
        color: var(--text-on-table-strong);
    }
    .tile-name {
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-extrabold);
    }
    .cats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
    }
    .cat {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        border: 2px solid var(--border-on-paper);
        border-radius: var(--radius-pill);
        background: transparent;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-paper-subtle);
        cursor: pointer;
    }
    .cat:not(.cat--on) :global(.ui-category-dot) {
        filter: grayscale(1);
        opacity: 0.45;
    }
    .cat--on {
        border-color: var(--cat);
        background: var(--surface-paper-bright);
        color: var(--text-on-paper);
    }
    .check {
        margin-inline-start: auto;
        display: inline-flex;
        color: var(--cat-dark);
    }
    .check :global(svg) {
        width: 18px;
        height: 18px;
        stroke-width: 3;
    }
    .loosen {
        display: flex;
        gap: var(--space-4);
        padding: var(--space-5);
        border-radius: var(--radius-md);
        background: var(--surface-paper-sunken);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        color: var(--text-on-paper-strong);
    }
    .loosen :global(svg) {
        flex: none;
        width: 20px;
        height: 20px;
    }
    .loosen p {
        margin: 0;
    }
    .column :global(.settings) {
        gap: var(--space-6);
        padding: var(--space-7) var(--space-8);
    }
    .column :global(.settings-title) {
        font-size: var(--font-size-21);
    }
    .settings-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-5);
        margin: 0;
    }
    .settings-list div {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
    }
    .settings-list dd {
        order: -1;
        margin: 0;
        font-family: var(--type-field-family);
        font-size: var(--font-size-21);
        font-weight: var(--type-field-weight);
    }
    .yours {
        display: grid;
        gap: var(--space-4);
        padding-top: var(--space-6);
        border-top: 1px solid var(--border-on-paper);
    }
    .summary {
        display: grid;
        gap: var(--space-3);
        margin: 0;
        padding: 0;
        list-style: none;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        font-weight: var(--font-weight-semibold);
    }
    .summary li {
        display: flex;
        align-items: center;
        gap: var(--space-4);
    }
    .summary > li > :first-child {
        min-width: 40px;
    }
    .era {
        display: inline-block;
        padding: 1px 5px;
        border-radius: var(--radius-xs);
        border: 1.5px solid var(--border-on-paper-strong);
        font-size: var(--font-size-11);
        font-weight: var(--font-weight-extrabold);
        text-align: center;
        box-sizing: border-box;
    }
    .dots {
        display: inline-flex;
    }
    .dots :global(.ui-category-dot) {
        width: 18px;
        height: 18px;
        margin-inline-end: -3px;
    }
    .dots :global(svg) {
        width: 10px;
        height: 10px;
    }
    .play {
        gap: var(--space-7);
    }
    .turn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-inline-end: 64px;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-19);
        font-weight: var(--font-weight-extrabold);
        color: var(--text-on-table-strong);
    }
    .who {
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
    }
    .to {
        font-size: var(--font-size-15);
        color: var(--text-on-table-secondary);
    }
    .play :global(.on-table) {
        color: var(--text-on-table-secondary);
    }
    .loosened {
        display: flex;
        gap: var(--space-4);
        padding: var(--space-5) var(--space-6);
        border: 1.5px dashed var(--border-on-table-strong);
        border-radius: var(--radius-md);
        text-align: start;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        color: var(--text-on-table);
    }
    .loosened b {
        color: var(--text-on-table-strong);
    }
    .loosened :global(svg) {
        flex: none;
        width: 22px;
        height: 22px;
    }
    .card-wrap {
        display: flex;
        justify-content: center;
        padding: var(--space-3) 0;
    }
    .column :global(.reader-sheet) {
        gap: var(--space-6);
    }
    .order {
        display: grid;
        gap: var(--space-3);
        margin: 0;
        padding: 0;
        list-style: none;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-16);
        font-weight: var(--font-weight-bold);
    }
    .order li {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-md);
        background: var(--surface-paper-sunken);
    }
    .order :global(svg) {
        width: 20px;
        height: 20px;
    }
    .order .done {
        color: var(--text-on-paper-subtle);
    }
    .order .now {
        background: var(--color-ink-900);
        color: var(--text-on-table-strong);
    }
    .outside {
        justify-self: center;
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-6);
        border: 1.5px dashed var(--border-on-table-strong);
        border-radius: var(--radius-pill);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-table);
    }
    .outside-label {
        color: var(--text-on-table-strong);
    }
    .flag {
        padding: 1px var(--space-2);
        border: 1.5px dashed currentColor;
        border-radius: var(--radius-pill);
        font-size: var(--font-size-11);
        font-weight: var(--font-weight-bold);
        white-space: nowrap;
    }
    .state {
        margin-inline-start: auto;
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-semibold);
    }
</style>
