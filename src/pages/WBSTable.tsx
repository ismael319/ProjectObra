import { useMemo, useState } from 'react'
import { useProject } from '@/lib/project-context'
import { ChevronRight, ChevronDown, Search, Filter, CheckCircle, Clock, AlertTriangle, Pause } from 'lucide-react'
import { toDate } from '@/lib/utils'

export default function WBSTable() {
  const { project, activities, updateActivity } = useProject()
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(['']))
  const [search, setSearch] = useState('')
  const [editingCell, setEditingCell] = useState<{ uid: number; field: string } | null>(null)

  const toggleWbs = (wbs: string) => {
    setExpandedWbs((prev) => {
      const next = new Set(prev)
      if (next.has(wbs)) {
        next.delete(wbs)
      } else {
        next.add(wbs)
      }
      return next
    })
  }

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (search) {
        return (
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.wbs.includes(search)
        )
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
    if (activity.percentComplete === 100) return <CheckCircle size={16} className="text-green-500" />
    if (activity.percentComplete > 0) return <Clock size={16} className="text-blue-500" />
    if (toDate(activity.finish) < new Date() && activity.percentComplete < 100) return <AlertTriangle size={16} className="text-red-500" />
    return <Pause size={16} className="text-gray-400" />
  }

  const getStatusLabel = (activity: typeof activities[0]) => {
    if (activity.percentComplete === 100) return 'Concluído'
    if (activity.percentComplete > 0) return 'Em andamento'
    if (toDate(activity.finish) < new Date() && activity.percentComplete < 100) return 'Atrasado'
    return 'Pendente'
  }

  const getStatusColor = (activity: typeof activities[0]) => {
    if (activity.percentComplete === 100) return 'bg-green-100 text-green-700'
    if (activity.percentComplete > 0) return 'bg-blue-100 text-blue-700'
    if (toDate(activity.finish) < new Date() && activity.percentComplete < 100) return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-700'
  }

  if (!project || activities.length === 0) {
    return (
      <div className="text-center py-16">
        <Filter className="mx-auto text-gray-300 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700">Nenhum cronograma carregado</h2>
        <p className="text-gray-500 mt-2">
          Faça o upload de um arquivo XML para visualizar a estrutura WBS
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estrutura WBS</h1>
          <p className="text-sm text-gray-500 mt-1">{project.name}</p>
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded-lg px-4 py-2.5 w-full sm:w-80">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar atividade ou WBS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 w-full"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 w-12"></th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 w-24">WBS</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Atividade</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 w-28">Início</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 w-28">Término</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 w-20">Duração</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 w-32">Progresso</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3 w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleActivities.map((activity) => {
                const hasChildren = activities.some(
                  (a) => a.wbs.startsWith(activity.wbs + '.') && a.uid !== activity.uid
                )
                const isExpanded = expandedWbs.has(activity.wbs)
                const durationDays = Math.ceil(activity.duration / (8 * 60))

                return (
                  <tr
                    key={activity.uid}
                    className={`hover:bg-gray-50 ${
                      activity.isSummary ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      {hasChildren && (
                        <button
                          onClick={() => toggleWbs(activity.wbs)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {activity.wbs}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div style={{ paddingLeft: `${(activity.outlineLevel - 1) * 16}px` }}>
                        <span
                          className={`text-sm ${
                            activity.isSummary ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {activity.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {toDate(activity.start).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {toDate(activity.finish).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {durationDays} dias
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              activity.percentComplete === 100
                                ? 'bg-green-500'
                                : activity.percentComplete > 50
                                ? 'bg-blue-500'
                                : activity.percentComplete > 0
                                ? 'bg-amber-500'
                                : 'bg-gray-300'
                            }`}
                            style={{ width: `${activity.percentComplete}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {activity.percentComplete}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          activity
                        )}`}
                      >
                        {getStatusIcon(activity)}
                        {getStatusLabel(activity)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Total de Atividades</p>
          <p className="text-2xl font-bold text-gray-900">{activities.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Concluídas</p>
          <p className="text-2xl font-bold text-green-600">
            {activities.filter((a) => a.percentComplete === 100).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Em Andamento</p>
          <p className="text-2xl font-bold text-blue-600">
            {activities.filter((a) => a.percentComplete > 0 && a.percentComplete < 100).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Atrasadas</p>
          <p className="text-2xl font-bold text-red-600">
            {activities.filter(
              (a) => toDate(a.finish) < new Date() && a.percentComplete < 100 && !a.isSummary
            ).length}
          </p>
        </div>
      </div>
    </div>
  )
}
