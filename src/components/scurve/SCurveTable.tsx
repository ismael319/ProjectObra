import {
  BL_COLORS,
  pct,
  sumBL0,
  PERIOD_TABLE_LABEL,
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

interface RowDef {
  label: string
  color: string
  getValue: (w: CurvePeriod, bac: number, blTotal: number) => string
}

export function SCurveTable({ curveData, tableRows, availableBLs, unit: _unit, unitLabel, granularity }: SCurveTableProps) {
  const lastPeriod = curveData[curveData.length - 1]
  const bl0Total = sumBL0(lastPeriod.blCum)
  const bac = bl0Total > 0 ? bl0Total : lastPeriod.planned

  const rows: RowDef[] = [
    {
      label: 'Real Acum.',
      color: 'text-purple-600 dark:text-purple-400',
      getValue: (w) => `${pct(w.actual, bac).toFixed(1)}%`,
    },
    {
      label: 'Real período',
      color: 'text-purple-500/70 dark:text-purple-400/60',
      getValue: (w) => `${pct(w.actualPeriod, bac).toFixed(1)}%`,
    },
    {
      label: 'Forecast Acum.',
      color: 'text-red-500 dark:text-red-400',
      getValue: (w) => `${pct(w.forecast, bac).toFixed(1)}%`,
    },
    {
      label: 'Forecast período',
      color: 'text-red-400/70 dark:text-red-400/60',
      getValue: (w) => `${pct(w.forecastPeriod, bac).toFixed(1)}%`,
    },
  ]

  for (const bl of availableBLs) {
    const blTotal = lastPeriod.blCum[bl.id] || 0
    const color = BL_COLORS[bl.index]
    rows.push({
      label: `${bl.label.split(' — ')[1] || bl.label} Acum.`,
      color: '',
      getValue: (w) => `${pct(w.blCum[bl.id] || 0, blTotal).toFixed(1)}%`,
    })
    rows.push({
      label: `${bl.label.split(' — ')[1] || bl.label} período`,
      color: '',
      getValue: (w) => `${pct(w.blPeriod[bl.id] || 0, blTotal).toFixed(1)}%`,
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tabela {PERIOD_TABLE_LABEL[granularity]}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">% sobre o total ({unitLabel})</span>
      </div>
      <div className="overflow-auto max-h-[500px]">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 bg-white dark:bg-gray-800 z-10 text-left py-2 px-3 text-sm font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"></th>
              {tableRows.map((w) => (
                <th
                  key={w.date}
                  className="sticky top-0 bg-white dark:bg-gray-800 z-10 text-center py-2 px-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap"
                >
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isBL = row.label.includes('BL') || availableBLs.some((bl) => row.label.startsWith(bl.label.split(' — ')[1] || bl.label))
              const blIdx = isBL ? Math.floor((ri - 4) / 2) : -1
              const blColor = blIdx >= 0 && blIdx < availableBLs.length ? BL_COLORS[availableBLs[blIdx].index] : undefined
              const isAccum = row.label.includes('Acum.')

              return (
                <tr key={ri} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td
                    className={`sticky left-0 z-10 bg-white dark:bg-gray-800 py-1.5 px-3 font-medium whitespace-nowrap border-r border-gray-100 dark:border-gray-700/50 ${
                      ri < 4
                        ? row.color
                        : blColor
                          ? isAccum ? '' : 'opacity-70'
                          : 'text-gray-700 dark:text-gray-300'
                    }`}
                    style={blColor ? { color: blColor, opacity: isAccum ? 1 : 0.7 } : undefined}
                  >
                    {row.label}
                  </td>
                  {tableRows.map((w) => (
                    <td
                      key={w.date}
                      className={`py-1.5 px-2 text-center whitespace-nowrap ${
                        ri < 4
                          ? row.color
                          : ''
                      }`}
                      style={blColor ? { color: blColor, opacity: isAccum ? 1 : 0.7 } : undefined}
                    >
                      {row.getValue(w, bac, blColor ? (lastPeriod.blCum[availableBLs[blIdx]?.id] || 0) : 0)}
                    </td>
                  ))}
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
