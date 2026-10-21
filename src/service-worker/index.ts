// PWA baseline: precache the build and static assets, serve them cache-first, and fall back
// to the cache for anything else when the network is down. SvelteKit registers this file
// automatically. Game state is never cached: it comes from server routes per seat, and
// /admin is left to the network entirely.
//
// Not yet decided (map, "PWA specifics"): install prompt, offline screens, how far
// app-like goes on iOS. Keep this file small until those land.

import { version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'
import { serviceWorkerHandles } from '#lib/offline.js'

const CACHE = `when-then-${version}`
const PRECACHE = [...immutable.map((f) => f.path), ...assets.map((f) => f.path)]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
            )
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return

    const url = new URL(event.request.url)
    if (url.origin !== self.location.origin) return
    // The admin goes straight to the network and is never cached.
    if (!serviceWorkerHandles(url.pathname)) return

    // Hashed build output and static files: cache first.
    if (PRECACHE.includes(url.pathname)) {
        event.respondWith(
            caches
                .open(CACHE)
                .then(async (cache) => (await cache.match(url.pathname)) ?? fetch(event.request)),
        )
        return
    }

    // Everything else: network first, cached copy if offline.
    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            try {
                const response = await fetch(event.request)
                if (response.ok && event.request.mode === 'navigate') {
                    void cache.put(event.request, response.clone())
                }
                return response
            } catch (error) {
                const cached = await cache.match(event.request)
                if (cached) return cached
                throw error
            }
        }),
    )
})
