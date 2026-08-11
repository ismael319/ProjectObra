import { Link } from 'react-router-dom'
import { AlertOctagon } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { OCCURRENCE_SEVERITIES, getCategoryDef, getSeverityDef } from '@/lib/occurrence-types'
import { toDate } from '@/lib/utils'

export default function OccurrencesSummary() {
  const { occurrences } = useProject()

  const abertas = occurrences.filter((o) => o.status === 'aberta')
  const impactDays = abertas.reduce((s, o) => s + o.impactDays, 0)
  const recentes = [...abertas]
    .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
    .slice(0, 5)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <AlertOctagon size={18} className="text-red-600 dark:text-red-400 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ocorrências</h2>
        </div>
        <Link
          to="/dashboard/occurrences"
          className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {abertas.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma ocorrência aberta</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {OCCURRENCE_SEVERITIES.map((s) => {
              const count = abertas.filter((o) => o.severity === s.value).length
              if (count === 0) return null
              return (
                <span key={s.value} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.badgeClass}`}>
                  {s.label} · {count}
                </span>
              )
            })}
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {impactDays} dia{impactDays === 1 ? '' : 's'} de impacto
            </span>
          </div>

          <ul className="space-y-2">
            {recentes.map((o) => {
              const cat = getCategoryDef(o.type)
              const sev = getSeverityDef(o.severity)
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <cat.icon size={13} className="shrink-0" style={{ color: cat.color }} />
                    <span className="truncate text-gray-700 dark:text-gray-200">{o.description}</span>
                  </span>
                  <span className="shrink-0 flex items-center gap-2">
                    <span className="text-gray-400 dark:text-gray-500">{toDate(o.date).toLocaleDateString('pt-BR')}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${sev.badgeClass}`}>{sev.label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
