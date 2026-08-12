const CACHE_PREFIX = 'obracontrol-'
const CACHE_NAME = `${CACHE_PREFIX}__BUILD_VERSION__`
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-maskable-192.png',
  '/pwa-icons/icon-maskable-512.png',
  '/pwa-icons/apple-touch-icon.png',
]

// Arquivo com hash no nome (Vite gera "algo-<hash>.js") — o conteúdo nunca
// muda sem o nome do arquivo mudar junto, então é seguro (e bem mais rápido)
// responder direto do cache sem nem esperar a rede. Pra tudo o mais (HTML de
// navegação, chamadas de API) mantém rede-primeiro: servir um index.html
// desatualizado depois de um deploy apontaria pra chunks antigos já
// apagados do servidor.
function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Dados autenticados e recursos externos não pertencem ao cache do shell.
  if (url.origin !== self.location.origin) return

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request))
    return
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
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
      }).catch(async () => {
        // fetch falhou de vez (offline, erro de rede) — usa o cache dessa URL
        // exata se tiver. Se não tiver (rota nova, nunca cacheada — ex.:
        // "/admin" logo após o deploy), "cached" vem undefined; pra navegação
        // de página cai pro index.html cacheado, deixando o React Router
        // assumir a rota no cliente. Sem esse fallback, respondWith recebia
        // "undefined" e o navegador acusava "Failed to convert value to
        // 'Response'".
        if (cached) return cached
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/index.html')
          if (fallback) return fallback
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      })

      return fetched
    })
  )
})
