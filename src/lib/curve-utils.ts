import { startOfMonth, startOfYear, startOfDay, format } from 'date-fns'
import type { TimephasedDataPoint, BaselineInfo, WBSAssignment } from './xml-parser'
import type { ConsolidationMethod } from './project-store'
import { startOfWeek, getISOWeekYearAndNumber, parseISODateStr } from './iso-week'

export type CurveGranularity = 'day' | 'week' | 'month' | 'year'
export type CalculationUnit = 'HH' | 'R$'

export const PERIOD_LABEL: Record<CurveGranularity, string> = { day: 'Dia', week: 'Sem.', month: 'Mês', year: 'Ano' }
export const PERIOD_TABLE_LABEL: Record<CurveGranularity, string> = { day: 'Diária', week: 'Semanal', month: 'Mensal', year: 'Anual' }

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const BL_COLORS = [
  '#0066CC', '#333333', '#00AA00', '#FF9900', '#CC0000',
  '#9933FF', '#FF00FF', '#00CCCC', '#FFCC00', '#00FF99', '#FF6600',
]
export const COLOR_REAL = '#9933FF'
export const COLOR_FORECAST = '#FF0000'
export const COLOR_PLANNED = '#64748b'

/** Soma todos os blCum que representam BL0 (chave exata 'BL0' ou composta 'cronId__BL0'). */
export function sumBL0(blCum: Record<string, number>): number {
  let sum = 0
  for (const [k, v] of Object.entries(blCum)) {
    if (k === 'BL0' || k.endsWith('__BL0')) sum += v
  }
  return sum
}

