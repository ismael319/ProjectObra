import { useEffect, useMemo, useState } from 'react'
import { useProject } from '@/lib/project-context'
import { Search, ChevronRight, ChevronDown, CheckCircle, Clock, AlertTriangle, Pause } from 'lucide-react'
import { toDate } from '@/lib/utils'
import type { WBSActivity } from '@/lib/xml-parser'
import { useMediaQuery } from '@/lib/use-media-query'
import { getActivityKey, getActivityStatus, getDaysLate, isActivityLate } from '@/lib/dashboard-insights'
import { useToday } from '@/lib/use-today'

// Cada arquivo de cronograma numera o WBS a partir de "1", então "1.9" de um
// cronograma pode colidir com "1.9" de outro quando vários estão mesclados
// (sourceCronogramaIndex desambigua) — sem isso, expandir um nó num
// cronograma expandia "de graça" o nó de mesmo código nos outros também.
function chaveWbs(a: { wbs: string; sourceCronogramaIndex?: number }): string {
  return `${a.sourceCronogramaIndex ?? 0}::${a.wbs}`
}

type Props = {
  // Sobrescreve as atividades usadas na tabela (ex.: filtro por
  // cronograma/disciplina configurado por card na Visão Geral) — sem isso,
  // sempre usa o projeto inteiro.
  activities?: WBSActivity[]
  quickFilter?: WbsQuickFilter
  onQuickFilterChange?: (filter: WbsQuickFilter) => void
  searchResetKey?: number
}

export type WbsQuickFilter = 'todas' | 'atrasadas' | 'em-andamento' | 'concluidas'

const QUICK_FILTER_LABELS: Record<WbsQuickFilter, string> = {
  todas: 'Todas',
  atrasadas: 'Atrasadas',
  'em-andamento': 'Em andamento',
  concluidas: 'Concluídas',
}

