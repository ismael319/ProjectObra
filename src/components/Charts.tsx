import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import { useProjects } from '@/lib/project-store'
import { buildCurveFromRawPoints, consolidateCurves } from '@/lib/curve-utils'

const projectStatusData = [
  { name: 'Em andamento', value: 18, color: '#3b82f6' },
  { name: 'Concluído', value: 6, color: '#22c55e' },
  { name: 'Atrasado', value: 3, color: '#ef4444' },
  { name: 'Pendente', value: 4, color: '#f59e0b' },
]

const monthlyData = [
  { month: 'Jan', projetos: 12, concluidos: 2 },
  { month: 'Fev', projetos: 15, concluidos: 3 },
  { month: 'Mar', projetos: 18, concluidos: 4 },
  { month: 'Abr', projetos: 20, concluidos: 5 },
  { month: 'Mai', projetos: 22, concluidos: 5 },
  { month: 'Jun', projetos: 24, concluidos: 6 },
]

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid rgb(229 231 235)',
  boxShadow: '0 4px 12px -2px rgb(15 23 42 / 0.08)',
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
}

export function StatusPieChart() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700/80 shadow-card">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">Status dos Projetos</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={projectStatusData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {projectStatusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        {projectStatusData.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {item.name} <span className="text-gray-400 dark:text-gray-500">({item.value})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MonthlyBarChart() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700/80 shadow-card">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">Projetos por Mês</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-700" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
            <Bar dataKey="projetos" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="concluidos" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Prévia compacta da Curva S real (mesma fonte de dados da página Curva S:
// buildCurveFromRawPoints sobre os cronogramas ativos) — só as linhas Real x
// Previsto em %, sem barras de período, baselines ou legenda interativa.
export function ProgressAreaChart() {
  const { currentProject } = useProjects()

  const chartData = useMemo(() => {
    const cronogramas = (currentProject?.cronogramas || []).filter((c) => c.ativo)
    if (cronogramas.length === 0) return []

    const curves = cronogramas.map((c) =>
      buildCurveFromRawPoints(c.dados?.timephased?.rawPoints, 'week', 'HH', [], c.dados?.weekStartDay ?? 5),
    )
    const consolidated = curves.length === 1
      ? curves[0]
      : consolidateCurves(curves, 'soma', cronogramas.map((c) => c.peso))

    if (consolidated.length === 0) return []
    const finalPlanned = consolidated[consolidated.length - 1].planned
    if (finalPlanned <= 0) return []

    return consolidated.map((p) => ({
      label: p.label,
      previsto: Math.round((p.planned / finalPlanned) * 1000) / 10,
      real: Math.round((p.actual / finalPlanned) * 1000) / 10,
    }))
  }, [currentProject])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700/80 shadow-card">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4">Curva S - Progresso Geral (%)</h3>
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Sem dados de Curva S
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-700" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} domain={[0, 100]} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Area
                type="monotone"
                dataKey="previsto"
                stroke="#94a3b8"
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                name="Previsto"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="real"
                stroke="#2563eb"
                fill="url(#progressFill)"
                strokeWidth={2.5}
                name="Real"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
