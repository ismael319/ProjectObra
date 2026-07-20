import { useState, useMemo } from 'react'
import { Search, Filter, X, Calendar, ChevronDown } from 'lucide-react'
import type { WBSActivity, WBSResource } from '@/lib/xml-parser'
import { toDate } from '@/lib/utils'

export interface FilterState {
  search: string
  disciplines: string[]
  areas: string[]
  responsibles: string[]
  statuses: string[]
  dateFrom: string
  dateTo: string
}

interface FilterBarProps {
  activities: WBSActivity[]
  resources: WBSResource[]
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

export function useFilters(activities: WBSActivity[]) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    disciplines: [],
    areas: [],
    responsibles: [],
    statuses: [],
    dateFrom: '',
    dateTo: '',
  })

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (filters.search) {
        const s = filters.search.toLowerCase()
        if (!a.name.toLowerCase().includes(s) && !a.wbs.includes(s)) return false
      }
      if (filters.disciplines.length > 0 && !filters.disciplines.includes(a.discipline)) return false
      if (filters.areas.length > 0 && !filters.areas.includes(a.area)) return false
      if (filters.responsibles.length > 0 && !filters.responsibles.includes(a.responsible)) return false
      if (filters.statuses.length > 0) {
        const status = a.percentComplete === 100 ? 'Concluído' :
                       a.percentComplete > 0 ? 'Em andamento' :
                       toDate(a.finish) < new Date() ? 'Atrasado' : 'Pendente'
        if (!filters.statuses.includes(status)) return false
      }
      if (filters.dateFrom && toDate(a.start) < new Date(filters.dateFrom)) return false
      if (filters.dateTo && toDate(a.finish) > new Date(filters.dateTo)) return false
      return true
    })
  }, [activities, filters])

  const uniqueValues = useMemo(() => ({
    disciplines: [...new Set(activities.map((a) => a.discipline).filter(Boolean))].sort(),
    areas: [...new Set(activities.map((a) => a.area).filter(Boolean))].sort(),
    responsibles: [...new Set(activities.map((a) => a.responsible).filter(Boolean))].sort(),
  }), [activities])

  return { filters, setFilters, filteredActivities, uniqueValues }
}

export function FilterBar({ activities, resources, filters, onFiltersChange }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const uniqueValues = useMemo(() => ({
    disciplines: [...new Set(activities.map((a) => a.discipline).filter(Boolean))].sort(),
    areas: [...new Set(activities.map((a) => a.area).filter(Boolean))].sort(),
    responsibles: [...new Set(activities.map((a) => a.responsible).filter(Boolean))].sort(),
  }), [activities])

  const statuses = ['Pendente', 'Em andamento', 'Concluído', 'Atrasado']

  const toggleFilter = (key: 'disciplines' | 'areas' | 'responsibles' | 'statuses', value: string) => {
    const current = filters[key]
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onFiltersChange({ ...filters, [key]: next })
  }

  const activeFilters = filters.disciplines.length + filters.areas.length +
    filters.responsibles.length + filters.statuses.length +
    (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0)

  const clearAll = () => {
    onFiltersChange({
      search: '',
      disciplines: [],
      areas: [],
      responsibles: [],
      statuses: [],
      dateFrom: '',
      dateTo: '',
    })
  }

  return (
    <div className="space-y-3">
      {/* Main search */}
      <div className="flex gap-3">
        <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 flex-1">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar atividade, WBS, responsável..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 dark:text-gray-200 w-full"
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition ${
            showAdvanced || activeFilters > 0
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Filter size={16} />
          Filtros
          {activeFilters > 0 && (
            <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Data Início</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Data Término</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleFilter('statuses', status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    filters.statuses.includes(status)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Discipline filter */}
          {uniqueValues.disciplines.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Disciplina</label>
              <div className="flex flex-wrap gap-2">
                {uniqueValues.disciplines.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleFilter('disciplines', d)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      filters.disciplines.includes(d)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Responsible filter */}
          {uniqueValues.responsibles.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Responsável</label>
              <div className="flex flex-wrap gap-2">
                {uniqueValues.responsibles.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleFilter('responsibles', r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      filters.responsibles.includes(r)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear */}
          {activeFilters > 0 && (
            <button onClick={clearAll} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1">
              <X size={14} />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Active filter badges */}
      {activeFilters > 0 && !showAdvanced && (
        <div className="flex flex-wrap gap-2">
          {filters.statuses.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs">
              {s}
              <button onClick={() => toggleFilter('statuses', s)}><X size={12} /></button>
            </span>
          ))}
          {filters.disciplines.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-full text-xs">
              {d}
              <button onClick={() => toggleFilter('disciplines', d)}><X size={12} /></button>
            </span>
          ))}
          {filters.responsibles.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full text-xs">
              {r}
              <button onClick={() => toggleFilter('responsibles', r)}><X size={12} /></button>
            </span>
          ))}
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-500">Limpar tudo</button>
        </div>
      )}
    </div>
  )
}
