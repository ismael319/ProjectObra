import { createRoot } from 'react-dom/client'
import './index.css'
// Fontes das assinaturas (ver lib/assinatura.ts). Instaladas junto com o app em
// vez de baixadas de fora: o canteiro tem internet ruim, e a exportação de
// imagem/PDF captura a tela — fonte que não carregou sairia na letra padrão
// justo no documento que vai ser impresso. Só o peso 400, que é o único usado.
import '@fontsource/dancing-script/400.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/caveat/400.css'
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
