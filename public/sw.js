/* RoadWatch service worker.
 *
 * - App shell and built assets: cached so the app opens offline.
 * - Map tiles: cached as they are viewed (bounded), so previously seen areas still render.
 * - /api requests are NEVER cached here. The app keeps its own labelled copy of the last
 *   incident data so stale information is always shown with a timestamp.
 */
const VERSION = 'v2'
const SHELL = `roadwatch-shell-${VERSION}`
const ASSETS = `roadwatch-assets-${VERSION}`
const TILES = `roadwatch-tiles-${VERSION}`
const MAX_TILES = 400

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('roadwatch-') && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // Map tiles: cache first, fill on miss.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        try {
          const res = await fetch(req)
          if (res.ok) {
            cache.put(req, res.clone())
            trim(TILES, MAX_TILES)
          }
          return res
        } catch {
          return new Response('', { status: 504 })
        }
      }),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Page navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Built assets are content-hashed, so a cached copy is always correct: serve it and refresh in the background.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || network
      }),
    )
    return
  }

  // Everything else (images, icons, manifest): network first so edits show up, cached copy only when offline.
  // HTML is never stored under a non-page URL, so a missing file can't be cached as a fake image.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const type = res.headers.get('content-type') || ''
        if (res.ok && !type.includes('text/html')) {
          const copy = res.clone()
          caches.open(ASSETS).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  )
})
