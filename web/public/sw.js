const CACHE_VERSION = 'mentormind-pwa-v2'
const STATIC_CACHE = `${CACHE_VERSION}:static`
const OFFLINE_URL = '/offline.html'

const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.json',
  '/favicon.jpg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('mentormind-pwa-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

function isStaticRequest(requestUrl) {
  return (
    requestUrl.origin === self.location.origin &&
    (
      requestUrl.pathname.startsWith('/_next/static/') ||
      requestUrl.pathname === '/manifest.json' ||
      requestUrl.pathname === '/favicon.jpg' ||
      requestUrl.pathname.endsWith('.png') ||
      requestUrl.pathname.endsWith('.jpg') ||
      requestUrl.pathname.endsWith('.jpeg') ||
      requestUrl.pathname.endsWith('.webp') ||
      requestUrl.pathname.endsWith('.svg') ||
      requestUrl.pathname.endsWith('.woff') ||
      requestUrl.pathname.endsWith('.woff2')
    )
  )
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function navigationNetworkFirst(request) {
  try {
    return await fetch(request)
  } catch {
    return caches.match(OFFLINE_URL)
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request))
    return
  }

  if (isStaticRequest(requestUrl)) {
    event.respondWith(cacheFirst(request))
  }
})
