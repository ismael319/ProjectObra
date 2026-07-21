import { useMemo, useState, useCallback, useEffect } from 'react'
import { BarChart3, Filter, SlidersHorizontal, Wrench, Layers, Download, FileText, Table2, Check, FileCode } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { useProjects } from '@/lib/project-store'
import { exportToExcel, exportToPDF, exportSCurveToExcel } from '@/lib/export-utils'
import ActivityFilterTree from '@/components/ActivityFilterTree'
import { SCurveHeader } from '@/components/scurve/SCurveHeader'
import { SCurveAdvanceCard } from '@/components/scurve/SCurveAdvanceCard'
import { SCurveChart } from '@/components/scurve/SCurveChart'
import { SCurveTable } from '@/components/scurve/SCurveTable'
import { SCurveWideTable } from '@/components/scurve/SCurveWideTable'
import { SCurveDiagnostic } from '@/components/scurve/SCurveDiagnostic'
import {
  BL_COLORS,
  buildCurveFromRawPoints,
  filterRawPointsByExcludedActivities,
  consolidateCurves,
  computeAdvanceMetrics,
  computeOverallPace,
  findStatusIndex,
  fmtK,
  PERIOD_LABEL,
  type CurveGranularity,
  type CalculationUnit,
} from '@/lib/curve-utils'
import type { BaselineInfo } from '@/lib/xml-parser'

const UNIT_KEY = 'obracontrol_scurve_unit'
const BL_KEY = 'obracontrol_scurve_baseline'
const CRONSEL_KEY = 'obracontrol_scurve_cronsel'
const ACTIVITY_EXCL_KEY = 'obracontrol_scurve_activity_excl'
const GRANULARITY_KEY = 'obracontrol_scurve_granularity'
const HIDDEN_BLS_KEY = 'obracontrol_scurve_hidden_bls'
const SHOW_TABLE_KEY = 'obracontrol_scurve_show_table'

type OpenPanel = 'filtros' | 'opcoes' | 'ferramentas' | null

const GRANULARITY_OPTIONS: { value: CurveGranularity; short: string; title: string }[] = [
  { value: 'day', short: 'D', title: 'Diário' },
  { value: 'week', short: 'S', title: 'Semanal' },
  { value: 'month', short: 'M', title: 'Mensal' },
  { value: 'year', short: 'A', title: 'Anual' },
]

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return JSON.parse(v) as T
  } catch { /* */ }
  return fallback
}

