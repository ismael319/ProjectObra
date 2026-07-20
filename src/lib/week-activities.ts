import type { CronogramaInfo } from '@/lib/project-store'
import type { ActivityLike, ActivityStatus } from '@/lib/adherence'

export interface WeekActivity {
  cronogramaId: string
  cronogramaNome: string
  cronogramaCor: string
  taskUid: number
  taskName: string
  wbs: string
  work: number
  start: Date
  finish: Date
  percentComplete: number
}

export function findActivitiesWithWorkInWeek(
  cronogramas: CronogramaInfo[],
  weekStart: Date,
  weekEnd: Date,
): WeekActivity[] {
  const results: WeekActivity[] = []

  for (const c of cronogramas) {
    if (!c.ativo || !c.dados) continue

    const activities = c.dados.activities
    const weekStartMs = weekStart.getTime()
    const weekEndMs = weekEnd.getTime()

    for (const act of activities) {
      if (act.isSummary || act.isMilestone) continue

      const work = act.work ?? 0
      if (work <= 0) continue

      const actStartMs = act.start.getTime()
      const actFinishMs = act.finish.getTime()

      const overlaps = actStartMs <= weekEndMs && actFinishMs >= weekStartMs
      if (!overlaps) continue

      results.push({
        cronogramaId: c.id,
        cronogramaNome: c.nome,
        cronogramaCor: c.cor,
        taskUid: act.uid,
        taskName: act.name,
        wbs: act.wbs,
        work,
        start: act.start,
        finish: act.finish,
        percentComplete: act.percentComplete,
      })
    }
  }

  results.sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true }))
  return results
}

export function toActivityLike(wa: WeekActivity): ActivityLike {
  return {
    id: `crono-${wa.cronogramaId}-${wa.taskUid}`,
    name: wa.taskName,
    company: null,
    discipline: null,
    area: null,
    stage: wa.wbs,
    foreman: null,
    planned_date: '',
    planned_pct: Math.round(wa.percentComplete),
    status: 'pendente' as ActivityStatus,
    is_extra: false,
    observation: null,
    source: wa.cronogramaNome,
  }
}

/** Distribui atividades do cronograma para cada dia da semana que sobrepõe seu período. */
export function distributeToDays(
  activities: WeekActivity[],
  days: string[],
): Map<string, ActivityLike[]> {
  const map = new Map<string, ActivityLike[]>()
  for (const d of days) map.set(d, [])

  for (const wa of activities) {
    const actStart = wa.start.getTime()
    const actEnd = wa.finish.getTime()

    for (const d of days) {
      const dayDate = new Date(d + 'T00:00:00')
      const dayStart = dayDate.getTime()
      const dayEnd = dayStart + 86400000 - 1

      if (actStart <= dayEnd && actEnd >= dayStart) {
        const converted = toActivityLike(wa)
        converted.planned_date = d
        map.get(d)!.push(converted)
      }
    }
  }

  return map
}
