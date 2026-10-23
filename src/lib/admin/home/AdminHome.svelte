<!--
    The admin Home (`adminHome` in #lib/server/admin-home.js has the numbers): a nudge and the
    quick actions, four stat tiles on what needs doing, big cards into each section (People and
    the audit log for admins only; Categories links on for admins), translation coverage per
    language and, for admins, recent activity. Nearly every number opens the card list filtered
    to what it counts. Data in, nothing fetched here, so it renders from any data (a fresh
    install included).
-->
<script lang="ts">
    import CameraIcon from '@lucide/svelte/icons/camera'
    import HistoryIcon from '@lucide/svelte/icons/history'
    import LayersIcon from '@lucide/svelte/icons/layers'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import TagsIcon from '@lucide/svelte/icons/tags'
    import UsersIcon from '@lucide/svelte/icons/users'
    import ArrowRightIcon from '@lucide/svelte/icons/arrow-right'
    import { buttonVariants } from '#lib/components/ui/button/index.js'
    import AddFromPhoto from '#lib/admin/cards/AddFromPhoto.svelte'
    import CategoryBadge from '#lib/admin/categories/CategoryBadge.svelte'
    import { actionLabel, entityHref, entityLabel, formatTime } from '#lib/audit/display.js'
    import { relativeTime } from '#lib/audit/history-summary.js'
    import { cardListHref, type CardFilter } from '#lib/cards/card-list.js'
    import {
        localeName,
        translationLocales,
        type TranslationState,
    } from '#lib/cards/translation.js'
    import type { AdminHome } from '#lib/server/admin-home.js'
    import type { AppRole } from '#lib/server/roles.js'

    let { home, role }: { home: AdminHome; role: AppRole } = $props()

    const admin = $derived(role === 'admin')
    const number = new Intl.NumberFormat('en-GB')
    const weekDate = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    })
    const n = (value: number) => number.format(value)
    const cards = (filter: CardFilter) => cardListHref({ filter })
    const plural = (count: number, one: string, many = `${one}s`) =>
        `${n(count)} ${count === 1 ? one : many}`

    const totalCards = $derived(home.cards.published + home.cards.drafts)
    const reviewTotal = $derived(translationLocales.reduce((sum, l) => sum + home.toReview[l], 0))

    // One sentence on what is waiting, from the numbers.
    const nudge = $derived.by(() => {
        if (totalCards === 0) return 'No cards yet. Write the first one, or add some from a photo.'
        const parts = [
            home.cards.draftsReady > 0 &&
                `${plural(home.cards.draftsReady, 'draft')} ${home.cards.draftsReady === 1 ? 'is' : 'are'} ready to publish`,
            reviewTotal > 0 &&
                `${plural(reviewTotal, 'translation')} ${reviewTotal === 1 ? 'waits' : 'wait'} for review`,
        ].filter(Boolean)
        return parts.length > 0
            ? `${parts.join(', and ')}.`
            : 'Nothing is waiting for you. Nice work.'
    })

    // Translation coverage, one stacked bar per language: reviewed, machine, stale, missing.
    const stateOrder: TranslationState[] = ['reviewed', 'machine', 'stale', 'missing']
    const stateLook: Record<TranslationState, { label: string; colour: string }> = {
        reviewed: { label: 'Reviewed', colour: 'var(--palette-green-500)' },
        machine: { label: 'Machine', colour: 'var(--palette-blue-500)' },
        stale: { label: 'Stale', colour: 'var(--palette-amber-700)' },
        missing: {
            label: 'Missing',
            colour: 'color-mix(in oklab, var(--muted-foreground) 25%, var(--background))',
        },
    }
    const percent = (part: number, whole: number) =>
        whole === 0 ? 0 : Math.round((part / whole) * 100)

    // Cards per category, the biggest first; bars scaled to the biggest.
    const byCategory = $derived(
        home.categories
            .filter((category) => !category.archived)
            .toSorted((a, b) => b.cardCount - a.cardCount),
    )
    const mostInCategory = $derived(Math.max(1, ...byCategory.map((c) => c.cardCount)))
    const archivedCategories = $derived(home.categories.filter((c) => c.archived).length)

    const actor = (actorId: string | null) =>
        actorId ? (home.activity?.names.people[actorId] ?? 'Someone no longer here') : 'System'
