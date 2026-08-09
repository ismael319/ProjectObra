import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { FILTERABLE_WIDGETS, type WidgetFiltros, type WidgetId } from '@/lib/dashboard-config'
import ColumnValueFilter from '@/components/ColumnValueFilter'
import type { CronogramaInfo } from '@/lib/project-store'
import { useMediaQuery } from '@/lib/use-media-query'

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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const isMobile = useMediaQuery('(max-width: 639px)')
  const [pos, setPos] = useState({ x, y })
  const arrastando = useRef<{ offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isMobile) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      openerRef.current?.focus()
    }
  }, [isMobile])

  // Reabre na posição do clique, mas empurra pra dentro da tela se isso jogar
  // o menu pra fora da viewport (ex.: clique perto da borda direita) — só
  // recalcula quando x/y realmente mudam (reabertura em outro card), não a
  // cada re-render enquanto o usuário arrasta.
  useLayoutEffect(() => {
    if (isMobile) return
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
  }, [x, y, isMobile])

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
    if (isMobile) return
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
      className="mobile-widget-filter-menu fixed z-50 min-w-[min(260px,calc(100vw-1rem))] max-w-[min(300px,calc(100vw-1rem))] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={isMobile ? undefined : { left: pos.x, top: pos.y }}
      role={isMobile ? 'dialog' : undefined}
      aria-labelledby={isMobile ? `widget-filter-title-${widgetId}` : undefined}
    >
      <div
        onMouseDown={iniciarArrasto}
        className="-mx-3 -mt-2 mb-2 flex min-h-11 select-none items-center gap-1.5 border-b border-gray-100 px-3 pt-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400 sm:min-h-0 sm:cursor-move"
      >
        <GripVertical size={12} className="hidden shrink-0 sm:block" />
        <span id={`widget-filter-title-${widgetId}`} className="min-w-0 flex-1 truncate">Filtros — {widgetLabel}</span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 sm:hidden"
          aria-label="Fechar filtros"
        >
          <X size={18} />
        </button>
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
                className="mt-1 min-h-11 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 sm:min-h-0"
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
