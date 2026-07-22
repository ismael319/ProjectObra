import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { fmtVal, type CalculationUnit } from '@/lib/curve-utils'

interface AdvanceMetric {
  percent: number
  absolute: number
  deltaPP: number
}

interface BaselineAdvance {
  id: string
  label: string
  color: string
  metric: AdvanceMetric
}

interface SCurveAdvanceCardProps {
  statusDate: string
  statusDateFormatted: string
  statusEndDateFormatted: string
  real: AdvanceMetric
  baselines: BaselineAdvance[]
  unit: CalculationUnit
  periodColLabel: string
}

function DeltaIndicator({ deltaPP, periodLabel }: { deltaPP: number; periodLabel: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-3">
      {deltaPP > 0 ? (
        <ArrowUp size={14} className="text-green-600" />
      ) : deltaPP < 0 ? (
        <ArrowDown size={14} className="text-red-600" />
      ) : (
        <Minus size={14} className="text-gray-400" />
      )}
      <span className={`text-xs font-medium ${deltaPP > 0 ? 'text-green-600' : deltaPP < 0 ? 'text-red-600' : 'text-gray-400'}`}>
        {deltaPP > 0 ? '+' : ''}{deltaPP.toFixed(1)}pp
      </span>
      <span className="text-xs text-gray-400 dark:text-gray-500">(vs {periodLabel})</span>
    </div>
  )
}

export function SCurveAdvanceCard({ statusDate, statusDateFormatted, statusEndDateFormatted, real, baselines, unit, periodColLabel }: SCurveAdvanceCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Avanço Atual</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Data de Status: {statusDate} ({statusDateFormatted} a {statusEndDateFormatted})</span>
      </div>
      <div className="flex flex-wrap divide-y md:divide-y-0 divide-gray-200 dark:divide-gray-700">
        {/* AVANÇO REAL */}
        <div className="flex-1 min-w-[220px] p-5 bg-[#9933FF]/[0.06] dark:bg-[#9933FF]/[0.1] md:border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded-full bg-[#9933FF]" />
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avanço Real</h4>
          </div>
          <p className="text-3xl font-bold text-[#9933FF]">{real.percent.toFixed(1)}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">{fmtVal(real.absolute, unit)}</p>
          <DeltaIndicator deltaPP={real.deltaPP} periodLabel={periodColLabel} />
        </div>

        {/* AVANÇO POR LINHA DE BASE — uma coluna por LB marcada em Opções */}
        {baselines.map((bl, i) => (
          <div
            key={bl.id}
            className={`flex-1 min-w-[220px] p-5 ${i < baselines.length - 1 ? 'md:border-r border-gray-200 dark:border-gray-700' : ''}`}
            style={{ backgroundColor: bl.color + '0d' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 rounded-full" style={{ backgroundColor: bl.color }} />
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avanço Planejado {bl.label}</h4>
            </div>
            <p className="text-3xl font-bold" style={{ color: bl.color }}>{bl.metric.percent.toFixed(1)}%</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">{fmtVal(bl.metric.absolute, unit)}</p>
            <DeltaIndicator deltaPP={bl.metric.deltaPP} periodLabel={periodColLabel} />
          </div>
        ))}
      </div>
    </div>
  )
}
