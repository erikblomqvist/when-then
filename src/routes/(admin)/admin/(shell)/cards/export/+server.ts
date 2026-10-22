import { exportFileName, parseExportRequest } from '#lib/cards/card-export.js'
import { encodeExport, exportContentType, exportedCards } from '#lib/server/card-export.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { RequestEvent, RequestHandler } from './$types'

// Downloads cards as CSV or JSON, streamed. GET takes the card list's filter in the query
// (`exportHref`); POST takes form fields, for a selection of ids too long for a URL
// (`exportParams`). Editors and admins may export.
async function download(event: RequestEvent, fields: URLSearchParams) {
    await requireRole(event, 'editor')
    const { format, selection } = parseExportRequest(fields)
    const body = encodeExport(exportedCards(supabaseService(), selection), format)
    return new Response(body, {
        headers: {
            'content-type': exportContentType[format],
            'content-disposition': `attachment; filename="${exportFileName(format, new Date())}"`,
            'cache-control': 'no-store',
        },
    })
}

export const GET: RequestHandler = (event) => download(event, event.url.searchParams)

export const POST: RequestHandler = async (event) => {
    const fields = new URLSearchParams()
    for (const [name, value] of await event.request.formData()) {
        if (typeof value === 'string') fields.append(name, value)
    }
    return download(event, fields)
}
