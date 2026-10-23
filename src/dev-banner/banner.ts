// The banner `vp dev` prints instead of Vite's list of URLs: the When Then? wordmark on the navy
// game table, the four category colours, and a timeline holding a small hand of cards, one of them
// just dealt with its year hidden. Text on the terminal's own background keeps the terminal's
// colours so it reads on light and dark themes alike; only accents and the surfaces the banner
// paints itself use brand colours (the design tokens' OKLCH values, converted to truecolor).

export type Urls = { local: string; network?: string }

type Category = 'events' | 'people' | 'inventions' | 'places'

export type Card = { category: Category; text: string; year: number }

/** Real history, so every dev server start is a tiny round of the game. */
export const deck: Card[] = [
    { category: 'events', text: 'The Berlin Wall falls', year: 1989 },
    { category: 'events', text: 'Apollo 11 lands on the Moon', year: 1969 },
    { category: 'events', text: 'The Titanic sinks', year: 1912 },
    { category: 'people', text: 'Marie Curie wins her second Nobel Prize', year: 1911 },
    { category: 'people', text: 'Nelson Mandela walks out of prison', year: 1990 },
    { category: 'people', text: 'Astrid Lindgren publishes Pippi Longstocking', year: 1945 },
    { category: 'inventions', text: 'The first iPhone goes on sale', year: 2007 },
    { category: 'inventions', text: 'The World Wide Web opens to the public', year: 1991 },
    { category: 'inventions', text: 'The first text message is sent', year: 1992 },
    { category: 'places', text: 'The Eiffel Tower opens', year: 1889 },
    { category: 'places', text: 'The Øresund Bridge opens', year: 2000 },
    { category: 'places', text: 'The Sydney Opera House opens', year: 1973 },
]

const hex = {
    navy700: '#1a1a36',
    navy400: '#343a7a',
    paper50: '#fffbf2',
    paper800: '#b49d74',
    amber500: '#e3a219',
}

const categories: Record<Category, { glyph: string; colour: string }> = {
    events: { glyph: '◆', colour: '#c8392b' },
    people: { glyph: '●', colour: '#2754b5' },
    inventions: { glyph: '▲', colour: hex.amber500 },
    places: { glyph: '■', colour: '#1e8758' },
}

/** The timeline spans these years over this many columns. */
const timeline = { from: 1860, to: 2030, width: 60 }

/** Years closer than this would put their labels on top of each other on the timeline. */
const minimumGap = 12

/**
 * A hand of three cards, the first one dealt and the others already placed, and an anchor year,
 * all at least `minimumGap` years apart. `random` returns [0, 1), like `Math.random`.
 */
export function dealHand(random: () => number = Math.random): { hand: Card[]; anchor: number } {
    for (;;) {
        const pool = [...deck]
        const hand = Array.from(
            { length: 3 },
            () => pool.splice(Math.floor(random() * pool.length), 1)[0],
        )
        const anchor = 1920 + Math.floor(random() * 40)
        const years = [...hand.map((c) => c.year), anchor].sort((a, b) => a - b)
        if (years.every((year, i) => i === 0 || year - years[i - 1] >= minimumGap)) {
            return { hand, anchor }
        }
    }
}

const escape = String.fromCharCode(27)
const sgr = new RegExp(`${escape}\\[[0-9;]*m`, 'g')

/** Columns a line takes up in the terminal, ignoring colour codes. */
export const visibleWidth = (line: string) => line.replace(sgr, '').length

const padEnd = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - visibleWidth(s)))

function styles(colour: boolean) {
    const code = (open: string, close: string) => (s: string) =>
        colour ? `${escape}[${open}m${s}${escape}[${close}m` : s
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(';')
    return {
        fg: (h: string) => code(`38;2;${rgb(h)}`, '39'),
        bg: (h: string) => code(`48;2;${rgb(h)}`, '49'),
        bold: code('1', '22'),
        dim: code('2', '22'),
    }
}

