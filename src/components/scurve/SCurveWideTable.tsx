import type { CalculationUnit, CurvePeriod } from '@/lib/curve-utils'

interface SCurveWideTableProps {
  curveData: CurvePeriod[]
  projectName: string
  selectedBLInfo: { id: string; label: string } | undefined
  unit: CalculationUnit
}

// Sem separador de milhar de propósito — com dezenas de colunas (uma por período),
// número compacto facilita escanear a linha inteira, igual ao formato do Oliplan.
function fmtNum(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',')
}

const COL1_WIDTH = 180
const COL2_WIDTH = 260

export function SCurveWideTable({ curveData, projectName, selectedBLInfo, unit }: SCurveWideTableProps) {
  if (curveData.length === 0) return null

  const unitSuffix = unit === 'HH' ? 'h' : 'R$'
  const last = curveData[curveData.length - 1]

  const rows: { metric: string; total: number; values: number[] }[] = []
  if (selectedBLInfo) {
    rows.push({
      metric: `Trabalho da ${selectedBLInfo.label} — semanal`,
      total: last.blCum[selectedBLInfo.id] || 0,
      values: curveData.map((p) => p.blPeriod[selectedBLInfo.id] || 0),
    })
  }
  rows.push({ metric: 'Trabalho semanal (forecast)', total: last.forecast, values: curveData.map((p) => p.forecastPeriod) })
  rows.push({ metric: 'Trabalho real semanal', total: last.actual, values: curveData.map((p) => p.actualPeriod) })
  if (selectedBLInfo) {
    rows.push({
      metric: `Trabalho da ${selectedBLInfo.label} — acumulado`,
      total: last.blCum[selectedBLInfo.id] || 0,
      values: curveData.map((p) => p.blCum[selectedBLInfo.id] || 0),
    })
  }
  rows.push({ metric: 'Trabalho acumulado (forecast)', total: last.forecast, values: curveData.map((p) => p.forecast) })
  rows.push({ metric: 'Trabalho real acumulado', total: last.actual, values: curveData.map((p) => p.actual) })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tabela</h3>
      <div className="overflow-auto max-h-[500px] border border-gray-100 dark:border-gray-700 rounded-lg">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th
                className="sticky left-0 top-0 z-20 bg-white dark:bg-gray-800 text-left py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase"
                style={{ minWidth: COL1_WIDTH, maxWidth: COL1_WIDTH }}
              >
                Nome do projeto
              </th>
              <th
                className="sticky top-0 z-20 bg-white dark:bg-gray-800 text-left py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase"
                style={{ left: COL1_WIDTH, minWidth: COL2_WIDTH, maxWidth: COL2_WIDTH }}
              >
                Métrica
              </th>
              <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                Trabalho total ({unitSuffix})
              </th>
              {curveData.map((p) => (
                <th key={p.date} className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                <td
                  className="sticky left-0 z-10 bg-white dark:bg-gray-800 py-2 px-3 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  style={{ minWidth: COL1_WIDTH, maxWidth: COL1_WIDTH }}
                >
                  {projectName}
                </td>
                <td
                  className="sticky z-10 bg-white dark:bg-gray-800 py-2 px-3 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  style={{ left: COL1_WIDTH, minWidth: COL2_WIDTH, maxWidth: COL2_WIDTH }}
                >
                  {row.metric}
                </td>
                <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                  {fmtNum(row.total)}
                </td>
                {row.values.map((v, i) => (
                  <td key={i} className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {fmtNum(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
