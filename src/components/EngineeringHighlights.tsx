import { useMemo } from 'react'
import { Flag, AlertOctagon, Layers } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'

const DISCIPLINE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export default function EngineeringHighlights() {
  const { activities } = useProject()

  const leafActivities = useMemo(() => activities.filter((a) => !a.isSummary), [activities])

  const byDiscipline = useMemo(() => {
    const map = new Map<string, { count: number; sumPct: number }>()
    for (const a of leafActivities) {
      const key = a.discipline?.trim() || 'Sem disciplina'
      const entry = map.get(key) || { count: 0, sumPct: 0 }
      entry.count++
      entry.sumPct += a.percentComplete
      map.set(key, entry)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, count: v.count, avgPct: v.count > 0 ? v.sumPct / v.count : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [leafActivities])

  const upcomingMilestones = useMemo(() => {
    const now = new Date()
    return leafActivities
      .filter((a) => a.isMilestone && a.percentComplete < 100)
      .sort((a, b) => toDate(a.finish).getTime() - toDate(b.finish).getTime())
      .slice(0, 5)
      .map((a) => ({ ...a, isLate: toDate(a.finish) < now }))
  }, [leafActivities])

  const criticalActivities = useMemo(() => {
    const now = new Date()
    return leafActivities
      .filter((a) => !a.isMilestone && a.percentComplete < 100 && toDate(a.finish) < now)
      .map((a) => ({ ...a, daysLate: Math.floor((now.getTime() - toDate(a.finish).getTime()) / 86400000) }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 5)
  }, [leafActivities])

  if (leafActivities.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={18} className="text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pontos de Engenharia</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Disciplinas */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Avanço por Disciplina
          </h3>
          {byDiscipline.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sem disciplinas cadastradas</p>
          ) : (
            <div className="space-y-2.5">
              {byDiscipline.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 dark:text-gray-300 truncate">{d.name}</span>
                    <span className="text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                      {d.count} · {d.avgPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${Math.min(d.avgPct, 100)}%`, backgroundColor: DISCIPLINE_COLORS[i % DISCIPLINE_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Marcos */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Flag size={12} /> Próximos Marcos
          </h3>
          {upcomingMilestones.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum marco pendente</p>
          ) : (
            <ul className="space-y-2">
              {upcomingMilestones.map((m, i) => (
                <li key={`${m.uid}-${i}`} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{m.name}</span>
                  <span className={`shrink-0 font-medium ${m.isLate ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {toDate(m.finish).toLocaleDateString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Atividades críticas */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertOctagon size={12} /> Mais Atrasadas
          </h3>
          {criticalActivities.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma atividade atrasada</p>
          ) : (
            <ul className="space-y-2">
              {criticalActivities.map((a, i) => (
                <li key={`${a.uid}-${i}`} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{a.name}</span>
                  <span className="shrink-0 font-medium text-red-600 dark:text-red-400">{a.daysLate}d</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
