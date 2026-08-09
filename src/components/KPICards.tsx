import { TrendingUp, TrendingDown, FolderKanban, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import type { WBSActivity } from '@/lib/xml-parser'

type Props = {
  // Sobrescreve as atividades usadas nos cálculos (ex.: filtro por cronograma/
  // disciplina na Visão Geral) — sem isso, sempre usa o projeto inteiro.
  activities?: WBSActivity[]
}

export default function KPICards({ activities: activitiesProp }: Props = {}) {
  const { activities: activitiesContexto, indices } = useProject()
  const activities = activitiesProp ?? activitiesContexto

  const totalActivities = activities.filter((a) => !a.isSummary).length
  const activeActivities = activities.filter((a) => !a.isSummary && a.percentComplete > 0 && a.percentComplete < 100).length
  const completedActivities = activities.filter((a) => !a.isSummary && a.percentComplete === 100).length
  const delayedActivities = activities.filter((a) => !a.isSummary && a.finish < new Date() && a.percentComplete < 100).length

  const kpis = [
    {
      title: 'Total de Atividades',
      value: totalActivities.toString(),
      change: `${activities.filter((a) => !a.isSummary).length} não-resumo`,
      trend: 'up' as const,
      icon: FolderKanban,
      accent: '#2563eb',
      iconBg: 'bg-blue-50 dark:bg-blue-500/10',
      iconText: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Em Andamento',
      value: activeActivities.toString(),
      change: `${Math.round((activeActivities / Math.max(totalActivities, 1)) * 100)}% do total`,
      trend: 'up' as const,
      icon: Clock,
      accent: '#d97706',
      iconBg: 'bg-amber-50 dark:bg-amber-500/10',
      iconText: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Concluídas',
      value: completedActivities.toString(),
      change: indices ? `${indices.percentComplete}% avanço` : '0% avanço',
      trend: 'up' as const,
      icon: CheckCircle,
      accent: '#16a34a',
      iconBg: 'bg-green-50 dark:bg-green-500/10',
      iconText: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Atrasadas',
      value: delayedActivities.toString(),
      change: indices ? `SPI: ${indices.SPI}` : 'Sem dados',
      trend: delayedActivities > 0 ? 'down' : 'up',
      icon: AlertTriangle,
      accent: '#dc2626',
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconText: 'text-red-600 dark:text-red-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.title}
          className="group relative min-h-[150px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-3.5 shadow-card transition-all duration-200 dark:border-gray-700/80 dark:bg-gray-800 sm:min-h-0 sm:rounded-xl sm:p-6 sm:hover:-translate-y-0.5 sm:hover:shadow-card-hover"
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px] opacity-80"
            style={{ backgroundColor: kpi.accent }}
          />
          <div className="flex items-start justify-between sm:items-center">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${kpi.iconBg}`}>
              <kpi.icon className={`h-5 w-5 sm:h-[22px] sm:w-[22px] ${kpi.iconText}`} strokeWidth={2.25} />
            </div>
            <span
              className={`hidden items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold sm:flex ${
                kpi.trend === 'up'
                  ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10'
                  : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
              }`}
            >
              {kpi.trend === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {kpi.change}
            </span>
          </div>
          <div className="mt-3 sm:mt-4">
            <h3 className="text-[1.75rem] font-extrabold leading-none tracking-tight text-gray-900 dark:text-white sm:text-3xl sm:leading-9">{kpi.value}</h3>
            <p className="mt-1.5 text-xs font-semibold leading-tight text-gray-600 dark:text-gray-300 sm:mt-1 sm:text-sm sm:font-medium sm:leading-5 sm:text-gray-500 sm:dark:text-gray-400">{kpi.title}</p>
            <div
              className={`mt-3 flex items-center gap-1 text-[11px] font-medium leading-none sm:hidden ${
                kpi.trend === 'up'
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {kpi.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span className="truncate">{kpi.change}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
