const CACHE = 'dragram-v1'
const SHELL = ['/', '/manifest.json', '/icon.svg']

// Install — кэшируем оболочку, но НЕ вызываем skipWaiting
// (без него SW не перехватывает страницу принудительно → нет мигания)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  )
})

// Activate — чистим старые кэши, но НЕ вызываем clients.claim
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
})

// Fetch — сеть прежде всего, кэш как fallback
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/auth/') || e.request.url.includes('/chats/') || e.request.url.includes('/push/')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})
