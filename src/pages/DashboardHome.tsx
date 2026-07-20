import { useMemo, useState } from 'react'
import { useProject } from '@/lib/project-context'
import { Search, ChevronRight, ChevronDown, CheckCircle, Clock, AlertTriangle, Pause } from 'lucide-react'
import { toDate } from '@/lib/utils'
import KPICards from '@/components/KPICards'
import { StatusPieChart, MonthlyBarChart, ProgressAreaChart } from '@/components/Charts'

export default function DashboardHome() {
  const { project, activities } = useProject()
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(['']))
  const [search, setSearch] = useState('')

  const toggleWbs = (wbs: string) => {
    setExpandedWbs((prev) => {
      const next = new Set(prev)
      if (next.has(wbs)) next.delete(wbs)
      else next.add(wbs)
      return next
    })
  }

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (search) {
        const s = search.toLowerCase()
        return a.name.toLowerCase().includes(s) || a.wbs.includes(s)
      }
      return true
    })
  }, [activities, search])

  const visibleActivities = useMemo(() => {
    return filteredActivities.filter((a) => {
      if (a.outlineLevel <= 1) return true
      const parts = a.wbs.split('.')
      for (let i = 1; i < parts.length; i++) {
        const parentWbs = parts.slice(0, i).join('.')
        if (!expandedWbs.has(parentWbs)) return false
      }
      return true
    })
  }, [filteredActivities, expandedWbs])

  const getStatusIcon = (activity: typeof activities[0]) => {
    if (activity.percentComplete === 100) return <CheckCircle size={14} className="text-green-500" />
    if (activity.percentComplete > 0) return <Clock size={14} className="text-blue-500" />
    if (toDate(activity.finish) < new Date() && activity.percentComplete < 100) return <AlertTriangle size={14} className="text-red-500" />
    return <Pause size={14} className="text-gray-400" />
  }

  const getStatusColor = (activity: typeof activities[0]) => {
    if (activity.percentComplete === 100) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    if (activity.percentComplete > 0) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    if (toDate(activity.finish) < new Date() && activity.percentComplete < 100) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }

  return (
    <div className="space-y-6">
      <KPICards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusPieChart />
        <MonthlyBarChart />
      </div>

      <ProgressAreaChart />

      {/* Estrutura WBS integrada */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Estrutura WBS</h2>
          <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 w-full sm:w-72">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Buscar atividade ou WBS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 dark:text-gray-200 w-full"
            />
          </div>
        </div>

        {activities.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-8"></th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-20">WBS</th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5">Atividade</th>
                    <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Início</th>
                    <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Término</th>
                    <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-20">Duração</th>
                    <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-28">Progresso</th>
                    <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-3 py-2.5 w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {visibleActivities.map((activity) => {
                    const hasChildren = activities.some(
                      (a) => a.wbs.startsWith(activity.wbs + '.') && a.uid !== activity.uid
                    )
                    const isExpanded = expandedWbs.has(activity.wbs)
                    const durationDays = Math.ceil(activity.duration / (8 * 60))

                    return (
                      <tr
                        key={activity.uid}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${activity.isSummary ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}
                      >
                        <td className="px-3 py-2">
                          {hasChildren && (
                            <button onClick={() => toggleWbs(activity.wbs)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {activity.wbs}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div style={{ paddingLeft: `${(activity.outlineLevel - 1) * 14}px` }}>
                            <span className={`text-sm ${activity.isSummary ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                              {activity.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                          {toDate(activity.start).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                          {toDate(activity.finish).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                          {durationDays}d
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${activity.percentComplete === 100 ? 'bg-green-500' : activity.percentComplete > 50 ? 'bg-blue-500' : activity.percentComplete > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-500'}`}
                                style={{ width: `${activity.percentComplete}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{activity.percentComplete}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(activity)}`}>
                            {getStatusIcon(activity)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            Nenhuma atividade carregada
          </div>
        )}
      </div>
    </div>
  )
}
