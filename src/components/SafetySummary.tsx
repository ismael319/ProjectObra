import { useMemo } from 'react'
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'

// Ainda não existe um tipo de ocorrência dedicado a segurança (incidente, quase-
// acidente, indicador SESMT) — até esse modelo ser criado, "problema" e "outro" são
// o proxy mais próximo do que já é registrado hoje em Ocorrências.
const SAFETY_TYPES = new Set(['problema', 'outro'])

export default function SafetySummary() {
  const { activities, occurrences } = useProject()

  const stats = useMemo(() => {
    const safetyOccurrences = occurrences
      .filter((o) => SAFETY_TYPES.has(o.type))
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())

    const totalImpactDays = safetyOccurrences.reduce((s, o) => s + o.impactDays, 0)
    const last30 = safetyOccurrences.filter((o) => toDate(o.date) >= new Date(Date.now() - 30 * 86400000))

    const lastDate = safetyOccurrences[0] ? toDate(safetyOccurrences[0].date) : null
    const daysSinceLast = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null

    return {
      total: safetyOccurrences.length,
      last30Count: last30.length,
      totalImpactDays,
      daysSinceLast,
      recent: safetyOccurrences.slice(0, 5),
    }
  }, [occurrences])

  if (activities.length === 0) return null

  const noIncidents = stats.total === 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Itens de Segurança</h2>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
        Baseado nas ocorrências do tipo "Problema" e "Outro" registradas em Ocorrências.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Números principais */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <div
            className={`col-span-2 flex items-center gap-2.5 px-3 py-2.5 rounded-lg ${
              noIncidents
                ? 'bg-green-50 dark:bg-green-500/10'
                : 'bg-red-50 dark:bg-red-500/10'
            }`}
          >
            {noIncidents ? (
              <ShieldCheck size={18} className="text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <ShieldAlert size={18} className="text-red-600 dark:text-red-400 shrink-0" />
            )}
            <div>
              <p className={`text-lg font-extrabold ${noIncidents ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {stats.daysSinceLast ?? '—'}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">dias sem ocorrência</p>
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total registrado</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.last30Count}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Últimos 30 dias</p>
          </div>
        </div>

        {/* Lista recente */}
        <div className="lg:col-span-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Ocorrências Recentes
          </h3>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma ocorrência registrada</p>
          ) : (
            <ul className="space-y-2">
              {stats.recent.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{o.description}</span>
                  <span className="shrink-0 text-gray-400 dark:text-gray-500">
                    {toDate(o.date).toLocaleDateString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
