import { Loader2, Trash2 } from 'lucide-react'
import { useFotoDashboardUrl } from '@/lib/dashboard-fotos-db'

export default function PhotoWidgetCard({
  path,
  legenda,
  editando,
  onExcluir,
  onLegendaChange,
}: {
  path: string
  legenda?: string
  editando: boolean
  onExcluir: () => void
  onLegendaChange: (legenda: string) => void
}) {
  const { data: url, isLoading } = useFotoDashboardUrl(path)

  return (
    <div className="group relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {isLoading || !url ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={18} className="animate-spin text-gray-300" />
        </div>
      ) : (
        <img src={url} alt={legenda ?? 'Foto'} className="h-full w-full object-cover" />
      )}

      {legenda && !editando && (
        <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-[11px] text-white">{legenda}</p>
      )}

      {editando && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/60 p-1.5">
          <input
            value={legenda ?? ''}
            onChange={(e) => onLegendaChange(e.target.value)}
            placeholder="Legenda (opcional)"
            className="min-w-0 flex-1 rounded bg-white/90 px-1.5 py-1 text-[11px] text-gray-900 outline-none placeholder:text-gray-400"
          />
          <button
            onClick={onExcluir}
            title="Excluir foto"
            className="shrink-0 rounded p-1 text-white hover:bg-red-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
