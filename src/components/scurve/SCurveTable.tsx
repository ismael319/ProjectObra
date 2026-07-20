import React from 'react'
import {
  BL_COLORS,
  pct,
  sumBL0,
  PERIOD_TABLE_LABEL,
  PERIOD_LABEL,
  type CalculationUnit,
  type CurveGranularity,
  type CurvePeriod,
} from '@/lib/curve-utils'
import type { BaselineInfo } from '@/lib/xml-parser'

interface SCurveTableProps {
  curveData: CurvePeriod[]
  tableRows: CurvePeriod[]
  availableBLs: Array<BaselineInfo & { index: number }>
  unit: CalculationUnit
  unitLabel: string
  granularity: CurveGranularity
}

export function SCurveTable({ curveData, tableRows, availableBLs, unit: _unit, unitLabel, granularity }: SCurveTableProps) {
  const periodColLabel = PERIOD_LABEL[granularity]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tabela {PERIOD_TABLE_LABEL[granularity]}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">% sobre o total ({unitLabel})</span>
      </div>
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase sticky left-0 top-0 bg-white dark:bg-gray-800 z-10">Período</th>
              <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 text-sm font-semibold text-purple-500 dark:text-purple-400 uppercase">Real Acum.</th>
              <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 text-sm font-semibold text-purple-400 uppercase">Real {periodColLabel}</th>
              <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 text-sm font-semibold text-red-500 uppercase">Forecast Acum.</th>
              <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 text-sm font-semibold text-red-400 uppercase">Forecast {periodColLabel}</th>
              {availableBLs.map((bl) => (
                <th key={bl.id + '-h'} colSpan={2} className="sticky top-0 bg-white dark:bg-gray-800 text-center py-2 px-3 text-sm font-semibold uppercase" style={{ color: BL_COLORS[bl.index] }}>
                  {bl.id}
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-1 px-3 text-sm text-gray-400 sticky left-0 top-6 bg-white dark:bg-gray-800"></th>
              <th className="sticky top-6 bg-white dark:bg-gray-800"></th><th className="sticky top-6 bg-white dark:bg-gray-800"></th><th className="sticky top-6 bg-white dark:bg-gray-800"></th><th className="sticky top-6 bg-white dark:bg-gray-800"></th>
              {availableBLs.map((bl) => (
                <React.Fragment key={bl.id + '-sub'}>
                  <th className="sticky top-6 bg-white dark:bg-gray-800 text-right py-1 px-3 text-sm text-gray-400">Acum.</th>
                  <th className="sticky top-6 bg-white dark:bg-gray-800 text-right py-1 px-3 text-sm text-gray-400">{periodColLabel}</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((week, idx) => {
              const lastPeriod = curveData[curveData.length - 1]
              const bl0Total = sumBL0(lastPeriod.blCum)
              const bac = bl0Total > 0 ? bl0Total : lastPeriod.planned
              return (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 font-medium sticky left-0 bg-white dark:bg-gray-800">
                    {week.label}
                  </td>
                  <td className="py-2 px-3 text-right text-purple-600 dark:text-purple-400 font-medium">
                    {pct(week.actual, bac).toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right text-purple-500/70 dark:text-purple-400/60">
                    {pct(week.actualPeriod, bac).toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right text-red-500 dark:text-red-400">
                    {pct(week.forecast, bac).toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right text-red-400/70 dark:text-red-400/60">
                    {pct(week.forecastPeriod, bac).toFixed(1)}%
                  </td>
                  {availableBLs.map((bl) => {
                    const blTotal = lastPeriod.blCum[bl.id] || 0
                    return (
                      <React.Fragment key={bl.id + '-val'}>
                        <td className="py-2 px-3 text-right font-medium" style={{ color: BL_COLORS[bl.index] }}>
                          {pct(week.blCum[bl.id] || 0, blTotal).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-right" style={{ color: BL_COLORS[bl.index], opacity: 0.7 }}>
                          {pct(week.blPeriod[bl.id] || 0, blTotal).toFixed(1)}%
                        </td>
                      </React.Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {curveData.length > tableRows.length && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
          Mostrando amostra de {tableRows.length} de {curveData.length} períodos
        </p>
      )}
    </div>
  )
}
