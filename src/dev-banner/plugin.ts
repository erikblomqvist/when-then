// Prints the banner when `vp dev` starts, in place of Vite's list of URLs. Only in a terminal:
// piped or logged output (CI, Playwright's web server) keeps Vite's plain lines. NO_COLOR keeps the
// layout without colours.

import type { Plugin } from 'vite'
import { banner, dealHand, type Urls } from './banner'

/** How long the dealt card's year stays hidden. */
const revealAfter = 1800

export function devBanner(): Plugin {
    return {
        name: 'when-then:dev-banner',
        apply: 'serve',
        configureServer(server) {
            if (!process.stdout.isTTY) return
            const printUrls = server.printUrls.bind(server)
            let drawn = Promise.resolve()
            server.printUrls = () => {
                const urls = server.resolvedUrls
                if (!urls?.local[0]) return printUrls()
                drawn = draw({ local: urls.local[0], network: urls.network[0] })
            }
            // Vite prints "press h + enter" right after the URLs; hold it until the year has
            // turned over, or it would sit inside the lines being redrawn.
            const bindCLIShortcuts = server.bindCLIShortcuts.bind(server)
            server.bindCLIShortcuts = (options) => void drawn.then(() => bindCLIShortcuts(options))
        },
    }
}

async function draw(urls: Urls) {
    const { hand, anchor } = dealHand()
    const colour = !process.env.NO_COLOR
    const lines = (revealed: boolean) => banner({ urls, hand, anchor, revealed, colour })

    const hidden = lines(false)
    process.stdout.write(`\n${hidden.join('\n')}\n`)
    const interrupted = watchOutput()
    await new Promise((resolve) => setTimeout(resolve, revealAfter))
    // Something else printed below the banner, so moving the cursor back up would draw over it.
    if (interrupted()) return
    const up = `\u001b[${hidden.length}A`
    const clear = '\u001b[2K'
    process.stdout.write(
        up +
            lines(true)
                .map((l) => clear + l)
                .join('\n') +
            '\n',
    )
}

/** Starts noticing writes to stdout and stderr; the returned function stops and tells. */
function watchOutput(): () => boolean {
    let written = false
    const streams = [process.stdout, process.stderr]
    const originals = streams.map((stream) => stream.write)
    streams.forEach((stream, i) => {
        stream.write = ((...args: Parameters<typeof stream.write>) => {
            written = true
            return originals[i].apply(stream, args)
        }) as typeof stream.write
    })
    return () => {
        streams.forEach((stream, i) => (stream.write = originals[i]))
        return written
    }
}
