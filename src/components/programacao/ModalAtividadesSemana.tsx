import { useState } from 'react'
import { Loader2, Search, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatShortDate } from '@/lib/iso-week'
import type { WeekActivity } from '@/lib/week-activities'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  activities: WeekActivity[]
  loading: boolean
}

export default function ModalAtividadesSemana({ open, onOpenChange, activities, loading }: Props) {
  const [expandedCronogramas, setExpandedCronogramas] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')

  const toggleExpand = (cronogramaId: string) => {
    setExpandedCronogramas((prev) => {
      const next = new Set(prev)
      if (next.has(cronogramaId)) {
        next.delete(cronogramaId)
      } else {
        next.add(cronogramaId)
      }
      return next
    })
  }

  const filteredActivities = activities.filter((a) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      a.taskName.toLowerCase().includes(term) ||
      a.wbs.toLowerCase().includes(term) ||
      a.cronogramaNome.toLowerCase().includes(term)
    )
  })

  const groupedByCronograma = filteredActivities.reduce((acc, a) => {
    if (!acc.has(a.cronogramaId)) {
      acc.set(a.cronogramaId, { nome: a.cronogramaNome, cor: a.cronogramaCor, activities: [] })
    }
    acc.get(a.cronogramaId)!.activities.push(a)
    return acc
  }, new Map<string, { nome: string; cor: string; activities: WeekActivity[] }>())

  const formatWork = (minutes: number) => {
    const hours = minutes / 60
    if (hours >= 1) return `${hours.toFixed(1)}h`
    return `${minutes}min`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search size={18} />
            Atividades com Trabalho na Semana
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, EDT ou cronograma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma atividade com trabalho alocado nesta semana</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from(groupedByCronograma.entries()).map(([cronogramaId, group]) => {
                const isExpanded = expandedCronogramas.has(cronogramaId)
                return (
                  <div key={cronogramaId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpand(cronogramaId)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.cor }}
                      />
                      <span className="font-medium text-sm text-gray-900 dark:text-white">
                        {group.nome}
                      </span>
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                        {group.activities.length} {group.activities.length === 1 ? 'atividade' : 'atividades'}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {group.activities.map((a) => (
                          <div
                            key={`${a.cronogramaId}-${a.taskUid}`}
                            className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {a.taskName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                EDT: {a.wbs}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                                {formatShortDate(a.start)} — {formatShortDate(a.finish)}
                              </div>
                              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 text-right min-w-[40px]">
                                {formatWork(a.work)}
                              </div>
                              <div className="w-12 text-right">
                                <span className={`text-xs font-semibold ${
                                  a.percentComplete >= 100
                                    ? 'text-green-600 dark:text-green-400'
                                    : a.percentComplete > 0
                                      ? 'text-yellow-600 dark:text-yellow-400'
                                      : 'text-gray-400 dark:text-gray-500'
                                }`}>
                                  {Math.round(a.percentComplete)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && filteredActivities.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{filteredActivities.length} {filteredActivities.length === 1 ? 'atividade' : 'atividades'}</span>
            <span>Total: {formatWork(filteredActivities.reduce((sum, a) => sum + a.work, 0))}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
