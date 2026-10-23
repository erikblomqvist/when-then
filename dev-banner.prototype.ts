// PROTOTYPE, throw away. Question: what should `vp dev` look like for When Then?
// Five structurally different banners, picked with WT_BANNER=A..E (`WT_BANNER=B vp dev`), or flipped
// through with ← → in the standalone viewer (`vpr prototype:banner`). Colours are the design
// tokens' OKLCH values converted to truecolor; NO_COLOR turns them off.

import { networkInterfaces } from 'node:os'
import { encode } from 'uqr'
import type { Plugin } from 'vite'

// ---------------------------------------------------------------------------------------------
// Palette and styling

const hex = {
    navy900: '#07071a',
    navy700: '#1a1a36',
    navy400: '#343a7a',
    paper50: '#fffbf2',
    paper400: '#f0e3c8',
    paper800: '#b49d74',
    ink900: '#2b2118',
    ink600: '#5a4a3a',
    haze300: '#cfcde3',
    red500: '#c8392b',
    blue500: '#2754b5',
    amber500: '#e3a219',
    green500: '#1e8758',
}

const useColour = !process.env.NO_COLOR
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(';')
const fg = (h: string) => (s: string) => (useColour ? `\x1b[38;2;${rgb(h)}m${s}\x1b[39m` : s)
const bg = (h: string) => (s: string) => (useColour ? `\x1b[48;2;${rgb(h)}m${s}\x1b[49m` : s)
const bold = (s: string) => (useColour ? `\x1b[1m${s}\x1b[22m` : s)
const dim = (s: string) => (useColour ? `\x1b[2m${s}\x1b[22m` : s)
// Text on the terminal's own background keeps the terminal's colour, so it reads on light and
// dark themes alike. Only accents and surfaces we paint ourselves get brand colours.
const plain = (s: string) => s
const muted = dim
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length
const padEnd = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - visible(s)))
const center = (s: string, n: number) => {
    const left = Math.floor((n - visible(s)) / 2)
    return padEnd(' '.repeat(Math.max(0, left)) + s, n)
}

function wrap(text: string, width: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(' ')) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line)
            line = word
        } else line = line ? `${line} ${word}` : word
    }
    return [...lines, line]
}

/** Lays two blocks of lines side by side. */
function beside(left: string[], right: string[], gap = 3): string[] {
    const width = Math.max(...left.map(visible))
    return Array.from(
        { length: Math.max(left.length, right.length) },
        (_, i) => padEnd(left[i] ?? '', width) + ' '.repeat(gap) + (right[i] ?? ''),
    )
}

const wordmark = () => bold(plain('When Then') + fg(hex.amber500)('?'))

// ---------------------------------------------------------------------------------------------
// The deck: real history, so the dealt card is a tiny round of the game each time

type Category = 'events' | 'people' | 'inventions' | 'places'
type Card = { category: Category; text: string; year: number }

const categories: Record<Category, { name: string; glyph: string; colour: string; edge: string }> =
    {
        events: { name: 'Events', glyph: '◆', colour: hex.red500, edge: '#87211a' },
        people: { name: 'People', glyph: '●', colour: hex.blue500, edge: '#173472' },
        inventions: { name: 'Inventions', glyph: '▲', colour: hex.amber500, edge: '#9c6a08' },
        places: { name: 'Places', glyph: '■', colour: hex.green500, edge: '#0e5434' },
    }

const deck: Card[] = [
    { category: 'events', text: 'The Berlin Wall falls', year: 1989 },
    { category: 'events', text: 'Apollo 11 lands on the Moon', year: 1969 },
    { category: 'people', text: 'Marie Curie wins her second Nobel Prize', year: 1911 },
    { category: 'people', text: 'Nelson Mandela walks out of prison', year: 1990 },
    { category: 'inventions', text: 'The first iPhone goes on sale', year: 2007 },
    { category: 'inventions', text: 'The World Wide Web opens to the public', year: 1991 },
    { category: 'places', text: 'The Eiffel Tower opens', year: 1889 },
    { category: 'places', text: 'The Øresund Bridge opens', year: 2000 },
]