export interface CurvePeriod {
  date: string
  label: string
  planned: number
  actual: number
  forecast: number
  plannedPeriod: number
  actualPeriod: number
  forecastPeriod: number
  spiPeriod: number | null
  blCum: Record<string, number>
  blPeriod: Record<string, number>
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function pct(value: number, total: number): number {
  return total > 0 ? round2((value / total) * 100) : 0
}

export function fmtVal(v: number, unit: CalculationUnit): string {
  if (unit === 'HH') return `${Math.round(v).toLocaleString('pt-BR')} HH`
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export function fmtK(v: number, unit: CalculationUnit): string {
  if (unit === 'HH') return `${(v / 1000).toFixed(1)}k HH`
  return `R$ ${(v / 1000).toFixed(0)}k`
}

interface BucketKeyResult {
  key: string
  label: string
  sortDate: Date
}

/**
 * Rótulo do eixo X do gráfico da Curva S, no padrão "AAAA-ww" (semana) ou
 * "AAAA-MM" (mês numérico) — mesmo estilo usado por ferramentas como o Oliplan.
 * `weekStartDay` vem de ParsedProject.weekStartDay (0=dom..6=sáb, default 5=sex).
 */
export function formatAxisTick(date: Date, granularity: CurveGranularity, weekStartDay = 5): string {
  switch (granularity) {
    case 'day':
      return format(date, 'dd/MM')
    case 'week': {
      const { year, week } = getISOWeekYearAndNumber(new Date(date), weekStartDay)
      return `${year}-${String(week).padStart(2, '0')}`
    }
    case 'month':
      return format(date, 'yyyy-MM')
    case 'year':
    default:
      return format(date, 'yyyy')
  }
}

/**
 * Chave/rótulo/data-de-ordenação para agrupar um ponto temporal por granularidade.
 * Semana segue o calendário do cronograma (dia inicial = weekStartDay, conforme a
 * opção "A semana começa no(a)" configurada no MS Project), rótulo "AAAA-ww".
 */
export function bucketKey(date: Date, granularity: CurveGranularity, weekStartDay = 5): BucketKeyResult {
  switch (granularity) {
    case 'day': {
      const d = startOfDay(date)
      return { key: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM/yyyy'), sortDate: d }
    }
    case 'month': {
      const d = startOfMonth(date)
      return { key: format(d, 'yyyy-MM'), label: `${MONTHS_PT[d.getMonth()]}/${d.getFullYear()}`, sortDate: d }
    }
    case 'year': {
      const d = startOfYear(date)
      return { key: format(d, 'yyyy'), label: format(d, 'yyyy'), sortDate: d }
    }
    case 'week':
    default: {
      const dt = new Date(date)
      const d = startOfWeek(dt, weekStartDay)
      const { year, week } = getISOWeekYearAndNumber(dt, weekStartDay)
      const label = `${year}-${String(week).padStart(2, '0')}`
      return { key: format(d, 'yyyy-MM-dd'), label, sortDate: d }
    }
  }
}

/**
 * Calcula, para cada ponto Type 2 (Trabalho Real), a fração que conta como Valor
 * Agregado (earned value): a soma acumulada do trabalho real de um mesmo assignment
 * é limitada ao seu próprio orçamento de Baseline 0. Sem isso, retrabalho/horas-extra
 * lançadas além do orçado inflam o "Avanço Real" acima de 100%, mesmo que a tarefa
 * já esteja fisicamente 100% concluída — Type 2 é "HH apontadas", não "% concluído".
 * Assignments sem baseline conhecida são excluídos do Real inteiramente (não têm
 * peso na baseline, então não devem contar no Avanço Real x Previsto).
 */
function capActualByAssignmentBaseline(rawPoints: TimephasedDataPoint[]): Map<TimephasedDataPoint, number> {
  const baselineByUid = new Map<number, number>()
  for (const p of rawPoints) {
    if (p.type === 4 && (p.baselineIndex ?? 0) === 0) {
      baselineByUid.set(p.uid, (baselineByUid.get(p.uid) || 0) + p.valueHours)
    }
  }

  // point.start pode chegar como string quando os dados vêm de round-trip por
  // localStorage (JSON não preserva o tipo Date) — normaliza antes de comparar.
  const actualPoints = rawPoints
    .filter((p) => p.type === 2)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const cumByUid = new Map<number, number>()
  const earned = new Map<TimephasedDataPoint, number>()

  for (const p of actualPoints) {
    const budget = baselineByUid.get(p.uid)
    const prevCum = cumByUid.get(p.uid) || 0
    const newCum = prevCum + p.valueHours
    cumByUid.set(p.uid, newCum)
    const delta = budget !== undefined ? Math.min(newCum, budget) - Math.min(prevCum, budget) : 0
    earned.set(p, delta)
  }

  return earned
}

/**
 * Filtra rawPoints excluindo os pontos cujo assignment pertence a uma atividade
 * excluída pelo filtro de atividades do WBS (ver ActivityFilterTree). TimephasedDataPoint.uid
 * é o UID do assignment, não da atividade — o mapeamento passa por WBSAssignment.taskUid.
 */
export function filterRawPointsByExcludedActivities(
  rawPoints: TimephasedDataPoint[] | undefined,
  assignments: WBSAssignment[] | undefined,
  excludedActivityUids: Set<number>,
): TimephasedDataPoint[] | undefined {
  if (!rawPoints || excludedActivityUids.size === 0) return rawPoints
  const excludedAssignmentUids = new Set(
    (assignments || []).filter((a) => excludedActivityUids.has(a.taskUid)).map((a) => a.uid),
  )
  if (excludedAssignmentUids.size === 0) return rawPoints
  return rawPoints.filter((p) => !excludedAssignmentUids.has(p.uid))
}

/**
 * Constrói CurvePeriod[] a partir dos pontos brutos (rawPoints) do timephased,
 * reagregando por dia/semana ISO/mês/ano no cliente (sem reparsear o XML).
 * Custo real (AC) não existe na estrutura timephased — quando unit='R$', o valor
 * "realizado" do período permanece 0, igual ao comportamento pré-existente.
 *
 * referenceBLId (opcional): id composto da LB de referência exibida (ex.:
 * "cronId__BL0"). Quando informado, o corte de semanas vazias no início/fim só
 * considera essa baseline — sem isso, um cronograma pode ter até 11 baselines
 * (BL0-BL10) e o corte considerava QUALQUER uma delas ter valor, mesmo as que não
 * aparecem na tabela/gráfico, fazendo a curva "começar" numa semana onde tudo que é
 * exibido (planejado, real, LB de referência) está zerado.
 */
export function buildCurveFromRawPoints(
  rawPoints: TimephasedDataPoint[] | undefined,
  granularity: CurveGranularity,
  unit: CalculationUnit,
  availableBLs: BaselineInfo[],
  weekStartDay = 5,
  referenceBLId?: string,
): CurvePeriod[] {
  if (!rawPoints || rawPoints.length === 0) return []

  interface Bucket {
    label: string
    sortDate: Date
    workPlanned: number   // Type 1: Trabalho Planejado do cronograma atual
    planned: number       // fallback:Baseline 0 Work (Type 4), usado quando Type 1 ausente
    actual: number
    costPlanned: number
    baselines: Record<number, number>
    hasOwnWork: boolean   // true se tem Type 1, 2 ou 22 (não apenas baseline)
  }

  const grouped = new Map<string, Bucket>()
  const earnedDeltas = capActualByAssignmentBaseline(rawPoints)

  // Type 1 (Trabalho Planejado) é a distribuição de trabalho do cronograma ATUAL —
  // reflete replanejamentos. Type 4 (Baseline 0) é o plano congelado.
  // Para PV, preferimos Type 1 (se disponível), fallback para Type 4 (BL0).
  // Type 22 (Custo Planejado) é usado como PV apenas quando unit='R$'.
  let totalType1 = 0
  let totalType2 = 0
  let totalType4 = 0
  let type1Periods = 0
  for (const point of rawPoints) {
    if (point.type === 1) { totalType1 += point.valueHours; type1Periods++ }
    if (point.type === 2) totalType2 += point.valueHours
    if (point.type === 4) totalType4 += point.valueHours
  }
  const hasWorkPlanned = totalType1 > 0

  console.groupCollapsed('[CurveDebug] buildCurveFromRawPoints')
  console.log('Total rawPoints:', rawPoints.length)
  console.log('Type 1 (Planejado):', { total: round2(totalType1), points: type1Periods })
  console.log('Type 2 (Real):', { total: round2(totalType2) })
  console.log('Type 4 (BL0):', { total: round2(totalType4) })
  console.log('hasWorkPlanned:', hasWorkPlanned)
  console.log('unit:', unit, '| granularity:', granularity)

  const now = new Date()

  // Calcula o comprimento do período em ms para filtrar Type 2 e statusIdx.
  // Só inclui trabalho real de períodos cujo FIM já transcorreu.
  const periodMs = granularity === 'day' ? 86400000
    : granularity === 'month' ? 30 * 86400000
    : granularity === 'year' ? 365 * 86400000
    : 7 * 86400000 // default: semanal

  for (const point of rawPoints) {
    const { key, label, sortDate } = bucketKey(point.start, granularity, weekStartDay)
    let entry = grouped.get(key)
    if (!entry) {
      entry = { label, sortDate, workPlanned: 0, planned: 0, actual: 0, costPlanned: 0, baselines: {}, hasOwnWork: false }
      grouped.set(key, entry)
    }
    switch (point.type) {
      case 1: // Trabalho Planejado (Work) — distribuição do cronograma atual
        entry.workPlanned += point.valueHours
        entry.hasOwnWork = true
        break
      case 2: { // Trabalho Real — só acumular de períodos cujo fim já transcorreu
        const periodEnd = new Date(sortDate.getTime() + periodMs - 86400000)
        if (periodEnd <= now) {
          entry.actual += earnedDeltas.get(point) ?? point.valueHours
          entry.hasOwnWork = true
        }
        break
      }
      case 4: { // Baseline Work (BL0 e específicas via baselineIndex)
        const blIdx = point.baselineIndex ?? 0
        entry.baselines[blIdx] = (entry.baselines[blIdx] || 0) + point.valueHours
        // Sempre registrar como fallback para PV quando Type 1 não existir
        if (blIdx === 0) entry.planned += point.valueHours
        break
      }
      case 5: { // Baseline Work (alguns exports usam Type 5 em vez de Type 4)
        const blIdx = point.baselineIndex ?? 0
        entry.baselines[blIdx] = (entry.baselines[blIdx] || 0) + point.valueHours
        if (blIdx === 0) entry.planned += point.valueHours
        break
      }
      case 16: { // Baseline 1 Work (confirmado empiricamente)
        entry.baselines[1] = (entry.baselines[1] || 0) + point.valueHours
        break
      }
      case 22: // Custo Acumulado Planejado (R$)
        entry.costPlanned += point.valueHours
        entry.hasOwnWork = true
        break
      // Types 9, 10, 11, 18, 19, 24: ignorados (acumulados/custo/unidades)
    }
  }

  const sortedKeys = Array.from(grouped.keys()).sort(
    (a, b) => grouped.get(a)!.sortDate.getTime() - grouped.get(b)!.sortDate.getTime(),
  )

  const periods: CurvePeriod[] = []
  const bucketOwnWork: boolean[] = [] // rastreia períodos com trabalho próprio (Type 1/2/22)
  let cumPlanned = 0
  let cumActual = 0

  // Primeiro passo: monta os períodos com planned e actual para localizar a data de status
  for (const key of sortedKeys) {
    const bucket = grouped.get(key)!

    // PV (Planned Value):
    //   unit='HH': usar Type 1 (workPlanned) se o projeto tem dados de Type 1,
    //              senão fallback Type 4 (planned/BL0).
    //   unit='R$': usar Type 22 (costPlanned)
    const weeklyP = unit === 'HH'
      ? (hasWorkPlanned ? bucket.workPlanned : bucket.planned)
      : bucket.costPlanned
    const weeklyA = unit === 'HH' ? bucket.actual : 0

    cumPlanned += weeklyP
    cumActual += weeklyA

    const blCum: Record<string, number> = {}
    const blPeriod: Record<string, number> = {}
    for (const bl of availableBLs) {
      const blHours = bucket.baselines[bl.index] || 0
      const blVal = unit === 'HH' ? blHours : 0
      const prevBL = periods.length > 0 ? (periods[periods.length - 1]?.blCum[bl.id] || 0) : 0
      blCum[bl.id] = round2(prevBL + blVal)
      blPeriod[bl.id] = round2(blVal)
    }

    periods.push({
      date: format(bucket.sortDate, 'yyyy-MM-dd'),
      label: bucket.label,
      planned: round2(cumPlanned),
      actual: round2(cumActual),
      forecast: 0,
      plannedPeriod: round2(weeklyP),
      actualPeriod: round2(weeklyA),
      forecastPeriod: 0,
      spiPeriod: weeklyP > 0 ? round2(weeklyA / weeklyP) : null,
      blCum,
      blPeriod,
    })
    bucketOwnWork.push(bucket.hasOwnWork)
  }

  // Segundo passo: calcula o forecast.
  // Forecast = trabalho distribuído nos períodos futuros da data de status.
  // Nos períodos até a data de status, forecast = actual (o que já foi feito).
  // Nos períodos futuros, forecast = actual_no_status + trabalho planejado restante.
  let statusIdx = 0
  for (let i = periods.length - 1; i >= 0; i--) {
    const wd = parseISODateStr(periods[i].date)
    const periodEnd = new Date(wd.getTime() + periodMs - 86400000)
    if (periodEnd <= now) { statusIdx = i; break }
  }

  const actualAtStatus = periods[statusIdx].actual
  let remainingPlanned = 0

  for (let i = 0; i < periods.length; i++) {
    if (i <= statusIdx) {
      periods[i].forecast = periods[i].actual
      periods[i].forecastPeriod = periods[i].actualPeriod
    } else {
      remainingPlanned += periods[i].plannedPeriod
      periods[i].forecast = round2(actualAtStatus + remainingPlanned)
      periods[i].forecastPeriod = periods[i].plannedPeriod
    }
  }

  // Considera só a LB de referência (quando informada) pra decidir se um período
  // "tem trabalho" de baseline — sem isso, qualquer uma das até 11 baselines
  // possíveis (BL0-BL10) contava, mesmo as que não aparecem na tabela/gráfico.
  const blHasWork = (blPeriod: Record<string, number>): boolean => {
    if (referenceBLId) return (blPeriod[referenceBLId] || 0) !== 0
    return Object.values(blPeriod).some((v) => v !== 0)
  }

  // Onde o trabalho REAL começa (mesmo critério do trim leading, mas calculado
  // adiantado) — precisamos disso já aqui para o ritmo médio abaixo não ser diluído
  // por semanas vazias no início dos dados brutos (comum quando o XML cobre um
  // intervalo de datas bem maior que o trabalho em si).
  let firstWorkIdx = 0
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    const hasWork = p.plannedPeriod !== 0 || p.actualPeriod !== 0 || blHasWork(p.blPeriod)
    if (hasWork) { firstWorkIdx = i; break }
  }

  // Terceiro passo: se o atraso acumulado até a data de status ainda deixa o
  // Forecast abaixo do total planejado no fim do cronograma original, o forecast
  // "trava" abaixo de 100% pra sempre — ele nunca recupera o déficit, só absorve o
  // trabalho que já estava agendado pra depois do status. Em vez disso, estende a
  // projeção com períodos extras no ritmo médio real (actual acumulado / períodos
  // decorridos DESDE que o trabalho começou) até o forecast fechar o total
  // planejado — reprojeta o término em vez de subestimar o avanço final. Contar
  // "períodos decorridos" desde o índice 0 (em vez de firstWorkIdx) sub-estimaria o
  // ritmo real sempre que há semanas vazias antes do início do trabalho, fazendo a
  // extensão precisar de semanas de mais pra fechar — na prática, nunca fechando
  // dentro do limite de segurança abaixo. Sem histórico de ritmo (avgPace = 0) não
  // há como extrapolar; o forecast permanece como está.
  {
    const finalBAC = periods[periods.length - 1].planned
    const forecastAtEnd = periods[periods.length - 1].forecast
    const remainingDeficit = round2(finalBAC - forecastAtEnd)
    const elapsedPeriods = Math.max(1, statusIdx - firstWorkIdx + 1)
    const avgPace = actualAtStatus / elapsedPeriods

    if (remainingDeficit > 0.01 && avgPace > 0) {
      const last = periods[periods.length - 1]
      let cumForecast = last.forecast
      let cursorTime = parseISODateStr(last.date).getTime()
      const flatPlanned = last.planned
      const flatActual = last.actual
      const flatBLCum = { ...last.blCum }
      const zeroBLPeriod = Object.fromEntries(Object.keys(flatBLCum).map((k) => [k, 0]))

      let guard = 0
      while (cumForecast < finalBAC - 0.01 && guard < 520) {
        guard++
        cursorTime += periodMs
        const stepForecast = round2(Math.min(avgPace, finalBAC - cumForecast))
        cumForecast = round2(cumForecast + stepForecast)
        const { label, sortDate } = bucketKey(new Date(cursorTime), granularity, weekStartDay)
        periods.push({
          date: format(sortDate, 'yyyy-MM-dd'),
          label,
          planned: flatPlanned,
          actual: flatActual,
          forecast: cumForecast,
          plannedPeriod: 0,
          actualPeriod: 0,
          forecastPeriod: stepForecast,
          spiPeriod: null,
          blCum: { ...flatBLCum },
          blPeriod: { ...zeroBLPeriod },
        })
      }
    }
  }

  // Trim leading: remover períodos no início que não têm trabalho nenhum
  // (planejado, realizado ou baseline) — evita mostrar semanas vazias de 2025 etc.
  // firstWorkIdx já foi calculado acima (usado no ritmo médio da reprojeção do forecast).
  if (firstWorkIdx > 0) {
    periods.splice(0, firstWorkIdx)
  }

  // Trim trailing: remover períodos após o último que tem trabalho alocado (planejado,
  // realizado, baseline OU forecast — este último cobre os períodos extras que a
  // reprojeção do forecast adiciona além do fim do cronograma original). A Curva S
  // deve exibir apenas até o fim do projeto (ou do término reprojetado).
  let lastWorkIdx = periods.length - 1
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i]
    const hasWork = p.plannedPeriod !== 0 || p.actualPeriod !== 0 || p.forecastPeriod !== 0 || blHasWork(p.blPeriod)
    if (hasWork) { lastWorkIdx = i; break }
  }
  if (lastWorkIdx < periods.length - 1) {
    periods.length = lastWorkIdx + 1
  }