export default function WbsTable({ activities: activitiesProp, quickFilter: controlledQuickFilter, onQuickFilterChange, searchResetKey }: Props = {}) {
  const { activities: activitiesContexto } = useProject()
  const activities = activitiesProp ?? activitiesContexto
  const isMobile = useMediaQuery('(max-width: 639px)')
  const today = useToday()
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(['']))
  const [search, setSearch] = useState('')
  const [internalQuickFilter, setInternalQuickFilter] = useState<WbsQuickFilter>('todas')
  const quickFilter = controlledQuickFilter ?? internalQuickFilter

  useEffect(() => {
    if (searchResetKey !== undefined) setSearch('')
  }, [searchResetKey])

  const changeQuickFilter = (filter: WbsQuickFilter) => {
    if (onQuickFilterChange) onQuickFilterChange(filter)
    else setInternalQuickFilter(filter)
  }

  const toggleWbs = (chave: string) => {
    setExpandedWbs((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  const statusCounts = useMemo(() => {
    const leafActivities = activities.filter((activity) => !activity.isSummary)
    return {
      todas: leafActivities.length,
      atrasadas: leafActivities.filter((activity) => getActivityStatus(activity, today) === 'atrasada').length,
      'em-andamento': leafActivities.filter((activity) => getActivityStatus(activity, today) === 'em-andamento').length,
      concluidas: leafActivities.filter((activity) => getActivityStatus(activity, today) === 'concluida').length,
    }
  }, [activities, today])

  const hasActiveFilter = search.trim().length > 0 || quickFilter !== 'todas'

  const filteredActivities = useMemo(() => {
    if (!hasActiveFilter) return activities

    const normalizedSearch = search.trim().toLowerCase()
    const bySourceAndWbs = new Map(
      activities.map((activity) => [`${activity.sourceCronogramaIndex ?? 0}::${activity.wbs}`, activity]),
    )
    const includedKeys = new Set<string>()

    for (const activity of activities) {
      const matchesSearch = !normalizedSearch || activity.name.toLowerCase().includes(normalizedSearch) || activity.wbs.toLowerCase().includes(normalizedSearch)
      const status = getActivityStatus(activity, today)
      const matchesQuickFilter = quickFilter === 'todas' || (
        !activity.isSummary && (
          (quickFilter === 'atrasadas' && status === 'atrasada') ||
          (quickFilter === 'em-andamento' && status === 'em-andamento') ||
          (quickFilter === 'concluidas' && status === 'concluida')
        )
      )
      if (!matchesSearch || !matchesQuickFilter) continue

      includedKeys.add(getActivityKey(activity))
      const parts = activity.wbs.split('.')
      for (let index = 1; index < parts.length; index++) {
        const parent = bySourceAndWbs.get(`${activity.sourceCronogramaIndex ?? 0}::${parts.slice(0, index).join('.')}`)
        if (parent) includedKeys.add(getActivityKey(parent))
      }
    }

    return activities.filter((activity) => includedKeys.has(getActivityKey(activity)))
  }, [activities, hasActiveFilter, quickFilter, search, today])

  const nodesWithChildren = useMemo(() => {
    const keys = new Set<string>()
    for (const activity of activities) {
      const parts = activity.wbs.split('.')
      for (let index = 1; index < parts.length; index++) {
        keys.add(`${activity.sourceCronogramaIndex ?? 0}::${parts.slice(0, index).join('.')}`)
      }
    }
    return keys
  }, [activities])

  const visibleActivities = useMemo(() => {
    if (hasActiveFilter) return filteredActivities
    return filteredActivities.filter((a) => {
      if (a.outlineLevel <= 1) return true
      const cronogramaIdx = a.sourceCronogramaIndex ?? 0
      const parts = a.wbs.split('.')
      for (let i = 1; i < parts.length; i++) {
        const parentWbs = parts.slice(0, i).join('.')
        if (!expandedWbs.has(`${cronogramaIdx}::${parentWbs}`)) return false
      }
      return true
    })
  }, [filteredActivities, expandedWbs, hasActiveFilter])

  // Quantos filhos cada nó tem, pré-calculado uma vez — em vez de escanear a
  // lista inteira (some) para cada linha, que ficava O(n²) e travava com
  // cronogramas grandes. Um nó nunca conta a si mesmo: só ancestrais estritos
  // (prefixos "1.1" → "1.1.2" etc.) incrementam o contador.
  const childCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) {
      const cronogramaIdx = a.sourceCronogramaIndex ?? 0
      const parts = a.wbs.split('.')
      for (let i = 1; i < parts.length; i++) {
        const chave = `${cronogramaIdx}::${parts.slice(0, i).join('.')}`
        map.set(chave, (map.get(chave) ?? 0) + 1)
      }
    }
    return map
  }, [activities])

  const getStatusIcon = (activity: typeof activities[0]) => {
    const status = getActivityStatus(activity, today)
    if (status === 'concluida') return <CheckCircle size={14} className="text-green-500" />
    if (status === 'atrasada') return <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
    if (status === 'em-andamento') return <Clock size={14} className="text-blue-500" />
    return <Pause size={14} className="text-gray-400 dark:text-gray-500" />
  }

  const getStatusColor = (activity: typeof activities[0]) => {
    const status = getActivityStatus(activity, today)
    if (status === 'concluida') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    if (status === 'atrasada') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    if (status === 'em-andamento') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }

  const getStatusLabel = (activity: typeof activities[0]) => {
    const status = getActivityStatus(activity, today)
    if (status === 'concluida') return 'Concluída'
    if (status === 'atrasada') return 'Atrasada'
    if (status === 'em-andamento') return 'Em andamento'
    return 'Pendente'
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">Estrutura WBS</h2>
        <div className="flex min-h-11 w-full items-center rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:min-h-0 sm:w-72 sm:rounded-lg sm:shadow-none">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar atividade ou WBS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 dark:text-gray-200 w-full"
          />
        </div>
      </div>

      {isMobile && activities.length > 0 && (
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Filtros rápidos da WBS">
          {(Object.keys(QUICK_FILTER_LABELS) as WbsQuickFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => changeQuickFilter(filter)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${quickFilter === filter ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
              aria-pressed={quickFilter === filter}
            >
              {QUICK_FILTER_LABELS[filter]}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${quickFilter === filter ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{statusCounts[filter]}</span>
            </button>
          ))}
        </div>
      )}

      {activities.length > 0 && isMobile ? (
        <div className="max-h-[34rem] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-card dark:border-gray-700 dark:bg-gray-800">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {visibleActivities.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma atividade encontrada.</p>
            )}
            {visibleActivities.map((activity) => {
              const hasChildren = nodesWithChildren.has(chaveWbs(activity))
              const isExpanded = expandedWbs.has(chaveWbs(activity))
              const durationDays = Math.ceil(activity.duration / (8 * 60))
              const depthOffset = Math.min(Math.max(activity.outlineLevel - 1, 0) * 4, 12)
              const late = isActivityLate(activity, today)

              return (
                <article
                  key={getActivityKey(activity)}
                  className={`relative px-3.5 py-3.5 ${late ? 'bg-red-50/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-red-500 dark:bg-red-500/5' : activity.isSummary ? 'bg-gray-50/80 dark:bg-gray-700/30' : ''}`}
                >
                  <div className="flex items-start gap-2.5" style={{ paddingLeft: depthOffset }}>
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleWbs(chaveWbs(activity))}
                        className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${activity.name}`}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    )}
                    {!hasChildren && <span className="-ml-1 h-11 w-11 shrink-0" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {activity.wbs}
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${getStatusColor(activity)}`}>
                          {getStatusIcon(activity)}
                          {getStatusLabel(activity)}
                        </span>
                      </div>
                      <h3 className={`mt-2 text-sm leading-snug ${activity.isSummary ? 'font-bold text-gray-900 dark:text-white' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                        {activity.name}
                      </h3>
                      {late && <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{getDaysLate(activity, today)}d de atraso</p>}
                      <div className="mt-2.5 grid grid-cols-[1fr_1fr_auto] items-end gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                        <div>
                          <span className="block uppercase tracking-wide text-gray-400 dark:text-gray-500">Início</span>
                          <span className="mt-0.5 block font-medium text-gray-600 dark:text-gray-300">{toDate(activity.start).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wide text-gray-400 dark:text-gray-500">Término</span>
                          <span className="mt-0.5 block font-medium text-gray-600 dark:text-gray-300">{toDate(activity.finish).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <span className="rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{durationDays}d</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                          <div
                            className={`h-1.5 rounded-full ${activity.percentComplete === 100 ? 'bg-green-500' : activity.percentComplete > 50 ? 'bg-blue-500' : activity.percentComplete > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-500'}`}
                            style={{ width: `${activity.percentComplete}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300">{activity.percentComplete}%</span>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : activities.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-8"></th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-20">WBS</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5">Atividade</th>
                  <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Início</th>
                  <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Término</th>
                  <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-20">Duração</th>
                  <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-28">Progresso</th>
                  <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visibleActivities.map((activity) => {
                const hasChildren = nodesWithChildren.has(chaveWbs(activity))
                const isExpanded = expandedWbs.has(chaveWbs(activity))
                const durationDays = Math.ceil(activity.duration / (8 * 60))
                const late = isActivityLate(activity, today)

                  return (
                    <tr
                      // uid não é único entre cronogramas combinados (cada XML do MS
                      // Project numera a partir de 1) — o índice desempata sem precisar
                      // tocar no campo uid, usado em outros lugares para vínculos de dados.
                      key={getActivityKey(activity)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${late ? 'bg-red-50/40 dark:bg-red-500/5' : activity.isSummary ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}
                    >
                      <td className="px-3 py-2">
                        {hasChildren && (
                          <button onClick={() => toggleWbs(chaveWbs(activity))} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                          {activity.wbs}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div style={{ paddingLeft: `${(activity.outlineLevel - 1) * 14}px` }}>
                          <span className={`text-sm ${activity.isSummary ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                            {activity.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                        {toDate(activity.start).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                        {toDate(activity.finish).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                        {durationDays}d
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${activity.percentComplete === 100 ? 'bg-green-500' : activity.percentComplete > 50 ? 'bg-blue-500' : activity.percentComplete > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-500'}`}
                              style={{ width: `${activity.percentComplete}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{activity.percentComplete}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(activity)}`}>
                          {getStatusIcon(activity)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {visibleActivities.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma atividade encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          Nenhuma atividade carregada
        </div>
      )}
    </div>
  )
}