const shuffled = () => [...deck].sort(() => Math.random() - 0.5)

/** Three cards at least a decade apart, so their years don't collide on the timeline. */
function spreadHand(): Card[] {
    for (;;) {
        const hand = shuffled().slice(0, 3)
        const years = hand.map((c) => c.year).sort((a, b) => a - b)
        if (years[1] - years[0] >= 12 && years[2] - years[1] >= 12) return hand
    }
}

export type Urls = { local: string; network?: string }

// ---------------------------------------------------------------------------------------------
// A. The deal: a card flips from its sleeve, then the year turns over

const cardWidth = 18
const cardHeight = 9

function cardFront(card: Card, revealed: boolean): string[] {
    const cat = categories[card.category]
    const paper = (s: string) => bg(hex.paper50)(fg(hex.ink900)(padEnd(s, cardWidth)))
    const band = bg(cat.colour)(
        fg(hex.paper50)(padEnd(` ${cat.glyph} ${cat.name.toUpperCase()}`, cardWidth)),
    )
    const text = wrap(card.text, cardWidth - 4).map((l) => paper(`  ${bold(l)}`))
    const year = revealed ? bold(fg(cat.edge)(String(card.year))) : fg(hex.paper800)('????')
    const body = [paper(''), ...text]
    while (body.length < cardHeight - 2) body.push(paper(''))
    return [band, ...body, paper(' '.repeat(cardWidth - 6) + year)]
}

function cardSleeve(card: Card): string[] {
    const cat = categories[card.category]
    const back = (s: string) => bg(hex.navy400)(fg(cat.colour)(center(s, cardWidth)))
    return [
        back(''),
        back(''),
        back(bold('▄▀▀▀▄')),
        back(bold('  ▄▀ ')),
        back(bold('  ▄  ')),
        back(''),
        back(''),
        bg(hex.navy400)(fg(hex.haze300)(center(cat.name.toUpperCase(), cardWidth))),
        back(''),
    ]
}

/** A card squeezed to `width` columns, for the flip. */
const squeeze = (lines: string[], width: number) =>
    lines.map((l) => center(sliceVisible(l, width), cardWidth))

