import { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart3, Filter, Layers, SlidersHorizontal, Table2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { calcularCurvaSPorPeso, CURVA_S_CONFIG_PADRAO, CURVA_S_DISCIPLINA_GERAL, type CurvaSConfig, type CurvaSSemana, type CurvaSResultado } from '@/lib/curva-s-peso'
import { loadCurvaSConfig, loadCurvaSFeriados, salvarCurvaSSemanas, type CurvaSFeriado } from '@/lib/curva-s-config-store'
import { COLOR_REAL, COLOR_FORECAST, COLOR_PLANNED, BL_COLORS, PERIOD_LABEL, PERIOD_TABLE_LABEL, bucketKey, type CurveGranularity } from '@/lib/curve-utils'
import { SCurveHeader } from '@/components/scurve/SCurveHeader'
import { SCurveAdvanceCard } from '@/components/scurve/SCurveAdvanceCard'
import { SCurveRootCauseCards } from '@/components/scurve/SCurveRootCauseCards'
import { PesoTooltip } from '@/components/scurve/PesoTooltip'
import { CurvaSConfigPanel } from '@/components/scurve/CurvaSConfigPanel'
import ColumnValueFilter, { computeColumnFilterExcludedUids, type ColumnFilterState } from '@/components/ColumnValueFilter'
import ActivityFilterTree from '@/components/ActivityFilterTree'
import { useAuth } from '@/lib/auth-context'
import { useProject } from '@/lib/project-context'
import type { CronogramaInfo, Project } from '@/lib/project-store'
import type { WBSActivity } from '@/lib/xml-parser'

interface Props {
  project: Project
  cronogramas: CronogramaInfo[]
}

const GRANULARITY_KEY = 'obracontrol_scurvapeso_granularity'
const GRANULARITY_OPTIONS: { value: CurveGranularity; short: string; title: string }[] = [
  { value: 'day', short: 'D', title: 'Diário' },
  { value: 'week', short: 'S', title: 'Semanal' },
  { value: 'month', short: 'M', title: 'Mensal' },
  { value: 'year', short: 'A', title: 'Anual' },
]

function loadSavedGranularity(): CurveGranularity {
  try {
    const v = localStorage.getItem(GRANULARITY_KEY)
    if (v === 'day' || v === 'week' || v === 'month' || v === 'year') return v
  } catch { /* */ }
  return 'week'
}

/** Rótulo de um ponto de corte na granularidade ativa — reaproveita o mesmo
 * padrão de rótulo do modo HH (bucketKey), pra não mostrar "S00" quando a
 * granularidade não é semanal. */
function periodoLabel(s: CurvaSSemana, granularity: CurveGranularity): string {
  if (granularity === 'week') return `S${String(s.semanaIndice).padStart(2, '0')}`
  return bucketKey(s.dataCorte, granularity).label
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '\u2014' : `${v}%`
}

function fmtDataCorte(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function findStatusIndexSemanas(semanas: CurvaSSemana[]): number {
  for (let i = semanas.length - 1; i >= 0; i--) {
    if (semanas[i].avancoExecutadoAcum !== null) return i
  }
  return -1
}

function resolveDataStatus(c: CronogramaInfo): Date | undefined {
  if (c.dataStatusModo === 'manual' && c.dataStatusManual) {
    const d = new Date(`${c.dataStatusManual}T00:00:00`)
    return isNaN(d.getTime()) ? undefined : d
  }
  return c.dados.statusDate
}

function calcFracaoExec(a: { start: Date; finish: Date; percentComplete: number }, dataStatus?: Date): number {
  if (!dataStatus) return a.percentComplete / 100
  if (dataStatus >= a.finish) return 1
  if (dataStatus <= a.start) return 0
  const total = a.finish.getTime() - a.start.getTime()
  if (total <= 0) return 1
  return Math.max(0, Math.min(1, (dataStatus.getTime() - a.start.getTime()) / total))
}

function calcFracaoPlan(a: { baselineStart?: Date; baselineFinish?: Date }, dataStatus?: Date): number {
  if (!a.baselineStart || !a.baselineFinish) return 0
  if (!dataStatus) return 0
  if (dataStatus >= a.baselineFinish) return 1
  if (dataStatus <= a.baselineStart) return 0
  const total = a.baselineFinish.getTime() - a.baselineStart.getTime()
  if (total <= 0) return 1
  return Math.max(0, Math.min(1, (dataStatus.getTime() - a.baselineStart.getTime()) / total))
}

function computePesoAdvanceMetrics(resultados: CurvaSResultado[], disciplinaFilter: string) {
  const geral = resultados.find((r) => r.disciplina === disciplinaFilter) ?? resultados[0]
  if (!geral || geral.semanas.length < 2) return null
  const sems = geral.semanas
  const statusIdx = findStatusIndexSemanas(sems)
  if (statusIdx < 0) return null
  const period = sems[statusIdx]
  const prevIdx = Math.max(0, statusIdx - 1)
  const prevPeriod = sems[prevIdx]
  const realPct = period.avancoExecutadoAcum ?? 0
  const realPrevPct = prevPeriod.avancoExecutadoAcum ?? 0
  const planejadoPct = period.avancoPlanejadoAcum
  const planejadoPrevPct = prevPeriod.avancoPlanejadoAcum
  const statusDate = period.dataCorte.toLocaleDateString('pt-BR')
  const endDate = new Date(period.dataCorte)
  endDate.setDate(endDate.getDate() + 6)
  return {
    statusDate,
    statusDateFormatted: period.dataCorte.toLocaleDateString('pt-BR'),
    statusEndDateFormatted: endDate.toLocaleDateString('pt-BR'),
    real: { percent: round2(realPct), absolute: 0, deltaPP: round2(realPct - realPrevPct) },
    baselines: [{
      id: 'BL0', label: 'Peso Atribuido', color: BL_COLORS[0],
      metric: { percent: round2(planejadoPct), absolute: 0, deltaPP: round2(planejadoPct - planejadoPrevPct) },
    }],
  }
}

function filterActivitiesForPeso(activities: WBSActivity[], excludedUids: Set<number>, columnExcludedUids: Set<number>): WBSActivity[] {
  return activities.filter((a) => {
    if (a.isSummary) return false
    if (!(a.number1 > 0)) return false
    if (excludedUids.has(a.uid)) return false
    if (columnExcludedUids.has(a.uid)) return false
    return true
  })
}

export function CurvaSPesoView({ project, cronogramas }: Props) {
  const { userProfile } = useAuth()
  const { occurrences } = useProject()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const [disciplina, setDisciplina] = useState<string>(CURVA_S_DISCIPLINA_GERAL)
  const [config, setConfig] = useState<CurvaSConfig>(CURVA_S_CONFIG_PADRAO)
  const [feriados, setFeriados] = useState<CurvaSFeriado[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [granularity, setGranularity] = useState<CurveGranularity>(loadSavedGranularity())
  const [selectedCronogramas, setSelectedCronogramas] = useState<string[]>(cronogramas.map((c) => c.id))
  const [openPanel, setOpenPanel] = useState<'filtros' | 'opcoes' | null>(null)
  const [collapsedFilterCronogramas, setCollapsedFilterCronogramas] = useState<Set<string>>(new Set())
  const [hiddenCurves, setHiddenCurves] = useState<string[]>([])

  const [activityExclusions, setActivityExclusions] = useState<Record<string, number[]>>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState[]>([])

  useEffect(() => {
    let cancelado = false
    setLoadingConfig(true)
    Promise.all([loadCurvaSConfig(project.id), loadCurvaSFeriados(project.id)])
      .then(([cfg, fer]) => {
        if (cancelado) return
        setConfig(cfg)
        setFeriados(fer)
      })
      .catch((err) => console.error('[CurvaSPesoView] Falha ao carregar configuracao:', err))
      .finally(() => { if (!cancelado) setLoadingConfig(false) })
    return () => { cancelado = true }
  }, [project.id])

  useEffect(() => {
    setSelectedCronogramas(cronogramas.map((c) => c.id))
  }, [cronogramas])

  const toggleCronograma = useCallback((id: string) => {
    setSelectedCronogramas((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      return next.length > 0 ? next : prev
    })
  }, [])

  const handleGranularityChange = useCallback((g: CurveGranularity) => {
    setGranularity(g)
    try { localStorage.setItem(GRANULARITY_KEY, g) } catch { /* */ }
  }, [])

  const toggleFilterCronogramaCollapse = useCallback((id: string) => {
    setCollapsedFilterCronogramas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleActivityExclusionChange = useCallback((cronogramaId: string, next: Set<number>) => {
    setActivityExclusions((prev) => ({ ...prev, [cronogramaId]: Array.from(next) }))
  }, [])

  const cronogramasAtivos = useMemo(
    () => cronogramas.filter((c) => selectedCronogramas.includes(c.id)),
    [cronogramas, selectedCronogramas],
  )

  const feriadosDatas = useMemo(() => feriados.map((f) => new Date(`${f.data}T00:00:00`)), [feriados])

  const cronogramasFiltrados = useMemo(() => {
    return cronogramasAtivos.map((c) => {
      const excluded = new Set(activityExclusions[c.id] || [])
      const columnExcluded = computeColumnFilterExcludedUids(c.dados?.activities || [], columnFilters, c.dados?.customFieldDefs || [])
      const filteredActivities = filterActivitiesForPeso(c.dados?.activities || [], excluded, columnExcluded)
      return { ...c, dados: { ...c.dados, activities: [...filteredActivities, ...(c.dados?.activities || []).filter((a) => a.isSummary)] } }
    })
  }, [cronogramasAtivos, activityExclusions, columnFilters])

  const resultados = useMemo(() => {
    if (loadingConfig) return []
    return calcularCurvaSPorPeso({ cronogramas: cronogramasFiltrados, config, feriados: feriadosDatas, granularity })
  }, [cronogramasFiltrados, config, feriadosDatas, loadingConfig, granularity])

  // Cache semanal (tabela curva_s_semanas) sempre em granularidade semanal,
  // independente do que está selecionado na tela — o schema da tabela é semanal
  // por natureza e outros consumidores (relatórios futuros) dependem disso.
  // Reaproveita `resultados` quando a tela já está em Semanal (caso mais comum),
  // evitando um segundo cálculo redundante.
  const resultadosSemanais = useMemo(() => {
    if (loadingConfig) return []
    if (granularity === 'week') return resultados
    return calcularCurvaSPorPeso({ cronogramas: cronogramasFiltrados, config, feriados: feriadosDatas, granularity: 'week' })
  }, [cronogramasFiltrados, config, feriadosDatas, loadingConfig, granularity, resultados])

  useEffect(() => {
    if (resultadosSemanais.length === 0 || !organizacaoId) return
    salvarCurvaSSemanas(project.id, organizacaoId, resultadosSemanais).catch((err) =>
      console.error('[CurvaSPesoView] Falha ao salvar cache semanal:', err)
    )
  }, [resultadosSemanais, project.id, organizacaoId])

  const grupoAtual = resultados.find((r) => r.disciplina === disciplina) ?? resultados[0]

  const scheduleInfo = useMemo(() => {
    return cronogramasAtivos.map((c) => {
      let blFinish: Date | null = null
      for (const act of c.dados?.activities || []) {
        if (act.isSummary) continue
        const blf = act.baselines?.[0]?.finish
        if (blf && (!blFinish || blf > blFinish)) blFinish = blf
      }
      const ativos = c.dados?.activities?.filter((a) => !a.isSummary && a.number1 > 0) || []
      const pesoTotal = ativos.reduce((s, a) => s + a.number1, 0)
      let realPct: number | null = null
      let plannedPct: number | null = null
      if (pesoTotal > 0) {
        const ds = resolveDataStatus(c)
        let realSoma = 0, planejadoSoma = 0
        for (const a of ativos) {
          realSoma += a.number1 * calcFracaoExec(a, ds)
          planejadoSoma += a.number1 * calcFracaoPlan(a, ds)
        }
        realPct = round2((realSoma / pesoTotal) * 100)
        plannedPct = round2((planejadoSoma / pesoTotal) * 100)
      }
      return { id: c.id, nome: c.nome, cor: c.cor, start: c.dados?.startDate ?? null, finish: c.dados?.finishDate ?? null, blFinish, realPct, plannedPct }
    })
  }, [cronogramasAtivos])

  const advanceMetrics = useMemo(() => computePesoAdvanceMetrics(resultados, disciplina), [resultados, disciplina])

  const chartData = useMemo(() => {
    if (!grupoAtual) return []
    const statusIdx = findStatusIndexSemanas(grupoAtual.semanas)
    // No índice de status, o Forecast entra com o mesmo valor do Executado (que é
    // null a partir dali) — sem isso, as duas linhas ficam com um vão entre o
    // último ponto do Executado e o primeiro do Forecast, em vez de se encontrarem.
    return grupoAtual.semanas.map((s, i) => {
      const row: Record<string, string | number | null> = {
        semana: periodoLabel(s, granularity),
        Planejado: s.avancoPlanejadoAcum,
        Executado: s.avancoExecutadoAcum,
        Forecast: i === statusIdx ? s.avancoExecutadoAcum : s.forecastAcum,
      }
      for (const bl of grupoAtual.baselinesExtras) row[bl.id] = s.baselinesAcum[bl.id] ?? null
      return row
    })
  }, [grupoAtual, granularity])

  const statusWeekLabel = useMemo(() => {
    if (!grupoAtual) return null
    const idx = findStatusIndexSemanas(grupoAtual.semanas)
    if (idx < 0) return null
    return periodoLabel(grupoAtual.semanas[idx], granularity)
  }, [grupoAtual, granularity])

  const hasActivityFilter = useMemo(
    () => columnFilters.length > 0 || cronogramasAtivos.some((c) => (activityExclusions[c.id]?.length || 0) > 0),
    [cronogramasAtivos, activityExclusions, columnFilters],
  )

  if (loadingConfig) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando configuracao da Curva S...</p>
      </div>
    )
  }

  if (!grupoAtual || grupoAtual.semanas.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Sem dados suficientes para a Curva S por peso</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
          Verifique se as atividades do cronograma tem peso atribuido (coluna Numero1 do MS Project) e
          datas de linha de base preenchidas.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4 sm:space-y-6">
      <SCurveHeader
        projectName={project.nome}
        unit="HH"
        overallPace={null}
        scheduleInfo={scheduleInfo}
      />

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Modo de exibicao</span>
        <div className="inline-flex max-w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowTable(false)}
            className={`min-h-11 px-3 py-1.5 text-xs font-medium transition sm:min-h-0 ${!showTable ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Modo geral
          </button>
          <button
            onClick={() => setShowTable(true)}
            className={`flex min-h-11 items-center gap-1.5 border-l border-gray-200 px-3 py-1.5 text-xs font-medium transition dark:border-gray-700 sm:min-h-0 ${showTable ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            <Table2 size={13} /> Modo de planejamento
          </button>
        </div>
      </div>

      {advanceMetrics && (
        <SCurveAdvanceCard
          statusDate={advanceMetrics.statusDate}
          statusDateFormatted={advanceMetrics.statusDateFormatted}
          statusEndDateFormatted={advanceMetrics.statusEndDateFormatted}
          real={advanceMetrics.real}
          baselines={advanceMetrics.baselines}
          unit="HH"
          periodColLabel={PERIOD_LABEL[granularity]}
        />
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
            Curva S - Percentual Acumulado (%)
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Granularidade dos pontos de corte da curva e das tabelas: Diário, Semanal, Mensal ou Anual.
              </TooltipContent>
            </Tooltip>
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpenPanel((prev) => prev === 'filtros' ? null : 'filtros')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                      openPanel === 'filtros'
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Filter size={16} /> Filtros
                    {(cronogramas.length > 1 || hasActivityFilter) && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {selectedCronogramas.length + (hasActivityFilter ? 1 : 0)}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Escolhe quais cronogramas ativos entram no calculo e permite filtrar por coluna ou atividade.
                </TooltipContent>
              </Tooltip>
              {openPanel === 'filtros' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
                  <div className="fixed inset-x-2 top-20 z-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:right-0 sm:left-auto sm:top-full sm:mt-1 sm:max-h-[70vh] sm:w-[min(380px,calc(100vw-1rem))] space-y-4">
                    {resultados.length > 1 && (
                      <div>
                        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Disciplina</span>
                        <select
                          value={disciplina}
                          onChange={(e) => setDisciplina(e.target.value)}
                          className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                        >
                          {resultados.map((r) => (
                            <option key={r.disciplina} value={r.disciplina}>
                              {r.disciplina === CURVA_S_DISCIPLINA_GERAL ? 'Geral (todas as disciplinas)' : r.disciplina}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {cronogramas.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Layers size={14} className="text-blue-500" />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Cronogramas Ativos</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            ({selectedCronogramas.length}/{cronogramas.length})
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {cronogramas.map((c) => {
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

                    {cronogramasAtivos.length > 0 && (
                      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                        <ColumnValueFilter
                          sources={cronogramasAtivos.map((c) => ({
                            activities: c.dados?.activities || [],
                            customFieldDefs: c.dados?.customFieldDefs || [],
                          }))}
                          filters={columnFilters}
                          onChange={setColumnFilters}
                        />
                      </div>
                    )}

                    {cronogramasAtivos.length > 1 && (
                      <div className="flex items-center gap-2 mb-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <Filter size={14} className="text-gray-400 dark:text-gray-500" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Filtros por Atividade</span>
                      </div>
                    )}

                    {cronogramasAtivos.map((c) => {
                      const isMulti = cronogramasAtivos.length > 1
                      const isCollapsed = isMulti && collapsedFilterCronogramas.has(c.id)
                      return (
                        <div key={c.id} className={isMulti ? '' : 'pt-3 border-t border-gray-100 dark:border-gray-700'}>
                          {isMulti && (
                            <button
                              type="button"
                              onClick={() => toggleFilterCronogramaCollapse(c.id)}
                              className="w-full flex items-center justify-between gap-1.5 mb-2 group"
                            >
                              <span className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">{c.nome}</span>
                              </span>
                              {isCollapsed ? (
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              )}
                            </button>
                          )}
                          {!isCollapsed && (
                            <ActivityFilterTree
                              activities={c.dados?.activities || []}
                              excluded={new Set(activityExclusions[c.id] || [])}
                              onChange={(next) => handleActivityExclusionChange(c.id, next)}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpenPanel((prev) => prev === 'opcoes' ? null : 'opcoes')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                      openPanel === 'opcoes'
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <SlidersHorizontal size={16} /> Opcoes
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Configuracao da Curva S por peso: dia de corte, folga, feriados e visibilidade das curvas.
                </TooltipContent>
              </Tooltip>
              {openPanel === 'opcoes' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
                  <div className="fixed inset-x-2 top-20 z-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:right-0 sm:left-auto sm:top-full sm:mt-1 sm:max-h-[70vh] sm:w-64 space-y-4">
                    <div>
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Curvas visiveis</span>
                      <div className="space-y-1">
                        {[
                          { key: 'Planejado', label: 'Planejado (LB0)', color: COLOR_PLANNED },
                          { key: 'Executado', label: 'Executado', color: COLOR_REAL },
                          { key: 'Forecast', label: 'Forecast', color: COLOR_FORECAST },
                          ...grupoAtual.baselinesExtras.map((bl) => ({ key: bl.id, label: bl.label, color: BL_COLORS[bl.index] })),
                        ].map((curve) => (
                          <label key={curve.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!hiddenCurves.includes(curve.key)}
                              onChange={() => setHiddenCurves((prev) => prev.includes(curve.key) ? prev.filter((k) => k !== curve.key) : [...prev, curve.key])}
                              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: curve.color }} />
                            {curve.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Configuracao da Curva S</span>
                      <CurvaSConfigPanel projetoId={project.id} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {cronogramasAtivos.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{ backgroundColor: c.cor + '15', borderColor: c.cor + '40', color: c.cor }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.cor }} />
              {c.nome}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {PERIOD_TABLE_LABEL[granularity]}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            Peso (R$)
          </span>
          {hasActivityFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              Filtro de atividade ativo
            </span>
          )}
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Percentual acumulado em relacao ao total planejado (peso atribuido)
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Dados XML reais
          </span>
        </p>

        <div style={{ width: '100%', height: 390 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <RechartsTooltip
                content={<PesoTooltip semanas={grupoAtual.semanas} />}
              />
              <Legend />
              {statusWeekLabel && (
                <ReferenceLine x={statusWeekLabel} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Status', position: 'top', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} />
              )}
              {!hiddenCurves.includes('Planejado') && <Line type="monotone" dataKey="Planejado" name="Planejado (LB0)" stroke={COLOR_PLANNED} strokeWidth={2} dot={false} />}
              {grupoAtual.baselinesExtras.filter((bl) => !hiddenCurves.includes(bl.id)).map((bl) => (
                <Line key={bl.id} type="monotone" dataKey={bl.id} name={bl.label} stroke={BL_COLORS[bl.index]} strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls={false} />
              ))}
              {/* Forecast desenhado antes do Executado, pra ficar atrás dele onde as duas se sobrepõem. */}
              {!hiddenCurves.includes('Forecast') && <Line type="monotone" dataKey="Forecast" stroke={COLOR_FORECAST} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />}
              {!hiddenCurves.includes('Executado') && <Line type="monotone" dataKey="Executado" stroke={COLOR_REAL} strokeWidth={2} dot={false} connectNulls={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <SCurveRootCauseCards openOccurrencesCount={occurrences.filter((o) => o.status === 'aberta').length} />

      {showTable && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 sm:px-6 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Detalhamento {PERIOD_TABLE_LABEL[granularity].toLowerCase()}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{PERIOD_LABEL[granularity]}</th>
                  <th className="px-3 py-2 text-left font-medium">Data de Corte</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Período)</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Período)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast</th>
                  <th className="px-3 py-2 text-right font-medium">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {grupoAtual.semanas.map((s) => (
                  <tr key={s.semanaIndice} className="text-gray-700 dark:text-gray-200">
                    <td className="px-3 py-1.5 font-mono">{periodoLabel(s, granularity)}</td>
                    <td className="px-3 py-1.5">{fmtDataCorte(s.dataCorte)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtPct(s.avancoPlanejadoSemana)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmtPct(s.avancoPlanejadoAcum)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtPct(s.avancoExecutadoSemana)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: s.avancoExecutadoAcum !== null ? COLOR_REAL : undefined }}>{fmtPct(s.avancoExecutadoAcum)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: s.forecastAcum !== null ? COLOR_FORECAST : undefined }}>{fmtPct(s.forecastAcum)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${s.desvioAcum !== null && s.desvioAcum < 0 ? 'text-red-500' : ''}`}>{fmtPct(s.desvioAcum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resultados.length > 1 && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 sm:px-6 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Detalhamento por disciplina</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Disciplina</th>
                  <th className="px-3 py-2 text-right font-medium">Planejado</th>
                  <th className="px-3 py-2 text-right font-medium">Executado</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast</th>
                  <th className="px-3 py-2 text-right font-medium">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {resultados.filter((r) => r.disciplina !== CURVA_S_DISCIPLINA_GERAL).map((r) => {
                  const ultima = r.semanas[r.semanas.length - 1]
                  if (!ultima) return null
                  return (
                    <tr key={r.disciplina} className="text-gray-700 dark:text-gray-200">
                      <td className="px-3 py-1.5 font-medium">{r.disciplina}</td>
                      <td className="px-3 py-1.5 text-right">{fmtPct(ultima.avancoPlanejadoAcum)}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: COLOR_REAL }}>{fmtPct(ultima.avancoExecutadoAcum)}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: COLOR_FORECAST }}>{fmtPct(ultima.forecastAcum)}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${ultima.desvioAcum !== null && ultima.desvioAcum < 0 ? 'text-red-500' : ''}`}>{fmtPct(ultima.desvioAcum)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  )
}
