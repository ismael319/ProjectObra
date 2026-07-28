import type { WBSActivity, WBSAssignment, TimephasedDataPoint } from './xml-parser'

export interface WbsNodeMetrics {
  blAcum: number      // % acumulado da própria BL0 (ou Planejado, se não houver BL0) até a data de status
  blSemana: number    // % da BL0 nos últimos 7 dias até a data de status
  realAcum: number    // % do Real acumulado até a data de status
  realSemana: number  // % do Real nos últimos 7 dias até a data de status
  forecast7d: number  // % do Planejado nos 7 dias SEGUINTES à data de status
  spi: number         // realAcum / blAcum
  deltaSemana: number // realSemana - blSemana, em pontos percentuais
  deltaAcum: number   // realAcum - blAcum, em pontos percentuais
  hasData: boolean    // false quando o nó não tem nenhum HH de baseline/planejado (nada pra calcular %)
}

const DAY_MS = 86400000

/**
 * Métricas por nó da EDT (BL/Real/Forecast/SPI), pra tabela de árvore da Curva S.
 * Escopo de cada nó = seus próprios assignments + os de TODOS os descendentes (por
 * prefixo de WBS, igual à árvore de src/pages/WBSTable.tsx) — não usa capActualBy-
 * AssignmentBaseline (curve-utils.ts): soma Real bruto por simplicidade/performance,
 * já que essa tabela é um detalhamento auxiliar, não o motor principal do EVM (que
 * continua sendo buildCurveFromRawPoints, inalterado). Não recalcula um CurvePeriod[]
 * inteiro por nó (seria caro pra uma árvore com centenas de linhas) — soma os pontos
 * relevantes de cada janela de tempo diretamente.
 */
export function computeWbsNodeMetrics(
  activities: WBSActivity[],
  assignments: WBSAssignment[],
  rawPoints: TimephasedDataPoint[] | undefined,
  statusDate: Date,
): Map<number, WbsNodeMetrics> {
  const result = new Map<number, WbsNodeMetrics>()
  if (!rawPoints || rawPoints.length === 0 || activities.length === 0) return result

  const pointsByAssignmentUid = new Map<number, TimephasedDataPoint[]>()
  for (const p of rawPoints) {
    const arr = pointsByAssignmentUid.get(p.uid)
    if (arr) arr.push(p)
    else pointsByAssignmentUid.set(p.uid, [p])
  }

  const ownAssignmentUidsByTask = new Map<number, number[]>()
  for (const a of assignments) {
    const arr = ownAssignmentUidsByTask.get(a.taskUid)
    if (arr) arr.push(a.uid)
    else ownAssignmentUidsByTask.set(a.taskUid, [a.uid])
  }

  const statusMs = statusDate.getTime()
  const weekAgoMs = statusMs - 7 * DAY_MS
  const plus7Ms = statusMs + 7 * DAY_MS

  const EMPTY = { blAcum: 0, blSemana: 0, realAcum: 0, realSemana: 0, forecast7d: 0, spi: 0, deltaSemana: 0, deltaAcum: 0, hasData: false }

  // Filhos diretos de cada wbs (pai = o próprio código sem o último segmento, ex.:
  // pai de "1.2.3" é "1.2") — construído uma vez em O(n), em vez de escanear TODAS
  // as atividades pra achar descendentes de CADA nó (O(n²), pesado em cronogramas
  // com centenas/milhares de tarefas — era a causa da Curva S ficar lenta).
  const childrenByWbs = new Map<string, WBSActivity[]>()
  for (const a of activities) {
    const lastDot = a.wbs.lastIndexOf('.')
    if (lastDot === -1) continue
    const parentWbs = a.wbs.slice(0, lastDot)
    const arr = childrenByWbs.get(parentWbs)
    if (arr) arr.push(a)
    else childrenByWbs.set(parentWbs, [a])
  }

  // Memoiza os pontos "próprios + de todos os descendentes" de cada wbs — cada nó só
  // concatena os resultados (já calculados) dos filhos diretos, em vez de re-escanear
  // a árvore inteira.
  const pointsCache = new Map<string, TimephasedDataPoint[]>()
  function pointsForSubtree(activity: WBSActivity): TimephasedDataPoint[] {
    const cached = pointsCache.get(activity.wbs)
    if (cached) return cached
    let pts: TimephasedDataPoint[] = (ownAssignmentUidsByTask.get(activity.uid) ?? []).flatMap((uid) => pointsByAssignmentUid.get(uid) ?? [])
    for (const child of childrenByWbs.get(activity.wbs) ?? []) {
      pts = pts.concat(pointsForSubtree(child))
    }
    pointsCache.set(activity.wbs, pts)
    return pts
  }

  for (const activity of activities) {
    const pts = pointsForSubtree(activity)
    if (pts.length === 0) {
      result.set(activity.uid, EMPTY)
      continue
    }

    let bl0Total = 0
    let blAtStatus = 0
    let blPeriodWeek = 0
    let plannedTotal = 0
    let forecastWindow = 0
    let realAtStatus = 0
    let realPeriodWeek = 0

    for (const p of pts) {
      const t = p.start.getTime()
      if (p.type === 4 && (p.baselineIndex ?? 0) === 0) {
        bl0Total += p.valueHours
        if (t <= statusMs) blAtStatus += p.valueHours
        if (t > weekAgoMs && t <= statusMs) blPeriodWeek += p.valueHours
      } else if (p.type === 1) {
        plannedTotal += p.valueHours
        if (t > statusMs && t <= plus7Ms) forecastWindow += p.valueHours
      } else if (p.type === 2) {
        if (t <= statusMs) realAtStatus += p.valueHours
        if (t > weekAgoMs && t <= statusMs) realPeriodWeek += p.valueHours
      }
    }

    const bac = bl0Total > 0 ? bl0Total : plannedTotal
    if (bac <= 0) {
      result.set(activity.uid, EMPTY)
      continue
    }

    const blAcum = (blAtStatus / bac) * 100
    const blSemana = (blPeriodWeek / bac) * 100
    const realAcum = (realAtStatus / bac) * 100
    const realSemana = (realPeriodWeek / bac) * 100
    const forecast7d = (forecastWindow / bac) * 100

    result.set(activity.uid, {
      blAcum,
      blSemana,
      realAcum,
      realSemana,
      forecast7d,
      spi: blAcum > 0 ? realAcum / blAcum : 0,
      deltaSemana: realSemana - blSemana,
      deltaAcum: realAcum - blAcum,
      hasData: true,
    })
  }

  return result
}
