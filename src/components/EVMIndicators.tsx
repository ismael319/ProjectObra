import { useMemo } from 'react'
import { Gauge, TrendingUp, TrendingDown } from 'lucide-react'
import { useProject } from '@/lib/project-context'
import { calculateIndices, getSPIColor, getCPIColor } from '@/lib/project-calculations'
import { toDate } from '@/lib/utils'

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtSinal = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v)}`

// Índices de performance calculados A PARTIR das atividades em tempo real
// (não do `indices` do contexto, que só é recalculado quando o projeto é
// carregado e fica desatualizado se % concluído for editado na página de
// Atividades). Replica a mesma fórmula da Curva S/EVM (PMBOK).
export default function EVMIndicators() {
  const { activities } = useProject()

  const idx = useMemo(() => {
    const now = new Date()

    const plannedValue = activities.map((a) => {
      const totalDuration = toDate(a.finish).getTime() - toDate(a.start).getTime()
      const elapsed = Math.min(now.getTime() - toDate(a.start).getTime(), totalDuration)
      const progress = totalDuration > 0 ? Math.max(0, elapsed / totalDuration) : 0
      return (a.cost || 0) * progress
    })
    const earnedValue = activities.map((a) => (a.cost || 0) * (a.percentComplete / 100))
    const actualCost = activities.map((a) => a.actualCost || (a.cost || 0) * (a.percentComplete / 100) * 0.95)
    const bac = activities.reduce((sum, a) => sum + (a.cost || 0), 0)

    const calc = calculateIndices(plannedValue, earnedValue, actualCost, bac)

    // PPC (Last Planner): das atividades que já deveriam ter começado, quantas
    // já foram 100% concluídas.
    const scheduled = activities.filter((a) => !a.isSummary && toDate(a.start) <= now)
    const completed = scheduled.filter((a) => a.percentComplete === 100)
    calc.PPC = scheduled.length > 0 ? (completed.length / scheduled.length) * 100 : 0

    return calc
  }, [activities])

  if (activities.length === 0) return null

  const progressoAtrasado = idx.percentComplete < idx.percentPlanned
  const svOk = idx.SV >= 0
  const cvOk = idx.CV >= 0
  const vacOk = idx.VAC >= 0
  const ppcOk = idx.PPC >= 70
  const ppcMedio = idx.PPC >= 50

  const ppcClass = ppcOk
    ? 'text-green-600 dark:text-green-400'
    : ppcMedio
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'

  const miniMetrica = (label: string, valor: string, ok: boolean | null) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`text-sm font-bold tabular-nums ${
          ok === null ? 'text-gray-900 dark:text-white' : ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {valor}
      </span>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={18} className="text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Indicadores de Performance (EVM)</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Progresso físico */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3 sm:p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Progresso Físico</p>
          <p className={`text-2xl font-extrabold mt-1 ${progressoAtrasado ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
            {idx.percentComplete}%
          </p>
          <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full">
            <div
              className={`h-1.5 rounded-full ${progressoAtrasado ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(idx.percentComplete, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">previsto: {idx.percentPlanned}%</p>
        </div>

        {/* SPI */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3 sm:p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">SPI (Prazo)</p>
          <p className="text-2xl font-extrabold mt-1" style={{ color: getSPIColor(idx.SPI) }}>
            {idx.SPI.toFixed(2)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 flex items-center gap-1">
            {svOk ? <TrendingUp size={11} className="text-green-500" /> : <TrendingDown size={11} className="text-red-500" />}
            SV {fmtSinal(idx.SV)}
          </p>
        </div>

        {/* CPI */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3 sm:p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">CPI (Custo)</p>
          <p className="text-2xl font-extrabold mt-1" style={{ color: getCPIColor(idx.CPI) }}>
            {idx.CPI.toFixed(2)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 flex items-center gap-1">
            {cvOk ? <TrendingUp size={11} className="text-green-500" /> : <TrendingDown size={11} className="text-red-500" />}
            CV {fmtSinal(idx.CV)}
          </p>
        </div>

        {/* PPC */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3 sm:p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">PPC (Last Planner)</p>
          <p className={`text-2xl font-extrabold mt-1 ${ppcClass}`}>{idx.PPC.toFixed(1)}%</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">planos completos no prazo</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2.5">
        {miniMetrica('Previsão (EAC)', fmt(idx.EAC.eac1), null)}
        {miniMetrica('Variação ao final (VAC)', fmtSinal(idx.VAC), vacOk)}
        {miniMetrica('Variação de prazo (SV)', fmtSinal(idx.SV), svOk)}
        {miniMetrica('Variação de custo (CV)', fmtSinal(idx.CV), cvOk)}
      </div>
    </div>
  )
}