const letters: Record<string, string[]> = {
    W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
    H: ['#...#', '#...#', '#####', '#...#', '#...#'],
    E: ['#####', '#....', '####.', '#....', '#####'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..'],
    '?': ['.###.', '#...#', '..##.', '.....', '..#..'],
    ' ': ['...', '...', '...', '...', '...'],
}

/** Five-row bitmap letters drawn as three rows of half blocks. */
function blockLetters(text: string): string[] {
    const rows = ['', '', '', '', '', '']
    for (const letter of text) letters[letter].forEach((row, i) => (rows[i] += `${row}.`))
    rows[5] = '.'.repeat(rows[0].length)
    return [0, 2, 4].map((r) =>
        rows[r]
            .split('')
            .map((top, i) => {
                const bottom = rows[r + 1][i] === '#'
                if (top === '#') return bottom ? '█' : '▀'
                return bottom ? '▄' : ' '
            })
            .join(''),
    )
}

export type BannerOptions = {
    urls: Urls
    /** The dealt card first, then the cards already placed. */
    hand: Card[]
    anchor: number
    /** Whether the dealt card's year has turned over. */
    revealed: boolean
    colour: boolean
}

/** The banner's lines, the wordmark band, the stripe and the timeline all equally wide. */
export function banner({ urls, hand, anchor, revealed, colour }: BannerOptions): string[] {
    const { fg, bg, bold, dim } = styles(colour)
    const margin = '  '
    const amber = fg(hex.amber500)

    // The timeline row: "When ━━━…━━━ Then?", with a marker per card and the anchor year.
    const column = (year: number) =>
        Math.round(((year - timeline.from) / (timeline.to - timeline.from)) * (timeline.width - 1))
    const line = Array.from({ length: timeline.width }, () => fg(hex.navy400)('━'))
    const labels = Array<string>(timeline.width).fill(' ')
    const mark = (year: number, marker: string, label: string) => {
        line[column(year)] = marker
        const at = Math.min(timeline.width - 4, Math.max(0, column(year) - 1))
        labels.splice(at, 4, label, '', '', '')
    }
    const [dealt, ...placed] = hand
    mark(anchor, dim('◇'), dim(String(anchor)))
    for (const card of placed) {
        const { glyph, colour: tint } = categories[card.category]
        mark(card.year, fg(tint)(glyph), String(card.year))
    }
    const { glyph, colour: tint } = categories[dealt.category]
    mark(
        dealt.year,
        fg(tint)(bold('?')),
        revealed ? fg(tint)(bold(String(dealt.year))) : fg(hex.paper800)('????'),
    )
    const when = 'When '
    const row = `${margin}${bold(when)}${line.join('')} ${bold('Then') + bold(amber('?'))}`
    const indent = ' '.repeat(margin.length + when.length)

    // The dealt card hangs over its place on the timeline, kept inside it.
    const at = column(dealt.year)
    const card = `${fg(tint)(glyph)} ${dealt.text}`
    const cardWidth = visibleWidth(card)
    const cardStart = Math.max(
        0,
        Math.min(timeline.width - cardWidth, at - Math.floor(cardWidth / 2)),
    )

    // The navy band and stripe run from "When" to the end of "Then?".
    const width = visibleWidth(row) - margin.length
    const band = (s: string) => margin + bg(hex.navy700)(padEnd(s, width))
    const wordmark = blockLetters('WHEN THEN?')
    const left = Math.floor((width - wordmark[0].length) / 2)
    const question = wordmark[0].length - 6
    const stripe = Object.values(categories).map((c, i) =>
        bg(c.colour)(' '.repeat(Math.floor((width * (i + 1)) / 4) - Math.floor((width * i) / 4))),
    )

    const url = (u: string) => `${amber('➜')} ${dim(u)}`
    return [
        band(''),
        ...wordmark.map((r) =>
            band(
                ' '.repeat(left) + fg(hex.paper50)(r.slice(0, question)) + amber(r.slice(question)),
            ),
        ),
        band(''),
        margin + stripe.join(''),
        '',
        indent + ' '.repeat(cardStart) + card,
        indent + ' '.repeat(at) + fg(tint)('▼'),
        row,
        (indent + labels.join('')).trimEnd(),
        '',
        `${margin}${url(urls.local)}${urls.network ? `   ${url(urls.network)}` : ''}`,
    ]
}