export default function SCurve() {
  const { activities, resources, assignments } = useProject()
  const { currentProject } = useProjects()
  const [unit] = useState<CalculationUnit>(loadSaved(UNIT_KEY, 'HH'))
  const [selectedBL, setSelectedBL] = useState<string>(loadSaved(BL_KEY, 'BL0'))
  const [selectedCronogramas, setSelectedCronogramas] = useState<string[]>(loadSaved(CRONSEL_KEY, []))
  const [granularity, setGranularity] = useState<CurveGranularity>(loadSaved(GRANULARITY_KEY, 'week'))
  const [activityExclusions, setActivityExclusions] = useState<Record<string, number[]>>(loadSaved(ACTIVITY_EXCL_KEY, {}))
  const [hiddenBLs, setHiddenBLs] = useState<string[]>(loadSaved(HIDDEN_BLS_KEY, []))
  const [showTable, setShowTable] = useState<boolean>(loadSaved(SHOW_TABLE_KEY, true))
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [tooltipState, setTooltipState] = useState<{
    active: boolean
    coordinate: { x: number; y: number }
    label: number | string
    payload: Array<{ name: string; value: number; color: string }>
  } | null>(null)

  const togglePanel = useCallback((panel: OpenPanel) => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }, [])

  const cronogramas = useMemo(() => currentProject?.cronogramas || [], [currentProject])
  const activeCronogramas = useMemo(() => cronogramas.filter((c) => c.ativo), [cronogramas])

  useMemo(() => {
    if (selectedCronogramas.length === 0 && activeCronogramas.length > 0) {
      setSelectedCronogramas(activeCronogramas.map((c) => c.id))
    }
  }, [activeCronogramas, selectedCronogramas.length])

  const toggleCronograma = useCallback((id: string) => {
    setSelectedCronogramas((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      localStorage.setItem(CRONSEL_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const selectedCronogramasData = useMemo(
    () => activeCronogramas.filter((c) => selectedCronogramas.includes(c.id)),
    [activeCronogramas, selectedCronogramas],
  )

  // Dia inicial da semana conforme o cronograma importado (ver "A semana começa
  // no(a)" no MS Project). Usa o cronograma padrão do projeto (se definido),
  // senão o primeiro selecionado como referência para o eixo/rótulos do gráfico.
  const weekStartDay = useMemo(() => {
    const padraoId = currentProject?.cronogramaPadraoId
    const padrao = padraoId ? selectedCronogramasData.find((c) => c.id === padraoId) : null
    return (padrao || selectedCronogramasData[0])?.dados?.weekStartDay ?? 5
  }, [selectedCronogramasData, currentProject])

  const handleActivityExclusionChange = useCallback((cronogramaId: string, next: Set<number>) => {
    setActivityExclusions((prev) => {
      const updated = { ...prev, [cronogramaId]: Array.from(next) }
      localStorage.setItem(ACTIVITY_EXCL_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const hasActivityFilter = useMemo(
    () => selectedCronogramasData.some((c) => (activityExclusions[c.id]?.length || 0) > 0),
    [selectedCronogramasData, activityExclusions],
  )

  const availableBLs = useMemo(() => {
    const result: BaselineInfo[] = []
    for (const c of selectedCronogramasData) {
      for (const bl of c.dados?.baselines || []) {
        if (bl.available && (bl.hasTimephased || bl.totalWork > 0 || bl.totalCost > 0)) {
          result.push({
            ...bl,
            id: `${c.id}__${bl.id}`,
            label: `${c.nome} — ${bl.label}`,
          })
        }
      }
    }
    return result
  }, [selectedCronogramasData])

  const baselinesByCronograma = useMemo(() => {
    const groups: Array<{ cronogramaId: string; cronogramaName: string; cor: string; baselines: BaselineInfo[] }> = []
    for (const c of selectedCronogramasData) {
      const cbls = availableBLs.filter((bl) => bl.id.startsWith(`${c.id}__`))
      if (cbls.length > 0) {
        groups.push({ cronogramaId: c.id, cronogramaName: c.nome, cor: c.cor, baselines: cbls })
      }
    }
    return groups
  }, [availableBLs, selectedCronogramasData])

  const selectedBLInfo = useMemo(() => {
    return availableBLs.find((b) => b.id === selectedBL) || availableBLs[0]
  }, [availableBLs, selectedBL])

  const handleBLChange = useCallback((blId: string) => {
    setSelectedBL(blId)
    localStorage.setItem(BL_KEY, JSON.stringify(blId))
  }, [])

  useEffect(() => {
    if (selectedBL && hiddenBLs.includes(selectedBL)) {
      const firstVisible = availableBLs.find((b) => !hiddenBLs.includes(b.id))
      if (firstVisible) handleBLChange(firstVisible.id)
    }
  }, [hiddenBLs, selectedBL, availableBLs, handleBLChange])

  const handleGranularityChange = useCallback((g: CurveGranularity) => {
    setGranularity(g)
    localStorage.setItem(GRANULARITY_KEY, JSON.stringify(g))
  }, [])

  const toggleBLVisibility = useCallback((blId: string) => {
    setHiddenBLs((prev) => {
      const next = prev.includes(blId) ? prev.filter((id) => id !== blId) : [...prev, blId]
      localStorage.setItem(HIDDEN_BLS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const handleShowTableChange = useCallback((v: boolean) => {
    setShowTable(v)
    localStorage.setItem(SHOW_TABLE_KEY, JSON.stringify(v))
  }, [])

  const cronCurves = useMemo(() => {
    return selectedCronogramasData.map((c) => {
      const excluded = new Set(activityExclusions[c.id] || [])
      const rawPoints = filterRawPointsByExcludedActivities(c.dados?.timephased?.rawPoints, c.dados?.assignments, excluded)
      const curve = buildCurveFromRawPoints(rawPoints, granularity, unit, availableBLs, c.dados?.weekStartDay ?? 5)
      return {
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        peso: c.peso,
        curve,
        source: curve.length > 0 ? 'timephased' as const : 'synthetic' as const,
      }
    })
  }, [selectedCronogramasData, unit, availableBLs, granularity, activityExclusions])

  const cronCurvesFull = useMemo(() => {
    return selectedCronogramasData.map((c) =>
      buildCurveFromRawPoints(c.dados?.timephased?.rawPoints, granularity, unit, availableBLs, c.dados?.weekStartDay ?? 5),
    )
  }, [selectedCronogramasData, unit, availableBLs, granularity])

  const curveData = useMemo(() => {
    return cronCurves.length === 0
      ? []
      : cronCurves.length === 1
        ? cronCurves[0].curve
        : consolidateCurves(
            cronCurves.map((c) => c.curve),
            'soma',
            cronCurves.map((c) => c.peso),
          )
  }, [cronCurves])

  const curveDataFull = useMemo(() => {
    return cronCurvesFull.length === 0
      ? []
      : cronCurvesFull.length === 1
        ? cronCurvesFull[0]
        : consolidateCurves(cronCurvesFull, 'soma', cronCurves.map((c) => c.peso))
  }, [cronCurvesFull, cronCurves])

  const overallPace = useMemo(
    () => computeOverallPace(curveDataFull, granularity, weekStartDay),
    [curveDataFull, granularity, weekStartDay],
  )

  const unitLabel = unit === 'HH' ? 'Horas de Trabalho' : 'Custo (R$)'

  const selectedBLTotal = useMemo(() => {
    if (!selectedBLInfo) return 0
    return unit === 'HH' ? selectedBLInfo.totalWork / 60 : selectedBLInfo.totalCost
  }, [selectedBLInfo, unit])

  const advances = useMemo(
    () => computeAdvanceMetrics(curveData, selectedBL),
    [curveData, selectedBL],
  )

  const lastPeriod = curveData.length > 0 ? curveData[curveData.length - 1] : null
  const finalPlanned = lastPeriod?.planned || 1

  const consolidatedBLs = useMemo(() => {
    if (!lastPeriod) return []
    return Object.keys(lastPeriod.blCum).map((rawId, idx) => {
      const id = rawId.includes('__') ? rawId.split('__').pop()! : rawId
      return {
        id,
        rawKey: rawId,
        label: id,
        index: idx,
        available: true,
        hasTimephased: true,
        totalWork: (lastPeriod.blCum[rawId] || 0) * 60,
        totalCost: 0,
      }
    }).filter((bl, _i, arr) => arr.findIndex((b) => b.id === bl.id) === _i)
  }, [lastPeriod])

  const chartData = useMemo(() => {
    return curveData.map((w) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = {
        date: new Date(w.date).getTime(),
        planned: pct(w.planned, finalPlanned),
        actual: pct(w.actual, finalPlanned),
        forecast: pct(w.forecast, finalPlanned),
        actualPeriod: pct(w.actualPeriod, finalPlanned),
        forecastPeriod: pct(w.forecastPeriod, finalPlanned),
      }
      for (const bl of consolidatedBLs) {
        const value = w.blCum[bl.rawKey] || 0
        row[bl.id] = pct(value, finalPlanned)
        const periodValue = w.blPeriod[bl.rawKey] || 0
        row[`${bl.id}_period`] = pct(periodValue, finalPlanned)
      }
      for (const cc of cronCurves) {
        const cw = cc.curve.find((c) => c.date === w.date)
        const value = cw?.actual || 0
        const finalCronPlanned = cc.curve[cc.curve.length - 1]?.planned || 0
        row[`cron_${cc.id}`] = pct(value, finalCronPlanned)
      }
      return row
    })
  }, [curveData, consolidatedBLs, cronCurves, finalPlanned, lastPeriod])

  const statusX = useMemo(() => {
    if (curveData.length === 0) return null
    return new Date(curveData[findStatusIndex(curveData)].date).getTime()
  }, [curveData])

  const project = currentProject
  const periodColLabel = PERIOD_LABEL[granularity]

  const tableRows = useMemo(() => {
    if (granularity !== 'day') return curveData
    const sampleCap = 200
    const step = Math.max(1, Math.floor(curveData.length / sampleCap))
    return curveData.filter((_, i) => i % step === 0 || i === curveData.length - 1)
  }, [curveData, granularity])

  if (!project || activities.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Nenhum cronograma carregado</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Faça o upload de um arquivo XML para visualizar a Curva S</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SCurveHeader
        projectName={project.nome}
        unit={unit}
        overallPace={overallPace}
        selectedBLInfo={selectedBLInfo ? { label: selectedBLInfo.label } : undefined}
        selectedBLTotal={selectedBLTotal}
      />

      {advances && (
        <SCurveAdvanceCard
          advances={advances}
          unit={unit}
          selectedBLInfo={selectedBLInfo ? { id: selectedBLInfo.id, index: selectedBLInfo.index } : undefined}
          periodColLabel={periodColLabel}
        />
      )}

      {/* S-Curve Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Curva S - Percentual Acumulado (%)
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {/* Granularidade */}
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {GRANULARITY_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => handleGranularityChange(g.value)}
                  title={g.title}
                  className={`px-4 py-2.5 text-base font-semibold transition ${
                    granularity === g.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {g.short}
                </button>
              ))}
            </div>
        {/* Filtros */}
        <div className="relative">
          <button
            onClick={() => togglePanel('filtros')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
              openPanel === 'filtros'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter size={16} /> Filtros
            {(activeCronogramas.length > 1 || hasActivityFilter) && (
              <span className="bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {selectedCronogramas.length + (hasActivityFilter ? 1 : 0)}
              </span>
            )}
          </button>
          {openPanel === 'filtros' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
              <div className="absolute top-full left-0 mt-1 w-[380px] max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-4 space-y-4">
                {activeCronogramas.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Layers size={14} className="text-blue-500" />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Cronogramas Ativos</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        ({selectedCronogramas.length}/{activeCronogramas.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeCronogramas.map((c) => {
                        const isSelected = selectedCronogramas.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            onClick={() => toggleCronograma(c.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                              isSelected
                                ? 'border-gray-200 dark:border-gray-600 shadow-sm'
                                : 'border-gray-200 dark:border-gray-700 opacity-50'
                            }`}
                            style={isSelected ? { backgroundColor: c.cor + '15', borderColor: c.cor + '40' } : {}}
                          >
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                            <span className={isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
                              {c.nome}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {selectedCronogramasData.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <Filter size={14} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Filtros por Atividade</span>
                  </div>
                )}

                {selectedCronogramasData.map((c) => (
                  <div key={c.id} className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    {selectedCronogramasData.length > 1 && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.cor }} />
                        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">{c.nome}</span>
                      </div>
                    )}
                    <ActivityFilterTree
                      activities={c.dados?.activities || []}
                      excluded={new Set(activityExclusions[c.id] || [])}
                      onChange={(next) => handleActivityExclusionChange(c.id, next)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Opções */}
        <div className="relative">
          <button
            onClick={() => togglePanel('opcoes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
              openPanel === 'opcoes'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={16} /> Opções
          </button>
          {openPanel === 'opcoes' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-4 space-y-4">
                {consolidatedBLs.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Linhas de base</span>
                    <div className="space-y-0.5">
                      {consolidatedBLs.map((bl) => (
                        <label key={bl.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!hiddenBLs.includes(bl.id)}
                            onChange={() => toggleBLVisibility(bl.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                          {bl.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Ferramentas */}
        <div className="relative">
          <button
            onClick={() => togglePanel('ferramentas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
              openPanel === 'ferramentas'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Wrench size={16} /> Ferramentas
          </button>
          {openPanel === 'ferramentas' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
              <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-2 space-y-1">
                <button
                  onClick={() => handleShowTableChange(!showTable)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <span className={`flex items-center justify-center w-4 h-4 rounded border ${showTable ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                    {showTable && <Check size={12} />}
                  </span>
                  <Table2 size={16} className="text-gray-500" /> Tabela
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <button
                   onClick={() => { exportSCurveToExcel(curveData, consolidatedBLs.map((b) => b.id), unitLabel, project.nome, advances || undefined, periodColLabel); setOpenPanel(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <BarChart3 size={16} className="text-blue-600" /> Curva S Excel
                </button>
                <button
                  onClick={() => { exportToExcel(activities, resources, assignments, project.nome); setOpenPanel(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <Download size={16} className="text-green-600" /> Excel
                </button>
                <button
                  onClick={() => { exportToPDF(activities, null, project.nome); setOpenPanel(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <FileText size={16} className="text-red-600" /> PDF
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { setShowDiagnostic(true); setOpenPanel(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <FileCode size={16} className="text-purple-600" /> Diagnóstico XML
                </button>
              </div>
            </>
          )}
        </div>
        </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {selectedBLInfo?.label} | Percentual acumulado em relação ao total planejado
          {cronCurves.some((c) => c.source === 'timephased') && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Dados XML reais
            </span>
          )}
          {cronCurves.every((c) => c.source === 'synthetic') && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Sem dados detalhados
            </span>
          )}
          {hasActivityFilter && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Filtrado por atividade
            </span>
          )}
        </p>
        <SCurveChart
          chartData={chartData}
          curveData={curveData}
          availableBLs={consolidatedBLs}
          selectedBL={selectedBL}
          selectedBLInfo={selectedBLInfo ? { ...selectedBLInfo, index: selectedBLInfo.index } : undefined}
          unit={unit}
          unitLabel={unitLabel}
          granularity={granularity}
          weekStartDay={weekStartDay}
          consolidationMethod="soma"
          cronCurves={cronCurves}
          hasActivityFilter={hasActivityFilter}
          hiddenBLs={hiddenBLs}
          statusX={statusX}
          tooltipState={tooltipState}
          onTooltipChange={setTooltipState}
        />
      </div>

      {curveData.length > 0 && showTable && (
        <>
          <SCurveWideTable
            curveData={curveData}
            cronogramaNames={selectedCronogramasData.map((c) => c.nome).join(', ')}
            selectedBLInfo={selectedBLInfo ? { id: selectedBLInfo.id, label: selectedBLInfo.label } : undefined}
            unit={unit}
          />
          <SCurveTable
            curveData={curveData}
            tableRows={tableRows}
            availableBLs={consolidatedBLs}
            unit={unit}
            unitLabel={unitLabel}
            granularity={granularity}
          />
        </>
      )}
      {showDiagnostic && <SCurveDiagnostic onClose={() => setShowDiagnostic(false)} />}
    </div>
  )
}

function pct(value: number, total: number): number {
  if (total === 0) return 0
  return (value / total) * 100
}
