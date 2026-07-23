import { useMemo, useState } from 'react'
import { Loader2, Search, Clock, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatShortDate, parseISODateStr } from '@/lib/iso-week'
import { addActivitiesBulk } from '@/lib/programacao-db'
import type { WeekActivity } from '@/lib/week-activities'
import ColumnValueFilter, { computeColumnFilterExcludedUids, type ColumnFilterState } from '@/components/ColumnValueFilter'
import type { WBSActivity } from '@/lib/xml-parser'

interface ImportSource {
  id: string
  nome: string
  activities: WBSActivity[]
  customFieldDefs: { fieldId: string; name: string }[]
  availableBLIndices: number[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  activities: WeekActivity[]
  loading: boolean
  sources: ImportSource[]
  weekId: string
  weekDays: string[]
  onImported: () => void
}

function rowKey(a: WeekActivity): string {
  return `${a.cronogramaId}::${a.taskUid}`
}

// Dias (dentro da semana visível) em que a atividade importada deve aparecer no
// board — TODOS os dias que a janela [start, finish] da atividade sobrepõe, não só
// o primeiro: uma atividade que já estava em andamento, que começa no meio da
// semana, ou que termina nela, precisa aparecer em cada dia relevante (a iniciar,
// em andamento, a concluir), senão dias sem "primeiro overlap" ficam vazios mesmo
// tendo atividade ativa naquele dia.
function getOverlappingDays(a: WeekActivity, weekDays: string[]): string[] {
  const actStart = a.start.getTime()
  const actFinish = a.finish.getTime()
  const days = weekDays.filter((d) => {
    const dayStart = parseISODateStr(d).getTime()
    const dayEnd = dayStart + 86400000 - 1
    return actStart <= dayEnd && actFinish >= dayStart
  })
  return days.length > 0 ? days : [weekDays[0]]
}

function fmtDelay(days: number | null): { label: string; className: string } {
  if (days === null) return { label: '—', className: 'text-gray-400 dark:text-gray-500' }
  if (days > 0) return { label: `+${days}d`, className: 'text-red-600 dark:text-red-400 font-semibold' }
  if (days < 0) return { label: `${days}d`, className: 'text-green-600 dark:text-green-400 font-semibold' }
  return { label: 'No prazo', className: 'text-gray-500 dark:text-gray-400' }
}

export default function ModalImportarAtividades({
  open,
  onOpenChange,
  activities,
  loading,
  sources,
  weekId,
  weekDays,
  onImported,
}: Props) {
  const [expandedCronogramas, setExpandedCronogramas] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState[]>([])
  // Cada cronograma pode ter suas próprias baselines disponíveis — a LB de referência
  // pro cálculo de atraso é escolhida por cronograma, não uma só pra tudo.
  const [selectedBLByCronograma, setSelectedBLByCronograma] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)

  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])

  const getSelectedBL = (cronogramaId: string): number => {
    if (cronogramaId in selectedBLByCronograma) return selectedBLByCronograma[cronogramaId]
    return sourcesById.get(cronogramaId)?.availableBLIndices[0] ?? 0
  }

  const setSelectedBLFor = (cronogramaId: string, index: number) => {
    setSelectedBLByCronograma((prev) => ({ ...prev, [cronogramaId]: index }))
  }

  const excludedByCronograma = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const s of sources) map.set(s.id, computeColumnFilterExcludedUids(s.activities, columnFilters, s.customFieldDefs))
    return map
  }, [sources, columnFilters])

  const filteredActivities = activities.filter((a) => {
    if (excludedByCronograma.get(a.cronogramaId)?.has(a.taskUid)) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      a.taskName.toLowerCase().includes(term) ||
      a.wbs.toLowerCase().includes(term) ||
      a.cronogramaNome.toLowerCase().includes(term)
    )
  })

  const groupedByCronograma = filteredActivities.reduce((acc, a) => {
    if (!acc.has(a.cronogramaId)) {
      acc.set(a.cronogramaId, { nome: a.cronogramaNome, cor: a.cronogramaCor, activities: [] })
    }
    acc.get(a.cronogramaId)!.activities.push(a)
    return acc
  }, new Map<string, { nome: string; cor: string; activities: WeekActivity[] }>())

  const toggleExpand = (cronogramaId: string) => {
    setExpandedCronogramas((prev) => {
      const next = new Set(prev)
      if (next.has(cronogramaId)) next.delete(cronogramaId)
      else next.add(cronogramaId)
      return next
    })
  }

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAllInGroup = (groupActivities: WeekActivity[]) => {
    const keys = groupActivities.map(rowKey)
    const allSelected = keys.every((k) => selected.has(k))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (allSelected) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }

  const handleImport = async () => {
    const toImport = filteredActivities.filter((a) => selected.has(rowKey(a)))
    if (toImport.length === 0) return
    setImporting(true)
    try {
      const rows = toImport.flatMap((a) =>
        getOverlappingDays(a, weekDays).map((d) => ({
          weekId,
          planned_date: d,
          name: a.taskName,
          discipline: a.discipline || null,
          area: a.area || null,
          stage: a.wbs,
          foreman: a.responsible || null,
          observation: notes[rowKey(a)]?.trim() || null,
          isExtra: false,
          sourceCronograma: a.cronogramaNome,
          areaPath: a.areaPath || null,
        })),
      )
      await addActivitiesBulk(rows)
      toast.success(`${toImport.length} atividade(s) importada(s)`)
      setSelected(new Set())
      onImported()
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao importar atividades'
      toast.error(msg)
    } finally {
      setImporting(false)
    }
  }

  const formatWork = (minutes: number) => {
    const hours = minutes / 60
    if (hours >= 1) return `${hours.toFixed(1)}h`
    return `${minutes}min`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download size={18} />
            Importar Atividades
            {weekDays.length === 1 && (
              <span className="text-xs font-normal text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">
                Somente {formatShortDate(parseISODateStr(weekDays[0]))}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, EDT ou cronograma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <ColumnValueFilter sources={sources} filters={columnFilters} onChange={setColumnFilters} />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma atividade em andamento encontrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from(groupedByCronograma.entries()).map(([cronogramaId, group]) => {
                const isExpanded = expandedCronogramas.has(cronogramaId)
                const groupKeys = group.activities.map(rowKey)
                const allSelected = groupKeys.length > 0 && groupKeys.every((k) => selected.has(k))
                const sourceBLOptions = sourcesById.get(cronogramaId)?.availableBLIndices || []
                const currentBL = getSelectedBL(cronogramaId)
                return (
                  <div key={cronogramaId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                      <button
                        onClick={() => toggleExpand(cronogramaId)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-75 transition"
                      >
                        {isExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.cor }} />
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{group.nome}</span>
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        {group.activities.length} {group.activities.length === 1 ? 'atividade' : 'atividades'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">LB:</label>
                        <select
                          value={currentBL}
                          onChange={(e) => setSelectedBLFor(cronogramaId, parseInt(e.target.value))}
                          className="text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {(sourceBLOptions.length > 0 ? sourceBLOptions : [0]).map((i) => (
                            <option key={i} value={i}>BL{i}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500">
                              <th className="px-2 py-1.5 text-left">
                                <input type="checkbox" checked={allSelected} onChange={() => toggleSelectAllInGroup(group.activities)} className="w-3.5 h-3.5" />
                              </th>
                              <th className="px-2 py-1.5 text-left font-medium">EDT</th>
                              <th className="px-2 py-1.5 text-left font-medium">Área</th>
                              <th className="px-2 py-1.5 text-left font-medium">Atividade</th>
                              <th className="px-2 py-1.5 text-right font-medium">Avanço</th>
                              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Início</th>
                              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Término</th>
                              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Início LB</th>
                              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Término LB</th>
                              <th className="px-2 py-1.5 text-right font-medium">Atraso</th>
                              <th className="px-2 py-1.5 text-left font-medium min-w-[160px]">Informações complementares</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {group.activities.map((a) => {
                              const key = rowKey(a)
                              const bl = a.baselines[currentBL]
                              const delayDays = bl?.finish ? Math.round((a.finish.getTime() - bl.finish.getTime()) / 86400000) : null
                              const delay = fmtDelay(delayDays)
                              return (
                                <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                                  <td className="px-2 py-1.5">
                                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelected(key)} className="w-3.5 h-3.5" />
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{a.wbs}</td>
                                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={a.areaPath}>{a.areaPath || '—'}</td>
                                  <td className="px-2 py-1.5 text-gray-900 dark:text-white max-w-[220px] truncate" title={a.taskName}>{a.taskName}</td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                    {Math.round(a.percentComplete)}%
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatShortDate(a.start)}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatShortDate(a.finish)}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-500 whitespace-nowrap">{bl?.start ? formatShortDate(bl.start) : '—'}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-500 whitespace-nowrap">{bl?.finish ? formatShortDate(bl.finish) : '—'}</td>
                                  <td className={`px-2 py-1.5 text-right whitespace-nowrap ${delay.className}`}>{delay.label}</td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={notes[key] || ''}
                                      onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                                      placeholder="Observação..."
                                      className="w-full min-w-[150px] px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && filteredActivities.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {filteredActivities.length} {filteredActivities.length === 1 ? 'atividade' : 'atividades'} ·{' '}
              {formatWork(filteredActivities.reduce((sum, a) => sum + a.work, 0))} · {selected.size} selecionada(s)
            </div>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Importar Selecionadas
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