  // Debug: mostrar períodos construídos e forecast
  const lastP = periods[periods.length - 1]
  console.log('Períodos construídos:', periods.length)
  console.log('Primeiro período:', periods[0]?.label, '| Último:', lastP?.label)
  console.log('BAC (planned total):', lastP?.planned)
  console.log('Actual total:', lastP?.actual)
  console.log('Forecast total:', lastP?.forecast)
  console.table(periods.filter((p) => p.plannedPeriod > 0 || p.actualPeriod > 0).map((p) => ({
    label: p.label,
    plannedP: round2(p.plannedPeriod),
    actualP: round2(p.actualPeriod),
    planned: round2(p.planned),
    actual: round2(p.actual),
    forecast: round2(p.forecast),
  })))
  console.groupEnd()

  return periods
}

/**
 * Mapeia a chave composta de uma baseline (ex.: "cronA__BL0") para o "slot" sintético
 * ao qual ela deve pertencer na consolidação (ex.: "BL0"). Por padrão o slot é o
 * sufixo cru da própria chave (BL0 de A junta com BL0 de B), mas o usuário pode
 * reatribuir manualmente em "Opções" — útil quando cronogramas numeram baselines de
 * forma diferente (BL0 de um corresponde à BL1 de outro). Valor '' = excluir a
 * baseline da síntese.
 */
