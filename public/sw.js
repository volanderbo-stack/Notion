// Офлайн-кеш. Після релізу змін — збільшити VERSION.
const VERSION = 'v2'
const CACHE = 'galereya-' + VERSION
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png']

// Файли збірки мають хеші в назвах — беремо їх зі свіжого index.html
async function precache() {
  const c = await caches.open(CACHE)
  await c.addAll(CORE)
  const html = await (await c.match('./index.html')).text()
  const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1])
  await c.addAll(assets)
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  // Сторінка: спершу мережа, без мережі — кеш
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Файли збірки й іконки: спершу кеш, потім мережа (і докласти в кеш)
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    }))
  )
})
