import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Users, AlertOctagon, CalendarClock } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'
import type { WBSActivity } from '@/lib/xml-parser'

type Props = {
  // Atividades já filtradas pelo cronograma do filtro global — % de avanço e
  // fim do projeto acompanham o que está sendo exibido nos cards; HH e
  // ocorrências são globais (apontamentos e ocorrências não têm vínculo de
  // cronograma).
  activities?: WBSActivity[]
}

export default function ExecutiveSummary({ activities: activitiesProp }: Props = {}) {
  const { activities: activitiesContexto, laborEntries, occurrences } = useProject()
  const activities = activitiesProp ?? activitiesContexto

  const stats = useMemo(() => {
    const now = new Date()
    const leaf = activities.filter((a) => !a.isSummary)

    const bac = activities.reduce((s, a) => s + (a.cost || 0), 0)
    const ev = activities.reduce((s, a) => s + (a.cost || 0) * (a.percentComplete / 100), 0)
    const pv = activities.reduce((s, a) => {
      const totalDuration = toDate(a.finish).getTime() - toDate(a.start).getTime()
      const elapsed = Math.min(now.getTime() - toDate(a.start).getTime(), totalDuration)
      const progress = totalDuration > 0 ? Math.max(0, elapsed / totalDuration) : 0
      return s + (a.cost || 0) * progress
    }, 0)

    const atrasadas = leaf.filter((a) => toDate(a.finish) < now && a.percentComplete < 100).length

    let fimProjeto: Date | null = null
    for (const a of activities) {
      const f = toDate(a.finish)
      if (!fimProjeto || f > fimProjeto) fimProjeto = f
    }
    const diasRestantes = fimProjeto
      ? Math.ceil((fimProjeto.getTime() - now.getTime()) / 86400000)
      : null

    return {
      percentComplete: bac > 0 ? Math.round((ev / bac) * 1000) / 10 : 0,
      percentPlanned: bac > 0 ? Math.round((pv / bac) * 1000) / 10 : 0,
      totalHours: laborEntries.reduce((s, e) => s + e.hours, 0),
      openOccurrences: occurrences.filter((o) => o.status === 'aberta').length,
      atrasadas,
      fimProjeto,
      diasRestantes,
    }
  }, [activities, laborEntries, occurrences])

  const avancoOk = stats.percentComplete >= stats.percentPlanned
  const emAtraso = (stats.diasRestantes ?? 0) < 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Resumo Executivo</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avanço físico */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Avanço Físico</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-2xl font-extrabold ${avancoOk ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {stats.percentComplete}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">de {stats.percentPlanned}% previsto</span>
          </div>
          <div className="mt-2 h-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full ${avancoOk ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(stats.percentComplete, 100)}%` }}
            />
          </div>
        </div>

        {/* Mão de obra */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Users size={12} /> Mão de Obra
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.totalHours.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">HH apontadas</span>
          </div>
          <Link to="/dashboard/people" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
            Ver apontamentos →
          </Link>
        </div>

        {/* Ocorrências */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <AlertOctagon size={12} /> Ocorrências
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-2xl font-extrabold ${stats.openOccurrences > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {stats.openOccurrences}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">abertas</span>
          </div>
          <Link to="/dashboard/occurrences" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
            Ver ocorrências →
          </Link>
        </div>

        {/* Cronograma */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <CalendarClock size={12} /> Cronograma
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-2xl font-extrabold ${emAtraso ? 'text-red-600 dark:text-red-400' : stats.diasRestantes !== null && stats.diasRestantes <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
              {stats.diasRestantes !== null ? `${Math.abs(stats.diasRestantes)}d` : '—'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {stats.diasRestantes !== null ? (emAtraso ? 'de atraso' : 'restantes') : 'sem término'}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {stats.fimProjeto ? `fim: ${stats.fimProjeto.toLocaleDateString('pt-BR')}` : 'sem atividades'}
          </p>
          {stats.atrasadas > 0 && (
            <Link to="/dashboard/activities" className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline mt-1.5 inline-block">
              {stats.atrasadas} atividade{stats.atrasadas === 1 ? '' : 's'} atrasada{stats.atrasadas === 1 ? '' : 's'} →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
