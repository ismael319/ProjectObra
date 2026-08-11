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
  LabelList,
} from 'recharts'
import { useProjects } from '@/lib/project-store'
import { useProject } from '@/lib/project-context'
import { toDate } from '@/lib/utils'
import { buildCurveFromRawPoints, consolidateCurves } from '@/lib/curve-utils'
import { useTheme } from '@/lib/theme-context'
import { useMediaQuery } from '@/lib/use-media-query'
import type { WBSActivity } from '@/lib/xml-parser'

function useTooltipStyle(isMobile: boolean) {
  const { isDark } = useTheme()
  return useMemo(() => ({
    borderRadius: 10,
    border: isDark ? '1px solid rgb(55 65 81)' : '1px solid rgb(229 231 235)',
    background: isDark ? '#1f2937' : '#ffffff',
    color: isDark ? '#e5e7eb' : '#111827',
    boxShadow: isDark ? '0 4px 12px -2px rgb(0 0 0 / 0.4)' : '0 4px 12px -2px rgb(15 23 42 / 0.08)',
    fontSize: isMobile ? 11 : 13,
    fontFamily: 'var(--font-sans)',
  }), [isDark, isMobile])
}

// Distribuição das atividades do cronograma por situação (Concluída, Em
// andamento, Atrasada ou Não iniciada) — dados reais, calculados das
// atividades; um card em atraso aparece como "Atrasada" mesmo estando em
// andamento, pra situação mais grave não sumir do gráfico.
export function StatusPieChart({ activities: activitiesProp }: { activities?: WBSActivity[] } = {}) {
  const { activities: activitiesContexto } = useProject()
  const activities = activitiesProp ?? activitiesContexto
  const isMobile = useMediaQuery('(max-width: 639px)')
  const tooltipStyle = useTooltipStyle(isMobile)

  const data = useMemo(() => {
    const now = new Date()
    const counts = {
      'Em andamento': 0,
      Concluída: 0,
      Atrasada: 0,
      'Não iniciada': 0,
    }
    for (const a of activities) {
      if (a.isSummary) continue
      if (a.percentComplete === 100) counts.Concluída++
      else if (toDate(a.finish) < now) counts.Atrasada++
      else if (a.percentComplete > 0) counts['Em andamento']++
      else counts['Não iniciada']++
    }
    return [
      { name: 'Em andamento', value: counts['Em andamento'], color: '#3b82f6' },
      { name: 'Concluída', value: counts.Concluída, color: '#22c55e' },
      { name: 'Atrasada', value: counts.Atrasada, color: '#ef4444' },
      { name: 'Não iniciada', value: counts['Não iniciada'], color: '#f59e0b' },
    ].filter((d) => d.value > 0)
  }, [activities])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:rounded-xl sm:p-6">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-white sm:mb-4 sm:text-sm">Status das Atividades</h3>
      <div
        className="relative h-[200px] sm:h-64"
        role="img"
        aria-label={data.map((item) => `${item.name}: ${item.value}`).join(', ')}
      >
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Sem atividades
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 46 : 60}
                outerRadius={isMobile ? 70 : 90}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              {!isMobile && <Tooltip contentStyle={tooltipStyle} />}
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:mt-4 sm:flex sm:flex-wrap sm:gap-4">
        {data.length === 0 ? (
          <span className="text-sm text-gray-400 dark:text-gray-500">Nenhuma atividade no cronograma</span>
        ) : (
          data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                {item.name} <span className="text-gray-400 dark:text-gray-500">({item.value})</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Atividades (e concluídas) por mês de início — mostra o ritmo de arranque do
// cronograma, limitado aos últimos 18 meses com dados pra legenda não virar
// uma parede de texto num projeto longo.
export function MonthlyBarChart({ activities: activitiesProp }: { activities?: WBSActivity[] } = {}) {
  const { activities: activitiesContexto } = useProject()
  const activities = activitiesProp ?? activitiesContexto
  const isMobile = useMediaQuery('(max-width: 639px)')
  const { isDark } = useTheme()
  const tooltipStyle = useTooltipStyle(isMobile)
  const labelColor = isDark ? '#cbd5e1' : '#475569'

  const data = useMemo(() => {
    const porMes = new Map<string, { atividades: number; concluidas: number }>()
    for (const a of activities) {
      if (a.isSummary) continue
      const d = toDate(a.start)
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const entry = porMes.get(chave) || { atividades: 0, concluidas: 0 }
      entry.atividades++
      if (a.percentComplete === 100) entry.concluidas++
      porMes.set(chave, entry)
    }
    return Array.from(porMes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-18)
      .map(([chave, v]) => ({
        month: new Date(`${chave}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }),
        atividades: v.atividades,
        concluidas: v.concluidas,
      }))
  }, [activities])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:rounded-xl sm:p-6">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-white sm:text-sm">Atividades por Mês</h3>
        <div className="flex items-center gap-2.5 text-[10px] text-gray-500 dark:text-gray-400 sm:hidden">
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Atividades</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-green-600" /> Concluídas</span>
        </div>
      </div>
      <div
        className="h-[200px] sm:h-64"
        role="img"
        aria-label={data.map((item) => `${item.month}: ${item.atividades} atividades, ${item.concluidas} concluídas`).join('; ')}
      >
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Sem atividades
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={isMobile ? { top: 18, right: 0, bottom: 0, left: -20 } : undefined}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-700" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: isMobile ? 10 : 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis width={isMobile ? 30 : undefined} tick={{ fontSize: isMobile ? 10 : 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              {!isMobile && <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />}
              <Bar dataKey="atividades" name="Atividades" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 20 : 28} isAnimationActive={false}>
                {isMobile && <LabelList dataKey="atividades" position="top" fill={labelColor} fontSize={9} />}
              </Bar>
              <Bar dataKey="concluidas" name="Concluídas" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 20 : 28} isAnimationActive={false}>
                {isMobile && <LabelList dataKey="concluidas" position="top" fill={labelColor} fontSize={9} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// Prévia compacta da Curva S real (mesma fonte de dados da página Curva S:
// buildCurveFromRawPoints sobre os cronogramas ativos) — só as linhas Real x
// Previsto em %, sem barras de período, baselines ou legenda interativa.
export function ProgressAreaChart() {
  const { currentProject } = useProjects()
  const isMobile = useMediaQuery('(max-width: 639px)')
  const tooltipStyle = useTooltipStyle(isMobile)

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
  const ultimoPonto = chartData[chartData.length - 1]

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-700/80 dark:bg-gray-800 sm:rounded-xl sm:p-6">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-white sm:text-sm">Curva S - Progresso Geral (%)</h3>
        <div className="flex shrink-0 items-center gap-2.5 text-[10px] text-gray-500 dark:text-gray-400 sm:hidden">
          <span className="flex items-center gap-1"><i className="h-0.5 w-3 rounded-full bg-blue-600" /> Real</span>
          <span className="flex items-center gap-1"><i className="h-px w-3 border-t border-dashed border-gray-400" /> Previsto</span>
        </div>
      </div>
      {isMobile && ultimoPonto && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-500/10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Real atual</p>
            <p className="mt-0.5 text-lg font-extrabold leading-none text-blue-900 dark:text-blue-100">{ultimoPonto.real}%</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-700/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Previsto atual</p>
            <p className="mt-0.5 text-lg font-extrabold leading-none text-gray-800 dark:text-gray-100">{ultimoPonto.previsto}%</p>
          </div>
        </div>
      )}
      <div
        className="h-[200px] sm:h-64"
        role="img"
        aria-label={chartData.length > 0 ? chartData.map((item) => `${item.label}: real ${item.real}%, previsto ${item.previsto}%`).join('; ') : 'Sem dados de Curva S'}
      >
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Sem dados de Curva S
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={isMobile ? { top: 4, right: 0, bottom: 0, left: -20 } : undefined}>
              <defs>
                <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-700" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 12, fill: '#94a3b8' }} minTickGap={isMobile ? 24 : 5} axisLine={false} tickLine={false} />
              <YAxis width={isMobile ? 32 : undefined} tick={{ fontSize: isMobile ? 9 : 12, fill: '#94a3b8' }} domain={[0, 100]} axisLine={false} tickLine={false} />
              {!isMobile && <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />}
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
