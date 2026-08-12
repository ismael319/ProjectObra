import { differenceInCalendarDays, endOfDay, isWithinInterval, startOfDay } from 'date-fns'
import type { WBSActivity } from '@/lib/xml-parser'
import { toDate } from '@/lib/utils'

export type DashboardActivityStatus = 'concluida' | 'atrasada' | 'em-andamento' | 'pendente'

export function getActivityKey(activity: Pick<WBSActivity, 'uid' | 'wbs' | 'sourceCronogramaIndex'>): string {
  return `${activity.sourceCronogramaIndex ?? 0}::${activity.uid}::${activity.wbs}`
}

export function isActivityLate(activity: WBSActivity, referenceDate: Date = new Date()): boolean {
  return !activity.isSummary && activity.percentComplete < 100 && toDate(activity.finish) < startOfDay(referenceDate)
}

export function isActivityDueToday(activity: WBSActivity, referenceDate: Date = new Date()): boolean {
  if (activity.isSummary || activity.percentComplete >= 100) return false
  return isWithinInterval(toDate(activity.finish), {
    start: startOfDay(referenceDate),
    end: endOfDay(referenceDate),
  })
}

export function isActivityActiveToday(activity: WBSActivity, referenceDate: Date = new Date()): boolean {
  if (activity.isSummary || activity.isMilestone || activity.percentComplete <= 0 || activity.percentComplete >= 100) return false
  const dayStart = startOfDay(referenceDate)
  const dayEnd = endOfDay(referenceDate)
  return toDate(activity.start) <= dayEnd && toDate(activity.finish) >= dayStart
}

export function getActivityStatus(activity: WBSActivity, referenceDate: Date = new Date()): DashboardActivityStatus {
  if (activity.percentComplete >= 100) return 'concluida'
  if (isActivityLate(activity, referenceDate)) return 'atrasada'
  if (activity.percentComplete > 0) return 'em-andamento'
  return 'pendente'
}

export function getDaysLate(activity: WBSActivity, referenceDate: Date = new Date()): number {
  if (!isActivityLate(activity, referenceDate)) return 0
  return differenceInCalendarDays(startOfDay(referenceDate), startOfDay(toDate(activity.finish)))
}

export interface DashboardAttentionSummary {
  late: WBSActivity[]
  dueToday: WBSActivity[]
  activeToday: WBSActivity[]
  pendingMilestones: WBSActivity[]
}

export function buildDashboardAttention(
  activities: WBSActivity[],
  referenceDate: Date = new Date(),
): DashboardAttentionSummary {
  const late = activities
    .filter((activity) => isActivityLate(activity, referenceDate))
    .sort((a, b) => getDaysLate(b, referenceDate) - getDaysLate(a, referenceDate))

  const dueToday = activities
    .filter((activity) => !activity.isMilestone && isActivityDueToday(activity, referenceDate))
    .sort((a, b) => toDate(a.finish).getTime() - toDate(b.finish).getTime())

  const activeToday = activities
    .filter((activity) => isActivityActiveToday(activity, referenceDate))
    .sort((a, b) => toDate(a.finish).getTime() - toDate(b.finish).getTime())

  const pendingMilestones = activities
    .filter(
      (activity) =>
        activity.isMilestone &&
        isActivityDueToday(activity, referenceDate),
    )
    .sort((a, b) => toDate(a.finish).getTime() - toDate(b.finish).getTime())

  return { late, dueToday, activeToday, pendingMilestones }
}
