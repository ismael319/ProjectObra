import { TrendingUp, TrendingDown, FolderKanban, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { useProject } from '@/lib/project-context'

export default function KPICards() {
  const { activities, indices } = useProject()

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.title}
          className="group relative bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700/80 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px] opacity-80"
            style={{ backgroundColor: kpi.accent }}
          />
          <div className="flex items-center justify-between">
            <div className={`w-12 h-12 ${kpi.iconBg} rounded-xl flex items-center justify-center`}>
              <kpi.icon className={kpi.iconText} size={22} strokeWidth={2.25} />
            </div>
            <span
              className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                kpi.trend === 'up'
                  ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10'
                  : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
              }`}
            >
              {kpi.trend === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {kpi.change}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{kpi.value}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{kpi.title}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
