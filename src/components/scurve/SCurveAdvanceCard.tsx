import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { fmtVal, BL_COLORS, type CalculationUnit } from '@/lib/curve-utils'

interface AdvanceMetrics {
  statusDate: string
  statusDateFormatted: string
  real: { percent: number; absolute: number; deltaPP: number }
  previsto: { percent: number; absolute: number; deltaPP: number }
  baseline: { percent: number; absolute: number; deltaPP: number }
}

interface SCurveAdvanceCardProps {
  advances: AdvanceMetrics
  unit: CalculationUnit
  selectedBLInfo: { id: string; index: number } | undefined
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

export function SCurveAdvanceCard({ advances, unit, selectedBLInfo, periodColLabel }: SCurveAdvanceCardProps) {
  const blColor = BL_COLORS[selectedBLInfo?.index ?? 0] || '#00AA00'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Avanço Atual</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Data de Status: {advances.statusDate} ({advances.statusDateFormatted} a {advances.statusEndDateFormatted})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">
        {/* AVANÇO REAL */}
        <div className="p-5 bg-[#9933FF]/[0.06] dark:bg-[#9933FF]/[0.1]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded-full bg-[#9933FF]" />
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avanço Real</h4>
          </div>
          <p className="text-3xl font-bold text-[#9933FF]">{advances.real.percent.toFixed(1)}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">{fmtVal(advances.real.absolute, unit)}</p>
          <DeltaIndicator deltaPP={advances.real.deltaPP} periodLabel={periodColLabel} />
        </div>

        {/* AVANÇO PREVISTO */}
        <div className="p-5 bg-[#0066CC]/[0.06] dark:bg-[#0066CC]/[0.1]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded-full bg-[#0066CC]" />
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avanço Previsto</h4>
          </div>
          <p className="text-3xl font-bold text-[#0066CC]">{advances.previsto.percent.toFixed(1)}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">{fmtVal(advances.previsto.absolute, unit)}</p>
          <DeltaIndicator deltaPP={advances.previsto.deltaPP} periodLabel={periodColLabel} />
        </div>

        {/* AVANÇO LINHA BASE */}
        <div className="p-5" style={{ backgroundColor: blColor + '0d' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: blColor }} />
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{selectedBLInfo?.id || 'Linha Base'}</h4>
          </div>
          <p className="text-3xl font-bold" style={{ color: blColor }}>{advances.baseline.percent.toFixed(1)}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-mono">{fmtVal(advances.baseline.absolute, unit)}</p>
          <DeltaIndicator deltaPP={advances.baseline.deltaPP} periodLabel={periodColLabel} />
        </div>
      </div>
    </div>
  )
}
