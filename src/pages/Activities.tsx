import { useState, useMemo } from 'react'
import { useProject } from '@/lib/project-context'
import {
  Search, Filter, CheckCircle, Clock, AlertTriangle, Pause,
  ChevronRight, ChevronDown, ArrowUpDown, Calendar, Users, BarChart3,
} from 'lucide-react'
import { FilterBar, useFilters } from '@/components/FilterBar'
import { toDate } from '@/lib/utils'

export default function Activities() {
  const { project, activities, resources, assignments, updateActivity } = useProject()
  const { filters, setFilters, filteredActivities } = useFilters(activities)
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(['']))
  const [sortBy, setSortBy] = useState<'wbs' | 'name' | 'start' | 'finish' | 'progress' | 'status'>('wbs')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingProgress, setEditingProgress] = useState<number | null>(null)
  const [newProgress, setNewProgress] = useState(0)

  const toggleWbs = (wbs: string) => {
    setExpandedWbs((prev) => {
      const next = new Set(prev)
      if (next.has(wbs)) next.delete(wbs)
      else next.add(wbs)
      return next
    })
  }

  const getStatus = (a: typeof activities[0]) => {
    if (a.percentComplete === 100) return { label: 'Concluído', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle }
    if (a.percentComplete > 0) return { label: 'Em andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: Clock }
    if (toDate(a.finish) < new Date() && a.percentComplete < 100) return { label: 'Atrasado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: AlertTriangle }
    return { label: 'Pendente', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: Pause }
  }

  const getVisibleActivities = useMemo(() => {
    return filteredActivities
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortBy) {
          case 'wbs': return a.wbs.localeCompare(b.wbs) * dir
          case 'name': return a.name.localeCompare(b.name) * dir
          case 'start': return (toDate(a.start).getTime() - toDate(b.start).getTime()) * dir
          case 'finish': return (toDate(a.finish).getTime() - toDate(b.finish).getTime()) * dir
          case 'progress': return (a.percentComplete - b.percentComplete) * dir
          case 'status': {
            const order = { 'Atrasado': 0, 'Em andamento': 1, 'Pendente': 2, 'Concluído': 3 }
            const sa = getStatus(a).label
            const sb = getStatus(b).label
            return ((order[sa as keyof typeof order] || 0) - (order[sb as keyof typeof order] || 0)) * dir
          }
          default: return 0
        }
      })
      .filter((a) => {
        if (a.outlineLevel <= 1) return true
        const parts = a.wbs.split('.')
        for (let i = 1; i < parts.length; i++) {
          if (!expandedWbs.has(parts.slice(0, i).join('.'))) return false
        }
        return true
      })
  }, [filteredActivities, expandedWbs, sortBy, sortDir])

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const saveProgress = (uid: number) => {
    updateActivity(uid, { percentComplete: newProgress })
    setEditingProgress(null)
  }

  const getActivityResources = (activityUid: number) => {
    return assignments
      .filter((a) => a.taskUid === activityUid)
      .map((a) => resources.find((r) => r.uid === a.resourceUid))
      .filter(Boolean)
      .map((r) => r!.name)
  }

  if (!project || activities.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Nenhuma atividade carregada</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Faça o upload de um cronograma XML para ver as atividades
        </p>
      </div>
    )
  }

  const totalHours = filteredActivities.reduce((sum, a) => sum + a.duration / 60, 0)
  const totalCost = filteredActivities.reduce((sum, a) => sum + (a.cost || 0), 0)
  const avgProgress = filteredActivities.length > 0
    ? Math.round(filteredActivities.reduce((sum, a) => sum + a.percentComplete, 0) / filteredActivities.length)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Atividades</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filteredActivities.length} atividade{filteredActivities.length !== 1 ? 's' : ''} • {project.name}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Atividades</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredActivities.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Horas Estimadas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalHours)}h</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Custo Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">R$ {(totalCost / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Progresso Médio</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgProgress}%</p>
        </div>
      </div>

      {/* Filters */}
      <FilterBar activities={activities} resources={resources} filters={filters} onFiltersChange={setFilters} />

      {/* Status Summary */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Concluído', count: filteredActivities.filter((a) => a.percentComplete === 100).length, color: 'bg-green-500' },
          { label: 'Em andamento', count: filteredActivities.filter((a) => a.percentComplete > 0 && a.percentComplete < 100).length, color: 'bg-blue-500' },
          { label: 'Atrasado', count: filteredActivities.filter((a) => toDate(a.finish) < new Date() && a.percentComplete < 100 && !a.isSummary).length, color: 'bg-red-500' },
          { label: 'Pendente', count: filteredActivities.filter((a) => a.percentComplete === 0 && !a.isSummary).length, color: 'bg-gray-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
            <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            <span className="text-sm text-gray-600 dark:text-gray-300">{s.label}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Activities Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="w-8"></th>
                <th onClick={() => handleSort('wbs')} className="cursor-pointer text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3 hover:text-gray-700 dark:hover:text-gray-200">
                  <span className="flex items-center gap-1">WBS <ArrowUpDown size={12} /></span>
                </th>
                <th onClick={() => handleSort('name')} className="cursor-pointer text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3 hover:text-gray-700 dark:hover:text-gray-200">
                  <span className="flex items-center gap-1">Atividade <ArrowUpDown size={12} /></span>
                </th>
                <th onClick={() => handleSort('start')} className="cursor-pointer text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3 hover:text-gray-700 dark:hover:text-gray-200">
                  <span className="flex items-center justify-center gap-1">Início <ArrowUpDown size={12} /></span>
                </th>
                <th onClick={() => handleSort('finish')} className="cursor-pointer text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3 hover:text-gray-700 dark:hover:text-gray-200">
                  <span className="flex items-center justify-center gap-1">Término <ArrowUpDown size={12} /></span>
                </th>
                <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3">Duração</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3 min-w-[180px]">Progresso</th>
                <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-4 py-3">Recursos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {getVisibleActivities.map((activity, index) => {
                const hasChildren = activities.some((a) => a.wbs.startsWith(activity.wbs + '.') && a.uid !== activity.uid)
                const isExpanded = expandedWbs.has(activity.wbs)
                const status = getStatus(activity)
                const StatusIcon = status.icon
                const durationDays = Math.ceil(activity.duration / (8 * 60))
                const actResources = getActivityResources(activity.uid)

                return (
                  // uid não é único entre cronogramas combinados (cada XML numera a
                  // partir de 1) — o índice desempata sem tocar no uid em si.
                  <tr key={`${activity.uid}-${index}`} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition ${activity.isSummary ? 'bg-gray-50/50 dark:bg-gray-700/20' : ''}`}>
                    <td className="px-2 py-3">
                      {hasChildren && (
                        <button onClick={() => toggleWbs(activity.wbs)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {activity.wbs}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div style={{ paddingLeft: `${(activity.outlineLevel - 1) * 12}px` }}>
                        <span className={`text-sm ${activity.isSummary ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                          {activity.name}
                        </span>
                        {activity.responsible && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{activity.responsible}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      {toDate(activity.start).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      {toDate(activity.finish).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      {durationDays}d
                    </td>
                    <td className="px-4 py-3">
                      {editingProgress === activity.uid ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={newProgress}
                            onChange={(e) => setNewProgress(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            min="0"
                            max="100"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveProgress(activity.uid)
                              if (e.key === 'Escape') setEditingProgress(null)
                            }}
                          />
                          <button onClick={() => saveProgress(activity.uid)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">OK</button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => { setEditingProgress(activity.uid); setNewProgress(activity.percentComplete) }}
                        >
                          <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full transition-all ${
                                activity.percentComplete === 100 ? 'bg-green-500' :
                                activity.percentComplete > 50 ? 'bg-blue-500' :
                                activity.percentComplete > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-500'
                              }`}
                              style={{ width: `${activity.percentComplete}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {activity.percentComplete}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon size={12} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Users size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                          {actResources.length > 0 ? actResources.join(', ') : '-'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {getVisibleActivities.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            Nenhuma atividade encontrada com os filtros aplicados
          </div>
        )}
      </div>
    </div>
  )
}
