import { useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/lib/offline-query'
import { useProjects } from '@/lib/project-store'

function formatUpdatedAt(timestamp: number) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp))
}

export function OfflineBanner() {
  const online = useOnlineStatus()
  const { usingOfflineCache, offlineDataUpdatedAt } = useProjects()
  const previousOnline = useRef(online)

  useEffect(() => {
    if (!previousOnline.current && online) toast.success('Conexão restabelecida. Atualizando os dados...')
    previousOnline.current = online
  }, [online])

  if (online && !usingOfflineCache) return null

  const updatedText = offlineDataUpdatedAt
    ? ` Última atualização: ${formatUpdatedAt(offlineDataUpdatedAt)}.`
    : ''

  return (
    <section
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{online ? 'Conexão instável' : 'Você está offline'}</p>
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Exibindo os dados disponíveis neste dispositivo.{updatedText}
        </p>
      </div>
    </section>
  )
}
