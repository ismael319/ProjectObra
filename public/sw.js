const CACHE_NAME = 'obracontrol-v3'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request))
    return
  }

  // Navegação de página (recarregar/abrir qualquer rota do React Router) —
  // sem isso, offline sempre cai em erro de rede em vez de servir o shell
  // cacheado e deixar o roteador do lado do cliente assumir.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => cached)

      return fetched
    })
  )
})

// Background Sync (tela de lançamento de campo) — não chama o Supabase daqui
// (evitaria duplicar autenticação/lógica no service worker); só avisa as
// páginas abertas pra elas mesmas tentarem sincronizar a fila local.
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-lancamentos') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'FLUSH_QUEUE' }))
      })
    )
  }
})
