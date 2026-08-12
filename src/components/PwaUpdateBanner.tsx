import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePwaUpdate } from '@/lib/pwa-lifecycle'

export function PwaUpdateBanner() {
  const { updateAvailable, applyUpdate, dismissUpdate } = usePwaUpdate()

  if (!updateAvailable) return null

  return (
    <section
      aria-label="Atualização disponível"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 shadow-sm dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-100 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <RefreshCw aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Nova versão disponível</p>
          <p className="text-sm text-blue-800 dark:text-blue-200">Atualize quando puder interromper o trabalho atual.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" onClick={applyUpdate}>Atualizar agora</Button>
        <Button type="button" size="sm" variant="ghost" onClick={dismissUpdate}>Depois</Button>
      </div>
    </section>
  )
}
