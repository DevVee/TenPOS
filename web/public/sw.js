// TenPOS Service Worker — v2
// Key fix: HTML navigation requests are ALWAYS fetched from network (never cached).
// Only hashed /assets/* chunks are cached (Vite content-hashes guarantee freshness).
// Bumping CACHE_VERSION busts all old caches on activate.

const CACHE_VERSION = 'v2'
const CACHE_NAME    = `tenpos-${CACHE_VERSION}`
const API_CACHE     = `tenpos-api-${CACHE_VERSION}`

// ─── Install: take over immediately, no shell pre-caching ────────────────────
self.addEventListener('install', (event) => {
  // Don't pre-cache anything — hashed assets cache on first use instead.
  // skipWaiting so this new SW activates immediately even if old tabs are open.
  event.waitUntil(Promise.resolve())
  self.skipWaiting()
})

// ─── Activate: delete ALL old caches, then claim all clients ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

// ─── Fetch: strategy per request type ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET
  if (request.method !== 'GET') return

  // ① HTML navigation requests — ALWAYS network first, no caching.
  //    This is the fix: index.html must always be fetched fresh so that
  //    a new Vercel deployment is immediately visible to all users.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() =>
          // Only fall back to cached index if truly offline
          caches.match('/index.html').then((r) => r ?? new Response('Offline', { status: 503 }))
        )
    )
    return
  }

  // ② Vite-hashed static assets (/assets/chunk-*.js, /assets/index-*.css …)
  //    Cache-first: Vite gives every chunk a content-hash filename.
  //    A new deploy produces new filenames → cache miss → network fetch → cached.
  //    Old filenames are simply never requested again.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME))
    return
  }

  // ③ Supabase API / REST calls — network first, short-lived cache fallback
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE))
    return
  }

  // ④ Everything else (icons, manifest, images) — network first
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r ?? new Response('Offline', { status: 503 })))
  )
})

// ─── Message: allow clients to force immediate SW takeover ───────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function cacheFirstWithNetwork(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
