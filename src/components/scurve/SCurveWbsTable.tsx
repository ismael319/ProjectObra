import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from 'lucide-react'
import type { WBSActivity, WBSAssignment, TimephasedDataPoint } from '@/lib/xml-parser'
import { computeWbsNodeMetrics, type WbsNodeMetrics } from '@/lib/scurve-wbs'

interface CronogramaWbsData {
  id: string
  nome: string
  cor: string
  activities: WBSActivity[]
  assignments: WBSAssignment[]
  rawPoints: TimephasedDataPoint[] | undefined
}

interface SCurveWbsTableProps {
  cronogramas: CronogramaWbsData[]
  statusDate: Date | null
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`
}

function fmtPP(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)} pp`
}

function fmtSpi(v: number): string {
  return v.toFixed(2)
}

function spiColor(spi: number, hasData: boolean): string {
  if (!hasData) return 'text-gray-400 dark:text-gray-500'
  if (spi >= 0.95) return 'text-green-600 dark:text-green-400'
  if (spi >= 0.8) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function ppColor(v: number): string {
  if (v > 0.05) return 'text-green-600 dark:text-green-400'
  if (v < -0.05) return 'text-red-600 dark:text-red-400'
  return 'text-gray-500 dark:text-gray-400'
}

export function SCurveWbsTable({ cronogramas, statusDate }: SCurveWbsTableProps) {
  if (!statusDate || cronogramas.length === 0) return null

  return (
    <div className="space-y-4">
      {cronogramas.map((c) => (
        <SCurveWbsTableSection key={c.id} cronograma={c} statusDate={statusDate} />
      ))}
    </div>
  )
}

function SCurveWbsTableSection({ cronograma, statusDate }: { cronograma: CronogramaWbsData; statusDate: Date }) {
  const { activities, assignments, rawPoints } = cronograma
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(activities.filter((a) => a.outlineLevel <= 1).map((a) => a.wbs)))
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 639px)').matches)

  const metricsByUid = useMemo(
    () => computeWbsNodeMetrics(activities, assignments, rawPoints, statusDate),
    [activities, assignments, rawPoints, statusDate],
  )

  const toggleWbs = (wbs: string) => {
    setExpandedWbs((prev) => {
      const next = new Set(prev)
      if (next.has(wbs)) next.delete(wbs)
      else next.add(wbs)
      return next
    })
  }

  const expandAll = () => setExpandedWbs(new Set(activities.map((a) => a.wbs)))
  const collapseAll = () => setExpandedWbs(new Set())

  const visibleActivities = useMemo(() => {
    return activities.filter((a) => {
      if (a.outlineLevel <= 1) return true
      const parts = a.wbs.split('.')
      for (let i = 1; i < parts.length; i++) {
        const parentWbs = parts.slice(0, i).join('.')
        if (!expandedWbs.has(parentWbs)) return false
      }
      return true
    })
  }, [activities, expandedWbs])

  if (activities.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className={`flex items-center justify-between gap-3 p-4 ${open ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
        <button onClick={() => setOpen((value) => !value)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left sm:min-h-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cronograma.cor }} />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{cronograma.nome}</h3>
          {open ? <ChevronUp size={18} className="ml-auto shrink-0 text-gray-400" /> : <ChevronDown size={18} className="ml-auto shrink-0 text-gray-400" />}
        </button>
        {open && <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button
            onClick={expandAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <ChevronsDown size={13} /> Expandir tudo
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <ChevronsUp size={13} /> Recolher tudo
          </button>
        </div>}
      </div>
      {open && <>
      <p className="px-4 pt-3 text-xs text-gray-400 dark:text-gray-500">
        % sobre HH da linha de base; semana = 7 dias até a data de status; forecast = próximos 7 dias.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2 w-16">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Tarefa</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">BL Acum</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">BL Semana</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Real Acum</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Real Semana</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Forecast +7d</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">SPI</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Δ Semana</th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2">Δ Acum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {visibleActivities.map((activity, index) => {
              const hasChildren = activities.some((a) => a.wbs !== activity.wbs && a.wbs.startsWith(activity.wbs + '.'))
              const isExpanded = expandedWbs.has(activity.wbs)
              const m: WbsNodeMetrics = metricsByUid.get(activity.uid) ?? {
                blAcum: 0, blSemana: 0, realAcum: 0, realSemana: 0, forecast7d: 0, spi: 0, deltaSemana: 0, deltaAcum: 0, hasData: false,
              }

              return (
                <tr key={`${activity.uid}-${index}`} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${activity.isSummary ? 'bg-gray-50/60 dark:bg-gray-700/20' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{activity.wbs}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1" style={{ paddingLeft: `${(activity.outlineLevel - 1) * 16}px` }}>
                      {hasChildren ? (
                        <button onClick={() => toggleWbs(activity.wbs)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className={`text-sm truncate ${activity.isSummary ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {activity.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">{m.hasData ? fmtPct(m.blAcum) : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">{m.hasData ? fmtPct(m.blSemana) : '—'}</td>
                  <td className="px-3 py-2 text-right text-purple-600 dark:text-purple-400 whitespace-nowrap">{m.hasData ? fmtPct(m.realAcum) : '—'}</td>
                  <td className="px-3 py-2 text-right text-purple-500/80 dark:text-purple-400/70 whitespace-nowrap">{m.hasData ? fmtPct(m.realSemana) : '—'}</td>
                  <td className="px-3 py-2 text-right text-red-500 dark:text-red-400 whitespace-nowrap">{m.hasData ? fmtPct(m.forecast7d) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${spiColor(m.spi, m.hasData)}`}>{m.hasData ? fmtSpi(m.spi) : '—'}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${m.hasData ? ppColor(m.deltaSemana) : 'text-gray-400 dark:text-gray-500'}`}>{m.hasData ? fmtPP(m.deltaSemana) : '—'}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${m.hasData ? ppColor(m.deltaAcum) : 'text-gray-400 dark:text-gray-500'}`}>{m.hasData ? fmtPP(m.deltaAcum) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  )
}