export type BLSynthMap = Record<string, string>

function resolveBlSlot(compositeKey: string, blSynthMap?: BLSynthMap): string {
  if (blSynthMap && compositeKey in blSynthMap) return blSynthMap[compositeKey]
  return compositeKey.includes('__') ? compositeKey.split('__').pop()! : compositeKey
}

export function consolidateCurves(
  curves: CurvePeriod[][],
  method: ConsolidationMethod,
  pesos: number[],
  blSynthMap?: BLSynthMap,
  referenceBLSlot?: string,
): CurvePeriod[] {
  if (curves.length === 0) return []
  if (curves.length === 1) return curves[0]

  const totalPeso = pesos.reduce((s, p) => s + p, 0)

  // BAC (Trabalho Planejado total, Type1/PV) de cada cronograma — TODAS as grandezas
  // (planned, actual, forecast E blCum/BL0) são normalizadas por esse MESMO BAC antes
  // de ponderar, igual ao que o app já faz para um cronograma isolado (finalPlanned é
  // sempre o PV total; o % de BL0 exibido no gráfico é BL0/PV, não BL0/BL0).
  // Usar um total diferente para o BL0 (o próprio BL0 daquele cronograma) quebraria
  // essa relação: Real e BL0 ficariam em escalas sintéticas diferentes ao reconverter
  // para valores absolutos, podendo mostrar Real > BL0 mesmo quando, por cronograma,
  // o Real nunca ultrapassa o BL0 (ele é limitado ao orçamento de baseline de cada
  // assignment — ver capActualByAssignmentBaseline).
  //
  // Ponderar pelo % (em vez do valor absoluto) evita que o peso configurado seja
  // ofuscado pela escala de HH de cada cronograma — um cronograma pequeno com peso
  // alto passa a pesar de fato o que o peso diz.
  const bacByCurve = curves.map((c) => c[c.length - 1]?.planned || 0)

  // Total "sintético" (escala de exibição) = média ponderada dos BACs de cada
  // cronograma. Serve só para converter os % combinados de volta a uma grandeza em
  // HH/R$ plausível para a tabela — o que importa para o cálculo é o % acima.
  const syntheticBAC = curves.reduce((sum, _c, ci) => {
    const peso = totalPeso > 0 ? pesos[ci] / totalPeso : 1 / curves.length
    return sum + bacByCurve[ci] * peso
  }, 0)

  // União ordenada de todas as datas de período entre os cronogramas. Cada curva é
  // "acumulada" (planned/actual/forecast/blCum já são somas cumulativas) — então para
  // qualquer data pegamos o ÚLTIMO período de cada curva com data <= essa data: antes
  // do cronograma começar, sua contribuição é 0; depois de terminar, ela "segura" o
  // valor final (não decresce).
  const dateSet = new Set<string>()
  const labelByDate = new Map<string, string>()
  for (const c of curves) {
    for (const p of c) {
      dateSet.add(p.date)
      if (!labelByDate.has(p.date)) labelByDate.set(p.date, p.label)
    }
  }
  const unionDates = Array.from(dateSet).sort()

  const pointers = curves.map(() => -1)
  const startTimes = curves.map((c) => (c.length > 0 ? parseISODateStr(c[0].date).getTime() : Infinity))

  const result: CurvePeriod[] = []

  for (const date of unionDates) {
    const targetTime = parseISODateStr(date).getTime()
    let planned = 0
    let actual = 0
    let forecast = 0
    const blCum: Record<string, number> = {}

    if (method === 'critico') {
      let maxPlanned = 0
      let maxActual = 0
      let maxForecast = 0
      for (let ci = 0; ci < curves.length; ci++) {
        const c = curves[ci]
        while (pointers[ci] + 1 < c.length && parseISODateStr(c[pointers[ci] + 1].date).getTime() <= targetTime) pointers[ci]++
        if (targetTime < startTimes[ci] || pointers[ci] < 0) continue
        const w = c[pointers[ci]]
        maxPlanned = Math.max(maxPlanned, w.planned)
        maxActual = Math.max(maxActual, w.actual)
        maxForecast = Math.max(maxForecast, w.forecast)
        for (const [k, v] of Object.entries(w.blCum)) {
          const blIdx = resolveBlSlot(k, blSynthMap)
          if (!blIdx) continue
          blCum[blIdx] = (blCum[blIdx] || 0) + v
        }
      }
      planned = maxPlanned
      actual = maxActual
      forecast = maxForecast
    } else {
      let pctPlanned = 0
      let pctActual = 0
      let pctForecast = 0
      const blPct: Record<string, number> = {}

      for (let ci = 0; ci < curves.length; ci++) {
        const c = curves[ci]
        while (pointers[ci] + 1 < c.length && parseISODateStr(c[pointers[ci] + 1].date).getTime() <= targetTime) pointers[ci]++
        if (targetTime < startTimes[ci] || pointers[ci] < 0) continue // cronograma ainda não começou: contribui 0
        const w = c[pointers[ci]]
        const peso = totalPeso > 0 ? pesos[ci] / totalPeso : 1 / curves.length
        const bac = bacByCurve[ci]
        if (bac <= 0) continue
        pctPlanned += (w.planned / bac) * peso
        pctActual += (w.actual / bac) * peso
        pctForecast += (w.forecast / bac) * peso
        for (const [k, v] of Object.entries(w.blCum)) {
          const blIdx = resolveBlSlot(k, blSynthMap)
          if (!blIdx) continue
          blPct[blIdx] = (blPct[blIdx] || 0) + (v / bac) * peso
        }
      }

      planned = pctPlanned * syntheticBAC
      actual = pctActual * syntheticBAC
      forecast = pctForecast * syntheticBAC
      for (const [blIdx, p] of Object.entries(blPct)) blCum[blIdx] = p * syntheticBAC
    }

    // blPeriod é derivado como delta do blCum entre períodos consecutivos (igual ao
    // que já se fazia para plannedPeriod/actualPeriod/forecastPeriod) — evita somar o
    // blPeriod "cru" de cada curva num índice que não corresponde à mesma data.
    const prev = result.length > 0 ? result[result.length - 1] : undefined
    const blPeriod: Record<string, number> = {}
    for (const [k, v] of Object.entries(blCum)) {
      blPeriod[k] = round2(v - (prev?.blCum[k] || 0))
    }

    result.push({
      date,
      label: labelByDate.get(date) || date,
      planned: round2(planned),
      actual: round2(actual),
      forecast: round2(forecast),
      plannedPeriod: round2(planned - (prev?.planned || 0)),
      actualPeriod: round2(actual - (prev?.actual || 0)),
      forecastPeriod: round2(forecast - (prev?.forecast || 0)),
      spiPeriod: null,
      blCum,
      blPeriod,
    })
  }

  for (const p of result) {
    p.spiPeriod = p.plannedPeriod > 0 ? round2(p.actualPeriod / p.plannedPeriod) : null
  }

  // Trim: remover períodos após o último com trabalho (mesma lógica de buildCurveFromRawPoints,
  // incluindo forecastPeriod — cobre os períodos extras da reprojeção do forecast).
  // Considera só a LB de referência quando informada, pelo mesmo motivo de
  // buildCurveFromRawPoints: outra LB sintética (não exibida) não deve decidir onde a
  // curva combinada termina.
  let lastWorkIdx = result.length - 1
  for (let i = result.length - 1; i >= 0; i--) {
    const p = result[i]
    const hasBLWork = referenceBLSlot ? (p.blPeriod[referenceBLSlot] || 0) !== 0 : Object.values(p.blPeriod).some((v) => v !== 0)
    const hasWork = p.plannedPeriod !== 0 || p.actualPeriod !== 0 || p.forecastPeriod !== 0 || hasBLWork
    if (hasWork) { lastWorkIdx = i; break }
  }
  if (lastWorkIdx < result.length - 1) {
    result.length = lastWorkIdx + 1
  }

  return result
}

