import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Flag } from 'lucide-react'
import { useMemo } from 'react'
import { buildDashboardAttention, getActivityKey, getDaysLate } from '@/lib/dashboard-insights'
import type { WBSActivity } from '@/lib/xml-parser'
import { useToday } from '@/lib/use-today'

type Props = {
  activities: WBSActivity[]
  onOpenLate?: () => void
  onOpenActive?: () => void
}

type AttentionItem = {
  key: string
  label: string
  name: string
  detail: string
  tone: 'danger' | 'warning'
}

export default function DashboardAttention({ activities, onOpenLate, onOpenActive }: Props) {
  const today = useToday()
  const summary = useMemo(() => buildDashboardAttention(activities, today), [activities, today])

  const items = useMemo<AttentionItem[]>(() => {
    const late = summary.late.map((activity) => ({
      key: `late-${getActivityKey(activity)}`,
      label: activity.isMilestone ? 'Marco atrasado' : 'Atrasada',
      name: activity.name,
      detail: `${getDaysLate(activity, today)}d de atraso`,
      tone: 'danger' as const,
    }))
    const dueToday = summary.dueToday.map((activity) => ({
      key: `due-${getActivityKey(activity)}`,
      label: 'Vence hoje',
      name: activity.name,
      detail: activity.wbs,
      tone: 'warning' as const,
    }))
    const milestones = summary.pendingMilestones.map((activity) => ({
      key: `milestone-${getActivityKey(activity)}`,
      label: 'Marco pendente',
      name: activity.name,
      detail: activity.wbs,
      tone: 'warning' as const,
    }))
    return [...late, ...dueToday, ...milestones].slice(0, 3)
  }, [summary, today])

  const hasUrgentItems = items.length > 0
  const action = summary.late.length > 0
    ? { label: 'Ver atrasadas', onClick: onOpenLate }
    : summary.activeToday.length > 0
      ? { label: 'Ver em andamento', onClick: onOpenActive }
      : null

  if (activities.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:hidden">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            <CalendarClock size={20} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Atenção hoje</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Carregue um cronograma para ver as prioridades.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:hidden" aria-labelledby="dashboard-attention-title">
      <div className={`border-b px-4 py-3.5 ${hasUrgentItems ? 'border-red-100 bg-gradient-to-r from-red-50 to-white dark:border-red-500/20 dark:from-red-500/10 dark:to-gray-800' : 'border-green-100 bg-gradient-to-r from-green-50 to-white dark:border-green-500/20 dark:from-green-500/10 dark:to-gray-800'}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${hasUrgentItems ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400'}`}>
            {hasUrgentItems ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="dashboard-attention-title" className="text-sm font-bold text-gray-900 dark:text-white">Atenção hoje</h2>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {hasUrgentItems ? `${items.length} prioridade${items.length === 1 ? '' : 's'} em destaque` : 'Nenhuma pendência crítica para hoje'}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/80 px-2 py-2 dark:bg-gray-900/35">
            <p className="text-lg font-extrabold leading-none text-red-600 dark:text-red-400">{summary.late.length}</p>
            <p className="mt-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">Atrasadas</p>
          </div>
          <div className="rounded-lg bg-white/80 px-2 py-2 dark:bg-gray-900/35">
            <p className="text-lg font-extrabold leading-none text-amber-600 dark:text-amber-400">{summary.dueToday.length + summary.pendingMilestones.length}</p>
            <p className="mt-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">Vencem hoje</p>
          </div>
          <div className="rounded-lg bg-white/80 px-2 py-2 dark:bg-gray-900/35">
            <p className="text-lg font-extrabold leading-none text-blue-600 dark:text-blue-400">{summary.activeToday.length}</p>
            <p className="mt-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">Em execução</p>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.tone === 'danger' ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                {item.label === 'Marco pendente' ? <Flag size={15} /> : <CalendarClock size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${item.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{item.label}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.detail}</span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{item.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {action?.onClick && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-gray-100 px-4 text-xs font-bold text-blue-600 active:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:active:bg-blue-500/10"
        >
          {action.label} <ChevronRight size={15} />
        </button>
      )}
    </section>
  )
}