</script>

{#snippet tile(value: string, label: string, note: string, href: string)}
    <a
        {href}
        class="group flex flex-1 flex-col gap-1 rounded-lg border bg-background p-4 transition-colors hover:bg-muted">
        <span class="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        <span class="font-medium">{label}</span>
        <span class="text-sm text-muted-foreground">{note}</span>
    </a>
{/snippet}

{#snippet section(
    href: string | undefined,
    Icon: typeof LayersIcon,
    title: string,
    description: string,
    figure: string,
    body?: import('svelte').Snippet,
)}
    <svelte:element
        this={href ? 'a' : 'div'}
        {href}
        class={[
            'flex flex-col gap-3 rounded-lg border bg-background p-5',
            href && 'transition-colors hover:bg-muted',
        ]}>
        <span class="flex items-center gap-3">
            <span class="flex size-9 items-center justify-center rounded-md bg-muted">
                <Icon
                    class="size-5"
                    aria-hidden="true" />
            </span>
            <span class="text-lg font-semibold tracking-tight">{title}</span>
            {#if href}
                <ArrowRightIcon
                    class="ml-auto size-4 text-muted-foreground"
                    aria-hidden="true" />
            {/if}
        </span>
        <span class="text-sm text-muted-foreground">{description}</span>
        <!-- Anything spare sits above the body, so the figures line up at the bottom. -->
        <span class="mt-auto flex flex-col gap-3">
            {@render body?.()}
            <span class="text-sm font-medium">{figure}</span>
        </span>
    </svelte:element>
{/snippet}

<div class="flex max-w-5xl flex-col gap-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold tracking-tight">Home</h1>
            <p class="mt-1 text-muted-foreground">{nudge}</p>
        </div>
        <div class="flex flex-wrap gap-2">
            {#if admin}
                <AddFromPhoto class={buttonVariants({ variant: 'outline' })}>
                    <CameraIcon aria-hidden="true" />
                    Add from photo
                </AddFromPhoto>
            {/if}
            <a
                href="/admin/cards/new"
                class={buttonVariants()}>
                <PlusIcon aria-hidden="true" />
                New card
            </a>
        </div>
    </header>

    <section aria-label="At a glance">
        <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li class="flex">
                {@render tile(
                    n(home.cards.published),
                    'Published',
                    home.cards.publishedThisWeek > 0
                        ? `+${n(home.cards.publishedThisWeek)} this week`
                        : 'None this week',
                    cards({ status: 'published' }),
                )}
            </li>
            <li class="flex">
                {@render tile(
                    n(home.cards.drafts),
                    home.cards.drafts === 1 ? 'Draft' : 'Drafts',
                    `${n(home.cards.draftsReady)} ready to publish`,
                    cards({ status: 'draft' }),
                )}
            </li>
            <li class="flex">
                <div class="flex flex-1 flex-col gap-1 rounded-lg border bg-background p-4">
                    <span class="flex gap-3 text-3xl font-semibold tracking-tight tabular-nums">
                        {#each translationLocales as locale, index (locale)}
                            {#if index > 0}<span
                                    class="text-muted-foreground/50"
                                    aria-hidden="true">·</span
                                >{/if}
                            <a
                                href={cards({ translations: { [locale]: 'needs-review' } })}
                                class="hover:underline"
                                aria-label="{n(home.toReview[locale])} {localeName[
                                    locale
                                ]} to review">{n(home.toReview[locale])}</a>
                        {/each}
                    </span>
                    <span class="font-medium">To review</span>
                    <span class="text-sm text-muted-foreground">
                        {translationLocales.map((locale) => localeName[locale]).join(' · ')}
                    </span>
                </div>
            </li>
            <li class="flex">
                {@render tile(
                    n(home.cards.unverified),
                    'Unverified dates',
                    totalCards === 0
                        ? 'No cards yet'
                        : `${percent(totalCards - home.cards.unverified, totalCards)}% verified`,
                    cards({ verified: false }),
                )}
            </li>
        </ul>
    </section>

    <section
        aria-label="Sections"
        class="grid gap-3 md:grid-cols-2">
        {#snippet weeklyPublished()}
            {@const most = Math.max(1, ...home.publishedPerWeek.map((w) => w.count))}
            {@const thisWeek = home.publishedPerWeek.at(-1)?.count ?? 0}
            <span class="flex flex-col gap-2">
                <span class="flex items-baseline justify-between gap-2 text-sm">
                    <span class="font-medium">Published per week</span>
                    <span class="text-muted-foreground tabular-nums">
                        {plural(thisWeek, 'card')} this week
                    </span>
                </span>
                <!-- One column per week, the latest on the right; hovering one gives its count. -->
                <span
                    class="flex h-24 items-end gap-0.5 border-b"
                    role="img"
                    aria-label="Cards published per week, the last {home.publishedPerWeek
                        .length} weeks: {home.publishedPerWeek.map((w) => n(w.count)).join(', ')}">
                    {#each home.publishedPerWeek as weekly, index (weekly.from)}
                        <span
                            class="group relative flex h-full flex-1 items-end"
                            title="{weekDate.format(new Date(weekly.from))}: {plural(
                                weekly.count,
                                'card',
                            )} published">
                            <span
                                class="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                                style="height: {weekly.count === 0
                                    ? 0
                                    : `max(3px, ${(weekly.count / most) * 100}%)`}; background: {index ===
                                home.publishedPerWeek.length - 1
                                    ? 'var(--palette-green-500)'
                                    : 'color-mix(in oklab, var(--palette-green-500) 55%, var(--background))'}"
                            ></span>
                        </span>
                    {/each}
                </span>
                <span class="flex justify-between text-xs text-muted-foreground">
                    <span>{home.publishedPerWeek.length} weeks ago</span>
                    <span>This week</span>
                </span>
            </span>
        {/snippet}
        {@render section(
            '/admin/cards',
            LayersIcon,
            'Cards',
            'Write, translate, verify and publish the deck.',
            `${n(home.cards.published)} published · ${n(home.cards.drafts)} ${home.cards.drafts === 1 ? 'draft' : 'drafts'}${home.cards.archived > 0 ? ` · ${n(home.cards.archived)} archived` : ''}`,
            weeklyPublished,
        )}
        {#snippet categoryBars()}
            {#if byCategory.length > 0}
                <ul
                    class="flex flex-col gap-1.5"
                    aria-label="Cards per category">
                    {#each byCategory.slice(0, 5) as category (category.id)}
                        <li
                            class="grid grid-cols-[minmax(0,7rem)_1fr_3rem] items-center gap-2 text-sm">
                            <span class="flex min-w-0 items-center gap-1.5">
                                <CategoryBadge
                                    name={category.name}
                                    icon={category.icon}
                                    colour={category.colour} />
                                <span class="truncate">{category.name}</span>
                            </span>
                            <!-- A faint track for scale; no bar at all for an empty category. -->
                            <span
                                class="h-2 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true">
                                {#if category.cardCount > 0}
                                    <span
                                        class="cat-{category.colour} block h-full rounded-full bg-(--cat)"
                                        style="width: max(4px, {(category.cardCount /
                                            mostInCategory) *
                                            100}%)"></span>
                                {/if}
                            </span>
                            <span class="text-right text-muted-foreground tabular-nums">
                                {n(category.cardCount)}
                            </span>
                        </li>
                    {/each}
                </ul>
            {/if}
        {/snippet}
        {@render section(
            admin ? '/admin/categories' : undefined,
            TagsIcon,
            'Categories',
            admin
                ? 'The draw order, names, icons and colours.'
                : 'Where the cards are. An admin manages the categories.',
            `${plural(byCategory.length, 'category', 'categories')} in the draw${archivedCategories > 0 ? ` · ${n(archivedCategories)} archived` : ''}`,
            categoryBars,
        )}
        {#if admin && home.people}
            {@render section(
                '/admin/people',
                UsersIcon,
                'People',
                'Who can edit, and who can manage everything.',
                `${plural(home.people.withRole, 'person', 'people')} with a role${home.people.invites > 0 ? ` · ${plural(home.people.invites, 'invite')} waiting` : ''}`,
            )}
        {/if}
        {#if admin && home.activity}
            {@render section(
                '/admin/audit',
                HistoryIcon,
                'Audit log',
                'Every change, who made it and when.',
                `${plural(home.activity.changesThisWeek, 'change')} this week`,
            )}
        {/if}
    </section>

    <div class={['grid gap-8', admin && home.activity && 'lg:grid-cols-2']}>
        <section
            aria-labelledby="coverage-heading"
            class="flex flex-col gap-3">
            <h2
                id="coverage-heading"
                class="font-semibold">
                Translations
            </h2>
            <div class="flex flex-col gap-4 rounded-lg border bg-background p-5">
                {#each translationLocales as locale (locale)}
                    {@const counts = home.translations[locale]}
                    {@const whole = stateOrder.reduce((sum, state) => sum + counts[state], 0)}
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-baseline justify-between gap-2 text-sm">
                            <span class="font-medium">{localeName[locale]}</span>
                            <span class="text-muted-foreground tabular-nums">
                                {percent(counts.reviewed, whole)}% reviewed
                            </span>
                        </div>
                        <div
                            class="flex h-3 gap-0.5 overflow-hidden rounded-full"
                            role="img"
                            aria-label="{localeName[locale]}: {stateOrder
                                .map(
                                    (state) =>
                                        `${counts[state]} ${stateLook[state].label.toLowerCase()}`,
                                )
                                .join(', ')}">
                            {#if whole === 0}
                                <span class="flex-1 bg-muted"></span>
                            {/if}
                            {#each stateOrder as state (state)}
                                {#if counts[state] > 0}
                                    <a
                                        href={cards({ translations: { [locale]: state } })}
                                        class="h-full transition-opacity hover:opacity-80"
                                        style="flex: {counts[state]} 0 0; background: {stateLook[
                                            state
                                        ].colour}"
                                        title="{stateLook[state].label}: {n(
                                            counts[state],
                                        )} ({percent(counts[state], whole)}%)"
                                        tabindex="-1"
                                        aria-hidden="true"></a>
                                {/if}
                            {/each}
                        </div>
                    </div>
                {/each}
                <ul
                    class="flex flex-wrap gap-x-4 gap-y-1 text-sm"
                    aria-label="Translation states">
                    {#each stateOrder as state (state)}
                        <li class="flex items-center gap-1.5">
                            <span
                                class="size-2.5 rounded-full"
                                style="background: {stateLook[state].colour}"
                                aria-hidden="true"></span>
                            {stateLook[state].label}
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        {#if admin && home.activity}
            <section
                aria-labelledby="activity-heading"
                class="flex flex-col gap-3">
                <div class="flex items-baseline justify-between gap-2">
                    <h2
                        id="activity-heading"
                        class="font-semibold">
                        Recent activity
                    </h2>
                    <a
                        href="/admin/audit"
                        class="text-sm text-muted-foreground hover:underline">
                        All changes
                    </a>
                </div>
                {#if home.activity.recent.length === 0}
                    <p class="rounded-lg border bg-background p-5 text-sm text-muted-foreground">
                        No changes yet.
                    </p>
                {:else}
                    <ol class="flex flex-col divide-y rounded-lg border bg-background text-sm">
                        {#each home.activity.recent as entry (entry.id)}
                            {@const href = entityHref(entry.entity, entry.entityId)}
                            <li class="flex flex-col gap-0.5 px-4 py-3">
                                <span>
                                    <span class="font-medium">{actionLabel(entry.action)}</span>
                                    {#if href}
                                        <a
                                            {href}
                                            class="text-muted-foreground hover:underline">
                                            {entityLabel(entry.entity, entry.locale)}
                                        </a>
                                    {:else}
                                        <span class="text-muted-foreground">
                                            {entityLabel(entry.entity, entry.locale)}
                                        </span>
                                    {/if}
                                </span>
                                <span class="flex min-w-0 gap-1 text-xs text-muted-foreground">
                                    <span class="truncate">{actor(entry.actorId)}</span>
                                    <span aria-hidden="true">·</span>
                                    <time
                                        class="shrink-0"
                                        datetime={entry.at}
                                        title={formatTime(entry.at)}>{relativeTime(entry.at)}</time>
                                </span>
                            </li>
                        {/each}
                    </ol>
                {/if}
            </section>
        {/if}
    </div>
</div>