export interface AdvanceMetric {
  percent: number
  absolute: number
  deltaPP: number
}

export interface AdvanceMetrics {
  statusDate: string
  statusDateFormatted: string
  statusEndDateFormatted: string
  real: AdvanceMetric
  baselines: Array<{ id: string; metric: AdvanceMetric }>
}

/**
 * Calcula o comprimento do período em ms a partir do MENOR gap entre
 * períodos consecutivos. Usa fallback de 7 dias (semanal) quando não
 * há dados suficientes.
 */
function computePeriodMs(periods: CurvePeriod[]): number {
  if (periods.length < 2) return 7 * 86400000
  let minGap = Infinity
  for (let i = 1; i < periods.length; i++) {
    const d0 = parseISODateStr(periods[i - 1].date).getTime()
    const d1 = parseISODateStr(periods[i].date).getTime()
    const gap = d1 - d0
    if (gap > 0 && gap < minGap) minGap = gap
  }
  return minGap < Infinity ? minGap : 7 * 86400000
}

/**
 * Índice do último período cujo FIM já transcorreu (data de status).
 * Para períodos semanais, o fim = sortDate + 6 dias.
 * A comparação é: sortDate + periodMs - 1 dia <= now.
 */
export function findStatusIndex(periods: CurvePeriod[]): number {
  const now = new Date()
  const periodMs = computePeriodMs(periods)
  let statusIdx = 0
  for (let i = periods.length - 1; i >= 0; i--) {
    const wd = parseISODateStr(periods[i].date)
    const periodEnd = new Date(wd.getTime() + periodMs - 86400000)
    if (periodEnd <= now) { statusIdx = i; break }
  }
  return statusIdx
}

