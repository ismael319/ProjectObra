import { useState } from 'react'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import type { CalculationUnit, CurvePeriod } from '@/lib/curve-utils'
import { exportWideTableToExcel } from '@/lib/export-utils'

interface SCurveWideTableProps {
  title: string
  color?: string
  curveData: CurvePeriod[]
  selectedBLInfo: { id: string; label: string } | undefined
  unit: CalculationUnit
  defaultOpen?: boolean
}

// Sem separador de milhar de propósito — com dezenas de colunas (uma por período),
// número compacto facilita escanear a linha inteira, igual ao formato do Oliplan.
function fmtNum(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',')
}

// Tela mostra % (do total da própria linha) em vez do valor absoluto em H/R$ — com
// dezenas de colunas de período, números grandes de 6-7 dígitos dificultam comparar
// a distribuição entre semanas. O valor absoluto continua disponível via "Exportar".
function fmtPct(value: number, total: number): string {
  if (total === 0) return '—'
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1)}%`
}

// "Baseline 0 (original)" → "BL0" — o nome completo (herdado do MS Project) é
// verboso demais para caber ao lado de dezenas de colunas de período.
function abbreviateBLLabel(label: string): string {
  return label.replace(/Baseline\s+(\d+)\s*\([^)]*\)/gi, 'BL$1')
}

const COL1_WIDTH = 260

export function SCurveWideTable({ title, color, curveData, selectedBLInfo, unit, defaultOpen = true }: SCurveWideTableProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (curveData.length === 0) return null

  const unitSuffix = unit === 'HH' ? 'h' : 'R$'
  const last = curveData[curveData.length - 1]

  const blLabel = selectedBLInfo ? abbreviateBLLabel(selectedBLInfo.label) : ''

  const rows: { metric: string; total: number; values: number[] }[] = []
  if (selectedBLInfo) {
    rows.push({
      metric: `Trabalho da ${blLabel} — semanal`,
      total: last.blCum[selectedBLInfo.id] || 0,
      values: curveData.map((p) => p.blPeriod[selectedBLInfo.id] || 0),
    })
  }
  rows.push({ metric: 'Trabalho semanal (forecast)', total: last.forecast, values: curveData.map((p) => p.forecastPeriod) })
  rows.push({ metric: 'Trabalho real semanal', total: last.actual, values: curveData.map((p) => p.actualPeriod) })
  if (selectedBLInfo) {
    rows.push({
      metric: `Trabalho da ${blLabel} — acumulado`,
      total: last.blCum[selectedBLInfo.id] || 0,
      values: curveData.map((p) => p.blCum[selectedBLInfo.id] || 0),
    })
  }
  rows.push({ metric: 'Trabalho acumulado (forecast)', total: last.forecast, values: curveData.map((p) => p.forecast) })
  rows.push({ metric: 'Trabalho real acumulado', total: last.actual, values: curveData.map((p) => p.actual) })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between gap-2 group min-w-0"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 min-w-0">
            {color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
            <span className="truncate">{title}</span>
          </h3>
          {open ? (
            <ChevronUp size={18} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0" />
          ) : (
            <ChevronDown size={18} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0" />
          )}
        </button>
        <button
          onClick={() => exportWideTableToExcel(title, rows, curveData.map((p) => p.label), unitSuffix)}
          title={`Exportar valores em ${unitSuffix}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shrink-0"
        >
          <Download size={13} /> Exportar ({unitSuffix})
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Valores em % do total de cada linha — use "Exportar" para ver em {unitSuffix}.
      </p>
      {open && (
        <div className="overflow-auto max-h-[500px] border border-gray-100 dark:border-gray-700 rounded-lg">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th
                  className="sticky left-0 top-0 z-20 bg-white dark:bg-gray-800 text-left py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase"
                  style={{ minWidth: COL1_WIDTH, maxWidth: COL1_WIDTH }}
                >
                  Métrica
                </th>
                <th className="sticky top-0 bg-white dark:bg-gray-800 text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                  Total ({unitSuffix})
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
                    {row.metric}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {fmtNum(row.total)}
                  </td>
                  {row.values.map((v, i) => (
                    <td key={i} className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {fmtPct(v, row.total)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
