import { useMemo, useState, useCallback, useEffect } from 'react'
import { BarChart3, Filter, SlidersHorizontal, Wrench, Layers, Download, FileText, Table2, Check, FileCode, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
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
  sumBL0,
  PERIOD_LABEL,
  type CurveGranularity,
  type CalculationUnit,
  type BLSynthMap,
} from '@/lib/curve-utils'
import type { BaselineInfo } from '@/lib/xml-parser'

const UNIT_KEY = 'obracontrol_scurve_unit'
const BL_KEY = 'obracontrol_scurve_baseline'
const CRONSEL_KEY = 'obracontrol_scurve_cronsel'
const ACTIVITY_EXCL_KEY = 'obracontrol_scurve_activity_excl'
const GRANULARITY_KEY = 'obracontrol_scurve_granularity'
const HIDDEN_BLS_KEY = 'obracontrol_scurve_hidden_bls'
const SHOW_TABLE_KEY = 'obracontrol_scurve_show_table'
const BL_SYNTH_MAP_KEY = 'obracontrol_scurve_bl_synth_map'
const SYNTH_SLOTS_KEY = 'obracontrol_scurve_synth_slots'
const EXCLUDED_SLOT = ''
const DEFAULT_SYNTH_SLOTS = ['BL0']

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
  const [blSynthMap, setBlSynthMap] = useState<BLSynthMap>(loadSaved(BL_SYNTH_MAP_KEY, {}))
  const [synthSlotIds, setSynthSlotIds] = useState<string[]>(loadSaved(SYNTH_SLOTS_KEY, DEFAULT_SYNTH_SLOTS))
  const [collapsedSynthSlots, setCollapsedSynthSlots] = useState<Set<string>>(new Set(loadSaved(SYNTH_SLOTS_KEY, DEFAULT_SYNTH_SLOTS)))
  const [collapsedFilterCronogramas, setCollapsedFilterCronogramas] = useState<Set<string>>(new Set())
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
    setOpenPanel((prev) => {
      const next = prev === panel ? null : panel
      // Toda vez que o painel Opções é aberto, as LBs sintéticas começam fechadas —
      // não fica lembrando se estavam expandidas da última vez.
      if (next === 'opcoes') setCollapsedSynthSlots((s) => new Set([...s, ...synthSlotIds]))
      // Mesma ideia para Filtros: os blocos de cronograma sempre começam fechados.
      if (next === 'filtros') setCollapsedFilterCronogramas((s) => new Set([...s, ...selectedCronogramas]))
      return next
    })
  }, [synthSlotIds, selectedCronogramas])

  const toggleFilterCronogramaCollapse = useCallback((cronogramaId: string) => {
    setCollapsedFilterCronogramas((prev) => {
      const next = new Set(prev)
      if (next.has(cronogramaId)) next.delete(cronogramaId)
      else next.add(cronogramaId)
      return next
    })
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

  // Sufixo "cru" da baseline selecionada (ex.: "BL0"), usado para localizar a
  // baseline equivalente dentro de cada cronograma individual e na curva síntese.
  const rawBLSuffix = useMemo(() => {
    if (!selectedBLInfo) return undefined
    return selectedBLInfo.id.includes('__') ? selectedBLInfo.id.split('__').pop() : selectedBLInfo.id
  }, [selectedBLInfo])

  // Slots de LB sintética: só existem os que o usuário criou (LB0/LB1 por padrão).
  // Diferente de antes, NÃO é derivado automaticamente das baselines disponíveis —
  // "criadas conforme necessidade" via botão, não uma por baseline encontrada.
  const synthSlots = useMemo(() => {
    return synthSlotIds.map((id) => ({ id, label: `LB${id.replace(/^BL/i, '')} Sintética` }))
  }, [synthSlotIds])

  const addSynthSlot = useCallback(() => {
    setSynthSlotIds((prev) => {
      const nums = prev.map((id) => parseInt(id.replace(/^BL/i, ''), 10)).filter((n) => !isNaN(n))
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 0
      const next = [...prev, `BL${nextNum}`]
      localStorage.setItem(SYNTH_SLOTS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const removeSynthSlot = useCallback((slotId: string) => {
    setSynthSlotIds((prev) => {
      const next = prev.filter((id) => id !== slotId)
      localStorage.setItem(SYNTH_SLOTS_KEY, JSON.stringify(next))
      return next
    })
    // Baselines que estavam atribuídas ao slot removido voltam a ficar "não incluídas"
    // em vez de reaparecer implicitamente em outro slot.
    setBlSynthMap((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [k, v] of Object.entries(next)) {
        if (v === slotId) { next[k] = EXCLUDED_SLOT; changed = true }
      }
      if (changed) localStorage.setItem(BL_SYNTH_MAP_KEY, JSON.stringify(next))
      return changed ? next : prev
    })
    setCollapsedSynthSlots((prev) => {
      if (!prev.has(slotId)) return prev
      const next = new Set(prev)
      next.delete(slotId)
      return next
    })
  }, [])

  const handleBlSynthMapChange = useCallback((compositeBLId: string, slot: string) => {
    setBlSynthMap((prev) => {
      const next = { ...prev, [compositeBLId]: slot }
      localStorage.setItem(BL_SYNTH_MAP_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const toggleSynthSlotCollapse = useCallback((slotId: string) => {
    setCollapsedSynthSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }, [])

  // Resolve, para cada baseline composta disponível, o slot sintético efetivo — o
  // que o usuário escolheu em Opções, ou o sufixo cru por padrão SE esse slot ainda
  // existir na lista atual. Se o cronograma tem uma baseline cujo sufixo não
  // corresponde a nenhuma LB sintética criada, ela fica de fora da síntese até o
  // usuário criar o slot e marcá-la manualmente — em vez de "vazar" para um slot
  // fantasma que não aparece na UI.
  const resolvedBlSynthMap = useMemo(() => {
    const slotIdSet = new Set(synthSlotIds)
    const map: BLSynthMap = {}
    for (const bl of availableBLs) {
      const raw = bl.id.includes('__') ? bl.id.split('__').pop()! : bl.id
      const explicit = blSynthMap[bl.id]
      if (explicit !== undefined) {
        map[bl.id] = explicit === EXCLUDED_SLOT || slotIdSet.has(explicit) ? explicit : EXCLUDED_SLOT
      } else {
        map[bl.id] = slotIdSet.has(raw) ? raw : EXCLUDED_SLOT
      }
    }
    return map
  }, [availableBLs, blSynthMap, synthSlotIds])

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
      // Só as próprias baselines do cronograma — usar availableBLs (global) faria um
      // cronograma "herdar" a baseline de outro que compartilhe o mesmo índice (BL0 etc).
      const ownBLs = availableBLs.filter((bl) => bl.id.startsWith(`${c.id}__`))
      // Id composto da LB de referência DENTRO deste cronograma — usado só pra decidir
      // onde a curva "começa" (corte de semanas vazias), pra não considerar outras
      // baselines (BL1, BL2...) que não estão sendo exibidas na tabela/gráfico.
      const referenceBLId = rawBLSuffix ? ownBLs.find((bl) => bl.id.endsWith(`__${rawBLSuffix}`))?.id : undefined
      const curve = buildCurveFromRawPoints(rawPoints, granularity, unit, ownBLs, c.dados?.weekStartDay ?? 5, referenceBLId)
      return {
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        peso: c.peso,
        curve,
        source: curve.length > 0 ? 'timephased' as const : 'synthetic' as const,
      }
    })
  }, [selectedCronogramasData, unit, availableBLs, granularity, activityExclusions, rawBLSuffix])

  const cronCurvesFull = useMemo(() => {
    return selectedCronogramasData.map((c) => {
      const ownBLs = availableBLs.filter((bl) => bl.id.startsWith(`${c.id}__`))
      const referenceBLId = rawBLSuffix ? ownBLs.find((bl) => bl.id.endsWith(`__${rawBLSuffix}`))?.id : undefined
      return buildCurveFromRawPoints(c.dados?.timephased?.rawPoints, granularity, unit, ownBLs, c.dados?.weekStartDay ?? 5, referenceBLId)
    })
  }, [selectedCronogramasData, unit, availableBLs, granularity, rawBLSuffix])

  const curveData = useMemo(() => {
    return cronCurves.length === 0
      ? []
      : cronCurves.length === 1
        ? cronCurves[0].curve
        : consolidateCurves(
            cronCurves.map((c) => c.curve),
            'soma',
            cronCurves.map((c) => c.peso),
            resolvedBlSynthMap,
            rawBLSuffix,
          )
  }, [cronCurves, resolvedBlSynthMap, rawBLSuffix])

  const curveDataFull = useMemo(() => {
    return cronCurvesFull.length === 0
      ? []
      : cronCurvesFull.length === 1
        ? cronCurvesFull[0]
        : consolidateCurves(cronCurvesFull, 'soma', cronCurves.map((c) => c.peso), resolvedBlSynthMap, rawBLSuffix)
  }, [cronCurvesFull, cronCurves, resolvedBlSynthMap, rawBLSuffix])

  const overallPace = useMemo(
    () => computeOverallPace(curveDataFull, granularity, weekStartDay),
    [curveDataFull, granularity, weekStartDay],
  )

  // Início/Término do cronograma atual (replanejado) e término da BL0 original, um
  // por cronograma selecionado no filtro. Término da BL0 vem das atividades
  // (BaselineFinish), não do <FinishDate> do projeto — esse só existe para o
  // cronograma atual.
  const scheduleInfo = useMemo(() => {
    if (selectedCronogramasData.length === 0) return []
    return selectedCronogramasData.map((c) => {
      let blFinish: Date | null = null
      for (const act of c.dados?.activities || []) {
        if (act.isSummary) continue
        const blf = act.baselines?.[0]?.finish
        if (blf && (!blFinish || blf > blFinish)) blFinish = blf
      }
      return {
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        start: c.dados?.startDate ?? null,
        finish: c.dados?.finishDate ?? null,
        blFinish,
      }
    })
  }, [selectedCronogramasData])

  const unitLabel = unit === 'HH' ? 'Horas de Trabalho' : 'Custo (R$)'

  const selectedBLTotal = useMemo(() => {
    if (!selectedBLInfo) return 0
    return unit === 'HH' ? selectedBLInfo.totalWork / 60 : selectedBLInfo.totalCost
  }, [selectedBLInfo, unit])

  const localBLInfoFor = useCallback(
    (cronogramaId: string): { id: string; label: string } | undefined => {
      if (!rawBLSuffix) return undefined
      const group = baselinesByCronograma.find((g) => g.cronogramaId === cronogramaId)
      const bl = group?.baselines.find((b) => b.id.endsWith(`__${rawBLSuffix}`))
      return bl ? { id: bl.id, label: bl.label } : undefined
    },
    [rawBLSuffix, baselinesByCronograma],
  )

  const lastPeriod = curveData.length > 0 ? curveData[curveData.length - 1] : null
  // Mesmo denominador usado pelo card (computeAdvanceMetrics): total de BL0 quando
  // disponível, senão o planejado (PV) do cronograma atual. Usar sempre o PV aqui
  // fazia o gráfico e o eixo Y (0-100%) baterem com um total diferente do que o card
  // mostra, sempre que o cronograma foi replanejado com mais/menos trabalho que a
  // linha de base original.
  const finalPlanned = useMemo(() => {
    if (!lastPeriod) return 1
    const bl0Total = sumBL0(lastPeriod.blCum)
    return bl0Total > 0 ? bl0Total : (lastPeriod.planned || 1)
  }, [lastPeriod])

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

  // LBs visíveis (não ocultadas em Opções) — o card "Avanço Atual" mostra uma coluna
  // de avanço por cada uma dessas, em vez do antigo "Avanço Previsto" (PV do
  // cronograma atual), que confundia mais do que ajudava quando o cronograma foi
  // replanejado com um total diferente da baseline.
  const visibleBLs = useMemo(
    () => consolidatedBLs.filter((bl) => !hiddenBLs.includes(bl.id)),
    [consolidatedBLs, hiddenBLs],
  )

  const advances = useMemo(
    () => computeAdvanceMetrics(curveData, visibleBLs.map((b) => b.id)),
    [curveData, visibleBLs],
  )

  const advanceBaselines = useMemo(() => {
    if (!advances) return []
    return advances.baselines.map((ab) => {
      const info = visibleBLs.find((b) => b.id === ab.id)
      return {
        id: ab.id,
        label: info?.label || ab.id,
        color: BL_COLORS[info?.index ?? 0] || '#00AA00',
        metric: ab.metric,
      }
    })
  }, [advances, visibleBLs])

  const syntheticBLInfo = useMemo(() => {
    if (!rawBLSuffix) return undefined
    const bl = consolidatedBLs.find((b) => b.id === rawBLSuffix)
    return bl ? { id: bl.id, label: bl.label } : undefined
  }, [rawBLSuffix, consolidatedBLs])

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
        const ccLast = cc.curve[cc.curve.length - 1]
        const ccBL0 = ccLast ? sumBL0(ccLast.blCum) : 0
        const finalCronPlanned = ccBL0 > 0 ? ccBL0 : (ccLast?.planned || 0)
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
        scheduleInfo={scheduleInfo}
        selectedBLInfo={selectedBLInfo ? { label: selectedBLInfo.label } : undefined}
        selectedBLTotal={selectedBLTotal}
      />

      {advances && (
        <SCurveAdvanceCard
          statusDate={advances.statusDate}
          statusDateFormatted={advances.statusDateFormatted}
          statusEndDateFormatted={advances.statusEndDateFormatted}
          real={advances.real}
          baselines={advanceBaselines}
          unit={unit}
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

                {selectedCronogramasData.map((c) => {
                  const isMulti = selectedCronogramasData.length > 1
                  const isCollapsed = isMulti && collapsedFilterCronogramas.has(c.id)
                  return (
                    <div key={c.id} className="pt-3 border-t border-gray-100 dark:border-gray-700">
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
                            <ChevronDown size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                          ) : (
                            <ChevronUp size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
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
              <div className="absolute top-full left-0 mt-1 w-64 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-4 space-y-4">
                {consolidatedBLs.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">LB de referência</span>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">
                      Usada no Ritmo e na Aderência do card ao passar o mouse no gráfico.
                    </p>
                    <select
                      value={consolidatedBLs.some((bl) => bl.id === selectedBL) ? selectedBL : consolidatedBLs[0]?.id}
                      onChange={(e) => handleBLChange(e.target.value)}
                      className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                    >
                      {consolidatedBLs.map((bl) => (
                        <option key={bl.id} value={bl.id}>{bl.label}</option>
                      ))}
                    </select>
                  </div>
                )}
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

                {cronCurves.length > 1 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1.5">
                      Composição das LBs sintéticas
                    </span>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                      Marque quais baselines de cada cronograma entram em cada LB sintética. Crie mais LBs sintéticas conforme a necessidade.
                    </p>
                    <div className="space-y-3">
                      {synthSlots.map((slot) => {
                        const membersOfSlot = availableBLs.filter((bl) => resolvedBlSynthMap[bl.id] === slot.id)
                        const isCollapsed = collapsedSynthSlots.has(slot.id)
                        const isDefault = DEFAULT_SYNTH_SLOTS.includes(slot.id)
                        return (
                        <div key={slot.id}>
                          <div className="w-full flex items-center justify-between gap-2 group">
                            <button
                              type="button"
                              onClick={() => toggleSynthSlotCollapse(slot.id)}
                              className="flex-1 flex items-center justify-between gap-2 min-w-0"
                            >
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                {slot.label}{' '}
                                <span className="text-gray-400 dark:text-gray-500 font-normal">
                                  ({membersOfSlot.length})
                                </span>
                              </span>
                              {isCollapsed ? (
                                <ChevronDown size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0" />
                              ) : (
                                <ChevronUp size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0" />
                              )}
                            </button>
                            {!isDefault && (
                              <button
                                type="button"
                                onClick={() => removeSynthSlot(slot.id)}
                                title="Remover LB sintética"
                                className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                              >
                                <X size={13} className="text-gray-300 dark:text-gray-600 hover:text-red-500" />
                              </button>
                            )}
                          </div>
                          {!isCollapsed && (
                            <div className="space-y-1 mt-1 pl-1">
                              {availableBLs.map((bl) => {
                                const checked = resolvedBlSynthMap[bl.id] === slot.id
                                return (
                                  <label key={bl.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleBlSynthMapChange(bl.id, checked ? EXCLUDED_SLOT : slot.id)}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    {bl.label}
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={addSynthSlot}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition"
                    >
                      <Plus size={13} /> Adicionar LB sintética
                    </button>
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
                   onClick={() => { exportSCurveToExcel(curveData, consolidatedBLs.map((b) => b.id), unitLabel, project.nome, advances ? { statusDate: advances.statusDate, statusDateFormatted: advances.statusDateFormatted, real: advances.real, baselines: advanceBaselines } : undefined, periodColLabel); setOpenPanel(null) }}
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {selectedCronogramasData.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{ backgroundColor: c.cor + '15', borderColor: c.cor + '40', color: c.cor }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.cor }} />
              {c.nome}
            </span>
          ))}
          {selectedBLInfo && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              LB: {selectedBLInfo.label}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {GRANULARITY_OPTIONS.find((g) => g.value === granularity)?.title}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {unitLabel}
          </span>
          {hasActivityFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              Filtro de atividade ativo
            </span>
          )}
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
          {cronCurves.map((cc) => (
            <SCurveWideTable
              key={cc.id}
              title={cc.nome}
              color={cc.cor}
              curveData={cc.curve}
              selectedBLInfo={localBLInfoFor(cc.id)}
              unit={unit}
            />
          ))}
          {cronCurves.length > 1 && (
            <SCurveWideTable
              title="Síntese ponderada (todos os cronogramas)"
              curveData={curveData}
              selectedBLInfo={syntheticBLInfo}
              unit={unit}
              defaultOpen
            />
          )}
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
