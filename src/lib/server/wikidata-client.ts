// The real Wikidata lookup for date suggestions: global fetch against the public API, or the
// stub that e2e sets with WIKIDATA_API_URL.

import { WIKIDATA_API_URL } from '$app/env/private'
import { lookupWikidata, wikidataApiUrl, type WikidataLookup } from './wikidata'

export const wikidataLookup =
    () =>
    (subject: string): Promise<WikidataLookup> =>
        lookupWikidata({ fetch, apiUrl: WIKIDATA_API_URL ?? wikidataApiUrl }, subject)
