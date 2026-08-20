import { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart3, Filter, Layers, Table2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'
import { calcularCurvaSPorPeso, CURVA_S_CONFIG_PADRAO, CURVA_S_DISCIPLINA_GERAL, DIAS_SEMANA, type CurvaSConfig, type CurvaSSemana, type CurvaSResultado } from '@/lib/curva-s-peso'
import { loadCurvaSConfig, loadCurvaSFeriados, salvarCurvaSSemanas, type CurvaSFeriado } from '@/lib/curva-s-config-store'
import { COLOR_REAL, COLOR_FORECAST, COLOR_PLANNED, BL_COLORS } from '@/lib/curve-utils'
import { SCurveHeader } from '@/components/scurve/SCurveHeader'
import { SCurveAdvanceCard } from '@/components/scurve/SCurveAdvanceCard'
import { useAuth } from '@/lib/auth-context'
import type { CronogramaInfo, Project } from '@/lib/project-store'

interface Props {
  project: Project
  cronogramas: CronogramaInfo[]
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v}%`
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

function computePesoAdvanceMetrics(
  resultados: CurvaSResultado[],
  disciplinaFilter: string,
) {
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
  const statusDateFormatted = period.dataCorte.toLocaleDateString('pt-BR')
  const endDate = new Date(period.dataCorte)
  endDate.setDate(endDate.getDate() + 6)
  const statusEndDateFormatted = endDate.toLocaleDateString('pt-BR')

  return {
    statusDate,
    statusDateFormatted,
    statusEndDateFormatted,
    real: {
      percent: round2(realPct),
      absolute: 0,
      deltaPP: round2(realPct - realPrevPct),
    },
    baselines: [{
      id: 'BL0',
      label: 'Peso Atribuído',
      color: BL_COLORS[0],
      metric: {
        percent: round2(planejadoPct),
        absolute: 0,
        deltaPP: round2(planejadoPct - planejadoPrevPct),
      },
    }],
  }
}

export function CurvaSPesoView({ project, cronogramas }: Props) {
  const { userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const [disciplina, setDisciplina] = useState<string>(CURVA_S_DISCIPLINA_GERAL)
  const [config, setConfig] = useState<CurvaSConfig>(CURVA_S_CONFIG_PADRAO)
  const [feriados, setFeriados] = useState<CurvaSFeriado[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [selectedCronogramas, setSelectedCronogramas] = useState<string[]>(cronogramas.map((c) => c.id))
  const [openPanel, setOpenPanel] = useState<'filtros' | null>(null)

  useEffect(() => {
    let cancelado = false
    setLoadingConfig(true)
    Promise.all([loadCurvaSConfig(project.id), loadCurvaSFeriados(project.id)])
      .then(([cfg, fer]) => {
        if (cancelado) return
        setConfig(cfg)
        setFeriados(fer)
      })
      .catch((err) => {
        console.error('[CurvaSPesoView] Falha ao carregar configuracao:', err)
      })
      .finally(() => {
        if (!cancelado) setLoadingConfig(false)
      })
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

  const cronogramasAtivos = useMemo(
    () => cronogramas.filter((c) => selectedCronogramas.includes(c.id)),
    [cronogramas, selectedCronogramas],
  )

  const feriadosDatas = useMemo(() => feriados.map((f) => new Date(`${f.data}T00:00:00`)), [feriados])

  const resultados = useMemo(() => {
    if (loadingConfig) return []
    return calcularCurvaSPorPeso({ cronogramas: cronogramasAtivos, config, feriados: feriadosDatas })
  }, [cronogramasAtivos, config, feriadosDatas, loadingConfig])

  useEffect(() => {
    if (resultados.length === 0 || !organizacaoId) return
    salvarCurvaSSemanas(project.id, organizacaoId, resultados).catch((err) => {
      console.error('[CurvaSPesoView] Falha ao salvar cache semanal:', err)
    })
  }, [resultados, project.id, organizacaoId])

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
        const dataStatus = resolveDataStatus(c)
        let realSoma = 0
        let planejadoSoma = 0
        for (const a of ativos) {
          const fracaoExec = calcFracaoExec(a, dataStatus)
          const fracaoPlan = calcFracaoPlan(a, dataStatus)
          realSoma += a.number1 * fracaoExec
          planejadoSoma += a.number1 * fracaoPlan
        }
        realPct = round2((realSoma / pesoTotal) * 100)
        plannedPct = round2((planejadoSoma / pesoTotal) * 100)
      }
      return {
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        start: c.dados?.startDate ?? null,
        finish: c.dados?.finishDate ?? null,
        blFinish,
        realPct,
        plannedPct,
      }
    })
  }, [cronogramasAtivos])

  const advanceMetrics = useMemo(() => {
    return computePesoAdvanceMetrics(resultados, disciplina)
  }, [resultados, disciplina])

  const chartData = useMemo(() => {
    if (!grupoAtual) return []
    return grupoAtual.semanas.map((s) => ({
      semana: `S${String(s.semanaIndice).padStart(2, '0')}`,
      Planejado: s.avancoPlanejadoAcum,
      Executado: s.avancoExecutadoAcum,
      Forecast: s.forecastAcum,
    }))
  }, [grupoAtual])

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
          periodColLabel="Sem."
        />
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
            Curva S - Percentual Acumulado (%)
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {resultados.length > 1 && (
              <select
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value)}
                className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                {resultados.map((r) => (
                  <option key={r.disciplina} value={r.disciplina}>
                    {r.disciplina === CURVA_S_DISCIPLINA_GERAL ? 'Geral (todas as disciplinas)' : r.disciplina}
                  </option>
                ))}
              </select>
            )}

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
                    {cronogramas.length > 1 && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {selectedCronogramas.length}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Escolhe quais cronogramas ativos entram no calculo da curva.
                </TooltipContent>
              </Tooltip>
              {openPanel === 'filtros' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenPanel(null)} />
                  <div className="fixed inset-x-2 top-20 z-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-[70vh] sm:w-[min(380px,calc(100vw-1rem))] space-y-4">
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
            Semanal
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            Peso (R$)
          </span>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Percentual acumulado em relacao ao total planejado (peso atribuido)
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Dados XML reais
          </span>
        </p>

        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <RechartsTooltip formatter={(v) => (v === null || v === undefined ? '—' : `${v}%`)} />
              <Legend />
              <Line type="monotone" dataKey="Planejado" stroke={COLOR_PLANNED} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Executado" stroke={COLOR_REAL} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="Forecast" stroke={COLOR_FORECAST} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Corte semanal: {DIAS_SEMANA[config.diaCorteSemana]} - Folga: {DIAS_SEMANA[config.diaFolgaSemanal]} - {feriados.length} feriado{feriados.length !== 1 ? 's' : ''} cadastrado{feriados.length !== 1 ? 's' : ''}.
          {' '}Pra ajustar, va em Gerenciar Cronograma.
        </p>
      </div>

      {showTable && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 sm:px-6 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Detalhamento semanal</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Semana</th>
                  <th className="px-3 py-2 text-left font-medium">Data de Corte</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Sem.)</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Sem.)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast</th>
                  <th className="px-3 py-2 text-right font-medium">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {grupoAtual.semanas.map((s) => (
                  <tr key={s.semanaIndice} className="text-gray-700 dark:text-gray-200">
                    <td className="px-3 py-1.5 font-mono">S{String(s.semanaIndice).padStart(2, '0')}</td>
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
