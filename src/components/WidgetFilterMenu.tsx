import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { FILTERABLE_WIDGETS, type WidgetFiltros, type WidgetId } from '@/lib/dashboard-config'
import ColumnValueFilter from '@/components/ColumnValueFilter'
import type { CronogramaInfo } from '@/lib/project-store'

type Props = {
  x: number
  y: number
  widgetId: WidgetId
  widgetLabel: string
  cronogramasAtivos: CronogramaInfo[]
  filtros: WidgetFiltros
  onChange: (filtros: WidgetFiltros) => void
  onClose: () => void
}

export default function WidgetFilterMenu({
  x,
  y,
  widgetLabel,
  widgetId,
  cronogramasAtivos,
  filtros,
  onChange,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const arrastando = useRef<{ offsetX: number; offsetY: number } | null>(null)

  // Reabre na posição do clique, mas empurra pra dentro da tela se isso jogar
  // o menu pra fora da viewport (ex.: clique perto da borda direita) — só
  // recalcula quando x/y realmente mudam (reabertura em outro card), não a
  // cada re-render enquanto o usuário arrasta.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      setPos({ x, y })
      return
    }
    const rect = el.getBoundingClientRect()
    const margem = 8
    const nx = Math.min(x, Math.max(margem, window.innerWidth - rect.width - margem))
    const ny = Math.min(y, Math.max(margem, window.innerHeight - rect.height - margem))
    setPos({ x: nx, y: ny })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('contextmenu', handler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('contextmenu', handler)
    }
  }, [onClose])

  const iniciarArrasto = (e: React.MouseEvent) => {
    e.preventDefault()
    arrastando.current = { offsetX: e.clientX - pos.x, offsetY: e.clientY - pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!arrastando.current) return
      setPos({ x: ev.clientX - arrastando.current.offsetX, y: ev.clientY - arrastando.current.offsetY })
    }
    const onUp = () => {
      arrastando.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const suportaFiltros = FILTERABLE_WIDGETS.includes(widgetId)

  // Só os cronogramas que entram no cálculo deste card — quando um cronograma
  // específico está selecionado, as colunas/valores disponíveis vêm só dele
  // (mesmo comportamento da Curva S: sources = cronogramas selecionados).
  const cronogramasRelevantes =
    filtros.cronograma === 'todos' ? cronogramasAtivos : cronogramasAtivos.filter((_, idx) => idx === filtros.cronograma)

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-2 px-3 min-w-[min(260px,calc(100vw-1rem))] max-w-[min(300px,calc(100vw-1rem))]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onMouseDown={iniciarArrasto}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pb-2 mb-2 border-b border-gray-100 dark:border-gray-700 cursor-move select-none -mx-3 -mt-2 px-3 pt-2"
      >
        <GripVertical size={12} className="shrink-0" />
        Filtros — {widgetLabel}
      </div>

      {!suportaFiltros ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
          Este card não possui filtros disponíveis (não usa dados do cronograma).
        </p>
      ) : (
        <div className="space-y-3">
          {cronogramasAtivos.length > 1 && (
            <label className="block text-xs text-gray-600 dark:text-gray-300">
              Cronograma
              <select
                value={filtros.cronograma}
                onChange={(e) =>
                  onChange({ ...filtros, cronograma: e.target.value === 'todos' ? 'todos' : Number(e.target.value) })
                }
                className="mt-1 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos os cronogramas</option>
                {cronogramasAtivos.map((c, idx) => (
                  <option key={c.id} value={idx}>{c.nome}</option>
                ))}
              </select>
            </label>
          )}

          {cronogramasRelevantes.length > 0 ? (
            <ColumnValueFilter
              sources={cronogramasRelevantes.map((c) => ({
                activities: c.dados?.activities || [],
                customFieldDefs: c.dados?.customFieldDefs || [],
              }))}
              filters={filtros.colunas}
              onChange={(colunas) => onChange({ ...filtros, colunas })}
            />
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-1">Nenhum cronograma disponível para filtrar.</p>
          )}
        </div>
      )}
    </div>
  )
}