/**
 * Busca valor de uma baseline em blCum, suportando tanto chaves compostas
 * ("cronId__BL0") quanto chaves simples ("BL0") — em qualquer direção: blId pode
 * vir composto enquanto blCum está normalizado (síntese ponderada) ou vice-versa
 * (cronograma único). Compara sempre pelo sufixo cru para cobrir as duas formas.
 */
export function lookupBL(blCum: Record<string, number>, blId: string): number {
  if (blId in blCum) return blCum[blId]
  const suffix = blId.includes('__') ? blId.split('__').pop()! : blId
  for (const [k, v] of Object.entries(blCum)) {
    const kSuffix = k.includes('__') ? k.split('__').pop()! : k
    if (kSuffix === suffix) return v
  }
  return 0
}

/**
 * "Avanço Previsto" (PV do cronograma ATUAL/replanejado no status) foi removido do
 * card — ele confundia mais do que ajudava sempre que o cronograma foi replanejado
 * com um total diferente da BL0 (o "previsto" e a "linha de base" divergiam sem
 * motivo óbvio pra quem olha o card). "Previsto", em EVM, já É a baseline — por isso
 * o card mostra Real + o avanço de cada LB marcada em Opções, sem essa 3ª métrica
 * redundante/confusa.
 */
export function computeAdvanceMetrics(
  curveData: CurvePeriod[],
  baselineIds: string[],
): AdvanceMetrics | null {
  if (curveData.length < 2) return null

  const statusIdx = findStatusIndex(curveData)
  const prevIdx = Math.max(0, statusIdx - 1)
  const period = curveData[statusIdx]
  const prevPeriod = curveData[prevIdx]

  // Denominador: total acumulado da Linha Base 0 (BL0) no último período.
  // Se BL0 não existir, usar o planned como fallback.
  const last = curveData[curveData.length - 1]
  const bl0Total = sumBL0(last.blCum)
  const totalPlanned = bl0Total > 0 ? bl0Total : last.planned
  const totalActual = period.actual
  const totalActualAtPrev = prevPeriod.actual

  // Totais gerais (último período) — usados nos valores absolutos do card,
  // para coincidir com a coluna "Total" da tabela.
  const totalActualAll = last.actual

  const realPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0
  const realPrevPct = totalPlanned > 0 ? (totalActualAtPrev / totalPlanned) * 100 : 0

  const wd = parseISODateStr(period.date)
  const statusDateFormatted = wd.toLocaleDateString('pt-BR')

  // Data de término = início + 6 dias (período de 7 dias)
  const endDate = new Date(wd.getFullYear(), wd.getMonth(), wd.getDate() + 6)
  const statusEndDateFormatted = endDate.toLocaleDateString('pt-BR')

  const baselines = baselineIds.map((id) => {
    const totalBL = lookupBL(period.blCum, id)
    const totalBLAtPrev = lookupBL(prevPeriod.blCum, id)
    const totalBLAll = lookupBL(last.blCum, id)
    const blPct = totalPlanned > 0 ? (totalBL / totalPlanned) * 100 : 0
    const blPrevPct = totalPlanned > 0 ? (totalBLAtPrev / totalPlanned) * 100 : 0
    return {
      id,
      metric: { percent: round2(blPct), absolute: round2(totalBLAll), deltaPP: round2(blPct - blPrevPct) },
    }
  })

  return {
    statusDate: period.label,
    statusDateFormatted,
    statusEndDateFormatted,
    real: { percent: round2(realPct), absolute: round2(totalActualAll), deltaPP: round2(realPct - realPrevPct) },
    baselines,
  }
}

