import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { startPwaInstallCapture } from '@/lib/pwa-install'
import { registerPwa } from '@/lib/pwa-lifecycle'

startPwaInstallCapture()
registerPwa()

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
