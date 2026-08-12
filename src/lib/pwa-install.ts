import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'fgi-pwa-install-dismissed'
const listeners = new Set<() => void>()

let installPrompt: BeforeInstallPromptEvent | null = null
let started = false
let version = 0

function isStandalone() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

let installed = isStandalone()
let dismissed = typeof window !== 'undefined' && wasDismissed()

function notify() {
  version += 1
  listeners.forEach((listener) => listener())
}

export function startPwaInstallCapture() {
  if (started || typeof window === 'undefined') return
  started = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    installPrompt = null
    try {
      localStorage.removeItem(DISMISSED_KEY)
    } catch { /* armazenamento indisponível não impede a instalação */ }
    notify()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return version
}

export function usePwaInstall() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const installApp = async () => {
    if (!installPrompt) return 'unavailable' as const
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    installPrompt = null
    if (outcome === 'accepted') installed = true
    notify()
    return outcome
  }

  const dismissInstall = () => {
    dismissed = true
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch { /* o banner só poderá reaparecer em outra sessão */ }
    notify()
  }

  return {
    canInstall: !!installPrompt && !dismissed && !installed,
    installApp,
    dismissInstall,
  }
}