/**
 * Regressão linear (mínimos quadrados) do realizado (actual) até a data de status,
 * usada para projetar o término em computeOverallPace. Retorna null quando não há
 * pontos suficientes (< 2).
 */
function linearRegressionOnActual(
  periods: CurvePeriod[],
  statusIdx: number,
): { slope: number; intercept: number } | null {
  const idxs: number[] = []
  for (let i = 0; i <= statusIdx; i++) if (periods[i].actual > 0) idxs.push(i)
  if (idxs.length < 2) return null

  const n = idxs.length
  const sumX = idxs.reduce((s, i) => s + i, 0)
  const sumY = idxs.reduce((s, i) => s + periods[i].actual, 0)
  const sumXY = idxs.reduce((s, i) => s + i * periods[i].actual, 0)
  const sumXX = idxs.reduce((s, i) => s + i * i, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export interface OverallPace {
  spiGeral: number
  metaPct: number
  terminoLabel: string | null
}

/**
 * Indicadores gerais de cabeçalho: SPI (EV/PV na data de status, padrão PMBOK),
 * Meta e Término previsto (extrapolação da regressão linear até atingir o total
 * planejado, formatado no rótulo da granularidade ativa).
 *
 * Meta = "produtividade necessária para terminar no Forecast": primeiro calcula-se
 * o TCPI de cronograma — quanto falta de Real sobre quanto falta de Previsto, ambos
 * em % do total planejado (BAC) — e depois compara esse TCPI com o SPI atual. O
 * resultado é o quanto o ritmo restante precisa melhorar (ou pode piorar, se
 * negativo) em relação ao ritmo já observado para que o Real alcance 100% exatamente
 * no último período do Forecast. Réplica da fórmula do Oliplan.
 */
export function computeOverallPace(periods: CurvePeriod[], granularity: CurveGranularity, weekStartDay = 5): OverallPace | null {
  if (periods.length < 2) return null

  const statusIdx = findStatusIndex(periods)
  const statusPeriod = periods[statusIdx]
  const finalPlanned = periods[periods.length - 1].planned

  // SPI "cru" (sem arredondar), usado no cálculo da Meta — arredondar só na exibição
  // final evita erro de arredondamento acumulado entre as duas fórmulas.
  const spiRaw = statusPeriod.planned > 0 ? statusPeriod.actual / statusPeriod.planned : 1
  const spiGeral = round2(spiRaw)

  const realPct = finalPlanned > 0 ? (statusPeriod.actual / finalPlanned) * 100 : 0
  const previstoPct = finalPlanned > 0 ? (statusPeriod.planned / finalPlanned) * 100 : 0
  const restantePrevisto = 100 - previstoPct
  const tcpi = restantePrevisto > 0 ? (100 - realPct) / restantePrevisto : 1
  const metaPct = spiRaw > 0 ? round2((tcpi / spiRaw - 1) * 100) : 0

  let terminoLabel: string | null = null
  const reg = linearRegressionOnActual(periods, statusIdx)
  if (reg && reg.slope > 0 && finalPlanned > 0) {
    const terminoIndex = (finalPlanned - reg.intercept) / reg.slope
    const first = parseISODateStr(periods[0].date).getTime()
    const second = periods.length > 1 ? parseISODateStr(periods[1].date).getTime() : first
    const stepMs = second - first || 1
    const terminoDate = new Date(first + terminoIndex * stepMs)
    terminoLabel = bucketKey(terminoDate, granularity, weekStartDay).label
  }

  return { spiGeral, metaPct, terminoLabel }
}
