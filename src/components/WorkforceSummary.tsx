import { useMemo } from 'react'
import { Users, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'

const GROUP_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export default function WorkforceSummary() {
  const { resources, laborEntries } = useProject()

  const stats = useMemo(() => {
    const now = new Date()
    const last7 = new Date(now.getTime() - 7 * 86400000)
    const prev7 = new Date(now.getTime() - 14 * 86400000)

    const activeResourceUids = new Set(laborEntries.map((e) => e.resourceUid))
    const totalHours = laborEntries.reduce((s, e) => s + e.hours, 0)
    const last7Hours = laborEntries.filter((e) => toDate(e.date) >= last7).reduce((s, e) => s + e.hours, 0)
    const prev7Hours = laborEntries
      .filter((e) => toDate(e.date) >= prev7 && toDate(e.date) < last7)
      .reduce((s, e) => s + e.hours, 0)
    const trendPct = prev7Hours > 0 ? ((last7Hours - prev7Hours) / prev7Hours) * 100 : null

    const byGroup = new Map<string, number>()
    for (const e of laborEntries) {
      const res = resources.find((r) => r.uid === e.resourceUid)
      const key = res?.group?.trim() || 'Sem grupo'
      byGroup.set(key, (byGroup.get(key) || 0) + e.hours)
    }
    const groupBreakdown = Array.from(byGroup.entries())
      .map(([name, hours]) => ({ name, hours, pct: totalHours > 0 ? (hours / totalHours) * 100 : 0 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6)

    return {
      activeResources: activeResourceUids.size,
      totalResources: resources.length,
      totalHours,
      last7Hours,
      trendPct,
      groupBreakdown,
    }
  }, [resources, laborEntries])

  if (resources.length === 0 && laborEntries.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-amber-600 dark:text-amber-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Resumo do Efetivo</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Números principais */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.activeResources}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recursos com apontamento</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">de {stats.totalResources} cadastrados</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.totalHours.toFixed(0)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">HH apontadas (total)</p>
          </div>
          <div className="col-span-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{stats.last7Hours.toFixed(0)}h</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">últimos 7 dias</span>
              {stats.trendPct !== null && (
                <span
                  className={`ml-auto flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    stats.trendPct >= 0
                      ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10'
                      : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
                  }`}
                >
                  {stats.trendPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(stats.trendPct).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* HH por grupo */}
        <div className="lg:col-span-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            HH por Grupo de Recurso
          </h3>
          {stats.groupBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum apontamento registrado</p>
          ) : (
            <div className="space-y-2.5">
              {stats.groupBreakdown.map((g, i) => (
                <div key={g.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 dark:text-gray-300 truncate">{g.name}</span>
                    <span className="text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                      {g.hours.toFixed(0)}h · {g.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${g.pct}%`, backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
