import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Users } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'
import { startOfWeek, addDays, formatShortDate } from '@/lib/iso-week'
import PlanningSwitcher from '@/components/PlanningSwitcher'

export default function ResourceHistogram() {
  const { project, resources, assignments, activities } = useProject()

  const histogramData = useMemo(() => {
    if (activities.length === 0 || resources.length === 0) return []

    const allDates = activities.flatMap((a) => [toDate(a.start), toDate(a.finish)])
    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))

    // Semanas alinhadas ao calendário do cronograma (weekStartDay do XML,
    // padrão sexta-feira), em vez de blocos relativos de 7 dias a partir do
    // início do projeto — consistente com Curva S e Programação.
    const weekStartDay = project?.weekStartDay ?? 5
    const firstWeekStart = startOfWeek(minDate, weekStartDay)
    const totalWeeks = Math.ceil((maxDate.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))

    const weeks: { week: string; [key: string]: string | number }[] = []

    for (let i = 0; i <= Math.min(totalWeeks, 52); i++) {
      const currentDate = addDays(firstWeekStart, i * 7)
      const weekLabel = formatShortDate(currentDate)

      const weekData: { week: string; [key: string]: string | number } = { week: weekLabel }

      resources.forEach((res) => {
        const resAssignments = assignments.filter((a) => a.resourceUid === res.uid)
        let totalHours = 0

        resAssignments.forEach((a) => {
          const activity = activities.find((act) => act.uid === a.taskUid)
          if (activity) {
            const activityStart = toDate(activity.start)
            const activityEnd = toDate(activity.finish)
            if (currentDate >= activityStart && currentDate <= activityEnd) {
              totalHours += (a.work / 60) * a.units
            }
          }
        })

        weekData[res.name] = Math.round(totalHours * 10) / 10
      })

      weeks.push(weekData)
    }

    return weeks
  }, [activities, resources, assignments, project?.weekStartDay])

  const resourceColors = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
  ]

  if (!project || resources.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="mx-auto text-gray-300 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700">Nenhum recurso encontrado</h2>
        <p className="text-gray-500 mt-2">
          Carregue um cronograma com recursos para ver o histograma
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PlanningSwitcher />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Histograma de Recursos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Distribuição de mão de obra ao longo do tempo - {project.name}
        </p>
      </div>

      {/* Resource Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {resources.slice(0, 8).map((res, i) => {
          const totalWork = assignments
            .filter((a) => a.resourceUid === res.uid)
            .reduce((sum, a) => sum + a.work, 0)
          const totalHours = Math.round((totalWork / 60) * 10) / 10

          return (
            <div key={res.uid} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: resourceColors[i % resourceColors.length] }}
                />
                <span className="text-sm font-medium text-gray-700 truncate">{res.name}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{totalHours}h</p>
              <p className="text-xs text-gray-500">{res.group || 'Sem grupo'}</p>
            </div>
          )
        })}
      </div>

      {/* Histogram Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribuição Semanal de Horas</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip
                formatter={(value: any, name: any) => [`${value}h`, name]}
              />
              <Legend />
              {resources.slice(0, 6).map((res, i) => (
                <Bar
                  key={res.uid}
                  dataKey={res.name}
                  stackId="resources"
                  fill={resourceColors[i % resourceColors.length]}
                  radius={i === resources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resource Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Detalhamento por Recurso</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Recurso</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Grupo</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Horas Totais</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Custo/Hora</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Custo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resources.map((res, i) => {
                const resAssignments = assignments.filter((a) => a.resourceUid === res.uid)
                const totalWork = resAssignments.reduce((sum, a) => sum + a.work, 0)
                const totalHours = Math.round((totalWork / 60) * 10) / 10
                const totalCost = resAssignments.reduce((sum, a) => sum + a.cost, 0)
                const typeLabels = ['Trabalho', 'Material', 'Custo']

                return (
                  <tr key={res.uid} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: resourceColors[i % resourceColors.length] }}
                        />
                        <span className="text-sm font-medium text-gray-900">{res.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{typeLabels[res.type - 1] || 'Trabalho'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{res.group || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">{totalHours}h</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">R$ {res.baseRate.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                      R$ {totalCost.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
