// Indicadores da Programação Semanal (estilo Last Planner / PPC), calculados
// automaticamente a partir do cronograma (%Completo + datas) — não há apontamento
// manual de status por atividade, então "Extra" nunca ocorre (só existe quando alguém
// registra uma atividade fora do planejado) e os números são uma aproximação.

import { startOfISOWeek, endOfISOWeek, eachDayOfInterval, startOfDay, endOfDay, getISOWeek, getISOWeekYear } from 'date-fns'
import type { WBSActivity } from './xml-parser'
import { toDate } from './utils'

export type DayBucket = 'concluida' | 'parcial' | 'naoConcluida' | 'pendente'

export interface DayCounts {
  date: Date
  total: number
  concluidas: number
  parciais: number
  naoConcluidas: number
  pendentes: number
  extras: number
}

export interface GroupBreakdown {
  label: string
  base: number
  aderencia: number
}

export interface WeekIndicators {
  weekStart: Date
  weekEnd: Date
  weekLabel: string
  days: DayCounts[]
  base: number
  concluidas: number
  parciais: number
  naoConcluidas: number
  ppc: number
  aderenciaSemanal: number
  porEmpresa: GroupBreakdown[]
  porDisciplina: GroupBreakdown[]
  porArea: GroupBreakdown[]
  porEtapa: GroupBreakdown[]
  porEncarregado: GroupBreakdown[]
}

function isSchedulable(a: WBSActivity): boolean {
  return !a.isSummary && !a.isMilestone
}

function overlaps(act: WBSActivity, from: Date, to: Date): boolean {
  const s = toDate(act.start).getTime()
  const f = toDate(act.finish).getTime()
  return s <= to.getTime() && f >= from.getTime()
}

/** Classifica uma atividade "como se estivesse sendo olhada" no dia de referência. */
function classifyAt(act: WBSActivity, referenceDay: Date): DayBucket {
  if (act.percentComplete >= 100) return 'concluida'
  if (act.percentComplete > 0) return 'parcial'
  return referenceDay.getTime() >= toDate(act.finish).getTime() ? 'naoConcluida' : 'pendente'
}

export function computeDayCounts(activities: WBSActivity[], day: Date): DayCounts {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  const touching = activities.filter((a) => isSchedulable(a) && overlaps(a, dayStart, dayEnd))

  const counts: DayCounts = {
    date: day, total: touching.length,
    concluidas: 0, parciais: 0, naoConcluidas: 0, pendentes: 0, extras: 0,
  }
  for (const a of touching) {
    const bucket = classifyAt(a, dayEnd)
    if (bucket === 'concluida') counts.concluidas++
    else if (bucket === 'parcial') counts.parciais++
    else if (bucket === 'naoConcluida') counts.naoConcluidas++
    else counts.pendentes++
  }
  return counts
}

function groupBy(committed: WBSActivity[], keyFn: (a: WBSActivity) => string): GroupBreakdown[] {
  const groups = new Map<string, WBSActivity[]>()
  for (const a of committed) {
    const key = keyFn(a) || 'Não informado'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }
  const result: GroupBreakdown[] = []
  for (const [label, acts] of groups) {
    const concluidas = acts.filter((a) => a.percentComplete >= 100).length
    const base = acts.length
    result.push({ label, base, aderencia: base > 0 ? Math.round((concluidas / base) * 100) : 0 })
  }
  return result.sort((a, b) => b.base - a.base)
}

/** "Etapa" = nome do pacote de nível 2 da EAP (ex: CALDEIRAS, PIPE RACK) — nível 1
 * costuma ser só o nome do projeto repetido, então não serve como agrupamento útil. */
function getEtapaName(act: WBSActivity, allActivities: WBSActivity[]): string {
  const parts = act.wbs.split('.')
  if (parts.length < 2) return act.name
  const etapaWbs = parts.slice(0, 2).join('.')
  return allActivities.find((a) => a.wbs === etapaWbs)?.name || 'Não informado'
}

export function computeWeekIndicators(
  activities: WBSActivity[],
  anyDayInWeek: Date,
  empresa: string,
): WeekIndicators {
  const weekStart = startOfISOWeek(anyDayInWeek)
  const weekEnd = endOfISOWeek(anyDayInWeek)
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((d) => computeDayCounts(activities, d))

  // Base da semana = atividades "comprometidas": término previsto dentro da semana
  // (deveriam terminar essa semana) OU já em andamento (parcial), mesmo com término
  // mais adiante. "Pendente" (ainda não comprometida) fica fora daqui — só aparece
  // nos cards diários.
  const committed = activities.filter((a) => {
    if (!isSchedulable(a)) return false
    const finish = toDate(a.finish).getTime()
    const finishesThisWeek = finish >= weekStart.getTime() && finish <= weekEnd.getTime()
    const inProgress = a.percentComplete > 0 && a.percentComplete < 100 && overlaps(a, weekStart, weekEnd)
    return finishesThisWeek || inProgress
  })

  let concluidas = 0, parciais = 0, naoConcluidas = 0
  for (const a of committed) {
    if (a.percentComplete >= 100) concluidas++
    else if (a.percentComplete > 0) parciais++
    else naoConcluidas++
  }
  const base = committed.length
  // PPC ponderado: conclusão total vale 1, parcial vale metade — dá crédito a quem
  // avançou mas não terminou, em vez de tratar como falha total.
  const ppc = base > 0 ? Math.round(((concluidas + 0.5 * parciais) / base) * 100) : 0
  // Aderência (estrita): só conta o que de fato terminou.
  const aderenciaSemanal = base > 0 ? Math.round((concluidas / base) * 100) : 0

  return {
    weekStart,
    weekEnd,
    weekLabel: `${getISOWeekYear(weekStart)}-S${String(getISOWeek(weekStart)).padStart(2, '0')}`,
    days,
    base, concluidas, parciais, naoConcluidas,
    ppc, aderenciaSemanal,
    porEmpresa: groupBy(committed, () => empresa),
    porDisciplina: groupBy(committed, (a) => a.discipline),
    porArea: groupBy(committed, (a) => a.area),
    porEtapa: groupBy(committed, (a) => getEtapaName(a, activities)),
    porEncarregado: groupBy(committed, (a) => a.responsible),
  }
}

/** Aderência acumulada do projeto até hoje (não só da semana) — mesma lógica estrita,
 * aplicada a todas as atividades cujo término já passou. */
export function computeCumulativeAdherence(activities: WBSActivity[], today: Date = new Date()): number {
  const dueByNow = activities.filter((a) => isSchedulable(a) && toDate(a.finish).getTime() <= today.getTime())
  if (dueByNow.length === 0) return 0
  const concluidas = dueByNow.filter((a) => a.percentComplete >= 100).length
  return Math.round((concluidas / dueByNow.length) * 100)
}
