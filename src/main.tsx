import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { startPwaInstallCapture } from '@/lib/pwa-install'

startPwaInstallCapture()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

const fontLink = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com"]')
if (fontLink) {
  fontLink.addEventListener('load', () => {
    fontLink.media = 'all'
  })
}

if ('serviceWorker' in navigator) {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
  }
}