function sliceVisible(line: string, width: number): string {
    // Keep the styling of the line's first cell, cut to the middle `width` cells.
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    const start = Math.floor((plain.length - width) / 2)
    const codes = line.match(/^(\x1b\[[0-9;]*m)*/)?.[0] ?? ''
    return codes + plain.slice(start, start + width) + (useColour ? '\x1b[0m' : '')
}

function dealInfo(urls: Urls, card: Card, revealed: boolean): string[] {
    const cat = categories[card.category]
    return [
        '',
        wordmark(),
        dim(muted('dev server')),
        '',
        `${fg(hex.amber500)('➜')} ${bold('Local')}    ${muted(urls.local)}`,
        `${fg(hex.amber500)('➜')} ${bold('Network')}  ${muted(urls.network ?? dim('use --host to expose'))}`,
        '',
        revealed
            ? `${fg(cat.colour)(bold(String(card.year)))}${muted('. Did you have it? Lock in.')}`
            : muted('When then? Guess before it turns.'),
    ]
}

async function deal(urls: Urls, write: (lines: string[]) => void, animate: boolean) {
    const card = shuffled()[0]
    if (!animate) return write(beside(cardFront(card, true), dealInfo(urls, card, true)))
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const frame = (lines: string[], revealed = false) =>
        write(beside(lines, dealInfo(urls, card, revealed)))
    frame(cardSleeve(card))
    await sleep(700)
    for (const w of [14, 9, 4, 1]) {
        frame(squeeze(cardSleeve(card), w))
        await sleep(45)
    }
    for (const w of [4, 9, 14]) {
        frame(squeeze(cardFront(card, false), w))
        await sleep(45)
    }
    frame(cardFront(card, false))
    await sleep(1600)
    frame(cardFront(card, true), true)
}

// ---------------------------------------------------------------------------------------------
// B. The timeline: the wordmark is the timeline, with a hand already placed on it

function timeline(urls: Urls, revealed: boolean, hand = shuffled().slice(0, 3)): string[] {
    const [dealt, ...placed] = hand
    const width = 60
    const from = 1860
    const to = 2030
    const col = (year: number) => Math.round(((year - from) / (to - from)) * (width - 1))
    const anchor = 1925 + Math.floor(Math.random() * 30)

    const line = Array.from({ length: width }, () => fg(hex.navy400)('━'))
    const years = Array<string>(width).fill(' ')
    const put = (year: number, mark: string, label: string) => {
        line[col(year)] = mark
        const at = Math.min(width - 4, Math.max(0, col(year) - 1))
        if (years.slice(at, at + 4).every((c) => c === ' ')) {
            years.splice(at, 4, label, '', '', '')
        }
    }
    put(anchor, muted('◇'), dim(muted(String(anchor))))
    for (const card of placed) {
        const cat = categories[card.category]
        put(card.year, fg(cat.colour)(cat.glyph), plain(String(card.year)))
    }
    const cat = categories[dealt.category]
    const at = col(dealt.year)
    put(
        dealt.year,
        fg(cat.colour)(bold('?')),
        revealed ? bold(fg(cat.colour)(String(dealt.year))) : fg(hex.paper800)('????'),
    )

    const label = `${fg(cat.colour)(cat.glyph)} ${plain(dealt.text)}`
    const labelStart = Math.max(
        0,
        Math.min(width - visible(label), at - Math.floor(visible(label) / 2)),
    )
    const indent = ' '.repeat(7)
    return [
        indent + ' '.repeat(labelStart) + label,
        indent + ' '.repeat(at) + fg(cat.colour)('▼'),
        `  ${bold(plain('When'))} ${line.join('')} ${bold(plain('Then') + fg(hex.amber500)('?'))}`,
        indent + years.join(''),
        '',
        `  ${fg(hex.amber500)('➜')} ${muted(urls.local)}` +
            (urls.network ? `   ${fg(hex.amber500)('➜')} ${muted(urls.network)}` : ''),
    ]
}

// ---------------------------------------------------------------------------------------------
// C. The table: a big wordmark painted on the navy game table, category colours beneath

const glyphs: Record<string, string[]> = {
    W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
    H: ['#...#', '#...#', '#####', '#...#', '#...#'],
    E: ['#####', '#....', '####.', '#....', '#####'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..'],
    '?': ['.###.', '#...#', '..##.', '.....', '..#..'],
    ' ': ['...', '...', '...', '...', '...'],
}

/** Five-row bitmap letters drawn in three rows of half blocks. */
function bigText(text: string): { rows: string[]; marks: number[] } {
    const rows = ['', '', '', '', '', '']
    const marks: number[] = []
    for (const ch of text) {
        if (ch === '?') marks.push(rows[0].length)
        glyphs[ch].forEach((r, i) => (rows[i] += r + '.'))
    }
    rows[5] = '.'.repeat(rows[0].length)
    const drawn = [0, 2, 4].map((r) =>
        [...rows[r]]
            .map((top, i) => {
                const bottom = rows[r + 1][i]
                if (top === '#' && bottom === '#') return '█'
                if (top === '#') return '▀'
                if (bottom === '#') return '▄'
                return ' '
            })
            .join(''),
    )
    return { rows: drawn, marks }
}

function table(urls: Urls): string[] {
    const width = 66
    const navy = (s: string) => bg(hex.navy700)(padEnd(s, width))
    const { rows, marks } = bigText('WHEN THEN?')
    const left = Math.floor((width - rows[0].length) / 2)
    const letters = rows.map((row) => {
        const q = marks[0]
        return navy(
            ' '.repeat(left) +
                fg(hex.paper50)(row.slice(0, q)) +
                fg(hex.amber500)(row.slice(q, q + 5)) +
                fg(hex.paper50)(row.slice(q + 5)),
        )
    })
    const stripe = Object.values(categories)
        .map((c, i) => bg(c.colour)(' '.repeat(i % 2 ? 16 : 17)))
        .join('')
    const card = shuffled()[0]
    const cat = categories[card.category]
    return [
        navy(''),
        ...letters,
        navy(center(fg(hex.haze300)('a party game about when things happened'), width)),
        navy(''),
        padEnd(stripe, width),
        '',
        `  ${fg(cat.colour)(cat.glyph)} ${plain(card.text)} ${dim('·'.repeat(Math.max(2, 46 - card.text.length)))} ${fg(cat.colour)(bold(String(card.year)))}`,
        '',
        `  ${fg(hex.amber500)('➜')} ${bold('Local')}    ${muted(urls.local)}`,
        `  ${fg(hex.amber500)('➜')} ${bold('Network')}  ${muted(urls.network ?? dim('use --host to expose'))}`,
    ]
}

// ---------------------------------------------------------------------------------------------
// D. The lobby: dev joins like a game does, by scanning a QR on a paper card

function lobby(urls: Urls): string[] {
    const target = urls.network ?? urls.local
    const { data } = encode(target, { ecc: 'L', border: 2 })
    const qr: string[] = []
    for (let y = 0; y < data.length; y += 2) {
        let row = ''
        for (let x = 0; x < data.length; x++) {
            const top = data[y][x]
            const bottom = data[y + 1]?.[x] ?? false
            row += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
        }
        qr.push(bg(hex.paper50)(fg(hex.navy900)(row)))
    }
    const code = 'DEVS'
        .split('')
        .map((c) => bg(hex.paper50)(fg(hex.ink900)(bold(` ${c} `))))
        .join(' ')
    const info = [
        '',
        wordmark(),
        '',
        plain(bold(urls.network ? 'Scan to join on your phone' : 'Scan to join')),
        muted(
            urls.network
                ? 'same Wi-Fi as this machine'
                : dim('only works here; run with --host for phones'),
        ),
        '',
        dim(muted('game code')),
        code,
        '',
        `${fg(hex.amber500)('➜')} ${muted(target)}`,
        ...(urls.network ? [`${dim('➜')} ${dim(urls.local)}`] : []),
    ]
    return beside(['', ...qr.map((l) => ` ${l}`)], info)
}

// ---------------------------------------------------------------------------------------------
// E. Quiet: two lines, for people who only want the URL

function quiet(urls: Urls): string[] {
    const card = shuffled()[0]
    const cat = categories[card.category]
    return [
        `  ${wordmark()}  ${fg(hex.amber500)('➜')} ${muted(urls.local)}` +
            (urls.network ? dim(`  ·  ${urls.network}`) : ''),
        `  ${dim(muted('dealt'))} ${fg(cat.colour)(cat.glyph)} ${plain(card.text)}, ${fg(cat.colour)(bold(String(card.year)))}`,
    ]
}

// ---------------------------------------------------------------------------------------------
// Switching

export const variants = {
    A: 'The deal',
    B: 'The timeline',
    C: 'The table',
    D: 'The lobby',
    E: 'Quiet',
} as const
export type Variant = keyof typeof variants

/** Draws a variant. `write` replaces the previous frame, for the animated ones. */
export async function render(
    variant: Variant,
    urls: Urls,
    write: (lines: string[]) => void,
    animate = true,
) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    if (variant === 'A') return deal(urls, write, animate)
    if (variant === 'B') {
        const hand = spreadHand()
        write(timeline(urls, false, hand))
        if (!animate) return
        await sleep(1800)
        return write(timeline(urls, true, hand))
    }
    if (variant === 'C') return write(table(urls))
    if (variant === 'D') return write(lobby(urls))
    return write(quiet(urls))
}

/** A writer that redraws in place by moving the cursor back up over the previous frame. */
export function inPlaceWriter(out = process.stdout) {
    let height = 0
    return (lines: string[]) => {
        if (height) out.write(`\x1b[${height}A`)
        out.write(lines.map((l) => `\x1b[2K${l}`).join('\n') + '\n')
        height = lines.length
    }
}

/** Vite plugin: `WT_BANNER=A vp dev` replaces Vite's URL print-out with variant A. */
export function devBannerPrototype(): Plugin {
    return {
        name: 'when-then:dev-banner-prototype',
        apply: 'serve',
        configureServer(server) {
            const variant = process.env.WT_BANNER?.toUpperCase() as Variant | undefined
            if (!variant || !(variant in variants)) return
            let drawn: Promise<void> = Promise.resolve()
            server.printUrls = () => {
                const urls = server.resolvedUrls
                const write = inPlaceWriter()
                process.stdout.write('\n')
                drawn = render(
                    variant,
                    {
                        local: urls?.local[0] ?? 'http://localhost:5173/',
                        network: urls?.network[0],
                    },
                    write,
                )
            }
            // Vite prints "press h + enter" right after the URLs; hold it until the animation is
            // done, or it lands inside the frame being redrawn.
            const bind = server.bindCLIShortcuts.bind(server)
            server.bindCLIShortcuts = (options) => void drawn.then(() => bind(options))
        },
    }
}

// ---------------------------------------------------------------------------------------------
// Standalone viewer: `vpr prototype:banner [A-E]`, ← → to flip, r to redeal, q to quit

function lanUrl(): string | undefined {
    const address = Object.values(networkInterfaces())
        .flat()
        .find((i) => i?.family === 'IPv4' && !i.internal)?.address
    return address && `http://${address}:5173/`
}

if (import.meta.main) {
    const urls = {
        local: 'http://localhost:5173/',
        network: process.argv.includes('--local') ? undefined : lanUrl(),
    }
    const keys = Object.keys(variants) as Variant[]
    const arg = process.argv[2]?.toUpperCase() as Variant | undefined
    let index = Math.max(0, keys.indexOf(arg ?? 'A'))

    if (!process.stdout.isTTY || !process.stdin.isTTY) {
        for (const key of arg ? [arg] : keys) {
            console.log(`\n--- ${key} · ${variants[key]} ---\n`)
            await render(key, urls, (l) => console.log(l.join('\n')), false)
        }
        process.exit(0)
    }

    let run = 0
    const show = async () => {
        const mine = ++run
        process.stdout.write('\x1b[2J\x1b[H\x1b[?25l')
        const bar = bg(hex.paper50)(
            fg(hex.ink900)(` ◀  ${keys[index]} · ${variants[keys[index]]}  ▶ `),
        )
        console.log(`\n  ${dim('PROTOTYPE')}  ${bar}  ${dim('← → flip · r redeal · q quit')}\n`)
        console.log(dim('  VITE v8 ready in 412 ms') + '\n')
        const write = inPlaceWriter()
        await render(keys[index], urls, (lines) => mine === run && write(lines))
    }
    process.stdin.setRawMode(true)
    process.stdin.on('data', (key) => {
        const k = key.toString()
        if (k === 'q' || k === '\x03') {
            process.stdout.write('\x1b[?25h\n')
            process.exit(0)
        }
        if (k === '\x1b[C') index = (index + 1) % keys.length
        if (k === '\x1b[D') index = (index - 1 + keys.length) % keys.length
        if (['\x1b[C', '\x1b[D', 'r'].includes(k)) void show()
    })
    void show()
}
