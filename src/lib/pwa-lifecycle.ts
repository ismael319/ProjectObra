import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

let registration: ServiceWorkerRegistration | null = null
let waitingWorker: ServiceWorker | null = null
let dismissedWorker: ServiceWorker | null = null
let reloading = false
let version = 0

function notify() {
  version += 1
  listeners.forEach((listener) => listener())
}

function setWaitingWorker(worker: ServiceWorker | null) {
  waitingWorker = worker
  dismissedWorker = null
  notify()
}

function watchRegistration(nextRegistration: ServiceWorkerRegistration) {
  registration = nextRegistration

  if (nextRegistration.waiting && navigator.serviceWorker.controller) {
    setWaitingWorker(nextRegistration.waiting)
  }

  nextRegistration.addEventListener('updatefound', () => {
    const installingWorker = nextRegistration.installing
    if (!installingWorker) return

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        setWaitingWorker(nextRegistration.waiting ?? installingWorker)
      }
    })
  })
}

async function updateRegistration() {
  if (!registration || !navigator.onLine) return
  await registration.update().catch(() => {})
}

export function registerPwa() {
  if (!('serviceWorker' in navigator)) return

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((item) => item.unregister()))
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(watchRegistration)
      .catch(() => {})
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void updateRegistration()
  })
  window.addEventListener('online', () => void updateRegistration())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return version
}

export function usePwaUpdate() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    updateAvailable: !!waitingWorker && waitingWorker !== dismissedWorker,
    applyUpdate: () => waitingWorker?.postMessage({ type: 'SKIP_WAITING' }),
    dismissUpdate: () => {
      dismissedWorker = waitingWorker
      notify()
    },
  }
}
