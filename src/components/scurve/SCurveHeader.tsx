import { ArrowUp, ArrowDown } from 'lucide-react'
import { getSPIColor } from '@/lib/project-calculations'
import { fmtK } from '@/lib/curve-utils'
import type { CalculationUnit } from '@/lib/curve-utils'

interface SCurveHeaderProps {
  projectName: string
  unit: CalculationUnit
  overallPace: {
    spiGeral: number
    terminoLabel: string | null
    metaPct: number
  } | null
  selectedBLInfo: {
    label: string
  } | undefined
  selectedBLTotal: number
}

export function SCurveHeader({ projectName, unit, overallPace, selectedBLInfo, selectedBLTotal }: SCurveHeaderProps) {

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Curva S</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Análise de Earned Value - {projectName}</p>
      </div>
      {overallPace && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            {unit === 'HH' ? 'Trabalho' : 'Custo'}
          </span>
          <span
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: getSPIColor(overallPace.spiGeral) }}
          >
            {overallPace.spiGeral >= 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            SPI {overallPace.spiGeral.toFixed(2)}
          </span>
          {overallPace.terminoLabel && (
            <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Término {overallPace.terminoLabel}
            </span>
          )}
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              overallPace.metaPct >= 0
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}
          >
            Meta {overallPace.metaPct >= 0 ? '+' : ''}{overallPace.metaPct.toFixed(1)}%
          </span>
        </div>
      )}
      {selectedBLInfo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
          <span className="text-blue-700 dark:text-blue-300 font-medium">{selectedBLInfo.label}</span>
          <span className="text-blue-500 dark:text-blue-400">|</span>
          <span className="text-blue-600 dark:text-blue-300 font-mono">{fmtK(selectedBLTotal, unit)}</span>
        </div>
      )}
    </div>
  )
}
