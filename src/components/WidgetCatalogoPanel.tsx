import { Plus, LayoutGrid } from 'lucide-react'
import type { WidgetTipo } from '@/lib/dashboard-widgets-db'

export default function WidgetCatalogoPanel({
  catalogo,
  adicionados,
  onAdicionar,
}: {
  catalogo: WidgetTipo[]
  adicionados: string[]
  onAdicionar: (tipo: WidgetTipo) => void
}) {
  const disponiveis = catalogo.filter((t) => t.codigo !== 'FOTO' && t.status !== 'planejado' && !adicionados.includes(t.codigo))
  const emBreve = catalogo.filter((t) => t.status === 'planejado')

  return (
    <div className="w-full space-y-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900 lg:w-64">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <LayoutGrid size={13} /> Catálogo de widgets
      </p>

      {disponiveis.length === 0 && emBreve.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Todos os widgets disponíveis já estão no seu dashboard.</p>
      )}

      <div className="space-y-2">
        {disponiveis.map((t) => (
          <button
            key={t.codigo}
            onClick={() => onAdicionar(t)}
            className="flex w-full items-start justify-between gap-2 rounded-lg bg-white p-2.5 text-left transition hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-950/40"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{t.nome}</p>
              {t.descricao && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-400 dark:text-gray-500">{t.descricao}</p>}
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-blue-600 p-1 text-white">
              <Plus size={11} />
            </span>
          </button>
        ))}
      </div>

      {emBreve.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Em breve</p>
          {emBreve.map((t) => (
            <div key={t.codigo} className="rounded-lg bg-white/60 p-2 text-[11px] text-gray-400 dark:bg-gray-800/60 dark:text-gray-500">
              {t.nome}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
