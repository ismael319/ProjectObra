import { Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/lib/pwa-install'

export function PwaInstallBanner() {
  const { canInstall, installApp, dismissInstall } = usePwaInstall()

  if (!canInstall) return null

  return (
    <section
      aria-label="Instalar aplicativo"
      className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950 shadow-sm dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-100 sm:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
          <Smartphone aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Instale o SIGA SOLUÇÕES</p>
          <p className="mt-1 text-sm text-violet-800 dark:text-violet-200">
            Acesse pela tela inicial e tenha uma experiência de aplicativo no celular.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => void installApp()}>
              <Download aria-hidden="true" />
              Instalar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-violet-800 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-200 dark:hover:bg-violet-900/60 dark:hover:text-white" onClick={dismissInstall}>
              Agora não
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
