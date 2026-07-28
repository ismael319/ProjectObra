import type { CalculationUnit } from '@/lib/curve-utils'

interface SCurveHeaderProps {
  projectName: string
  unit: CalculationUnit
  overallPace: {
    spiGeral: number
    terminoLabel: string | null
    metaPct: number
  } | null
  scheduleInfo: Array<{
    id: string
    nome: string
    cor: string
    start: Date | null
    finish: Date | null
    blFinish: Date | null
    realPct: number | null
    plannedPct: number | null
  }>
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR') : '—'
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`
}

export function SCurveHeader({ projectName, overallPace, scheduleInfo }: SCurveHeaderProps) {

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Curva S</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Análise de Earned Value - {projectName}</p>
        </div>
        {overallPace?.terminoLabel && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Término projetado {overallPace.terminoLabel}
            </span>
          </div>
        )}
      </div>

      {scheduleInfo.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <th className="text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Cronograma
                </th>
                <th className="text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Início
                </th>
                <th className="text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Término
                </th>
                <th className="text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Término LB
                </th>
                <th className="text-left font-medium text-purple-600 dark:text-purple-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Avanço Real
                </th>
                <th className="text-left font-medium text-blue-600 dark:text-blue-400 px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  Avanço BL0
                </th>
              </tr>
            </thead>
            <tbody>
              {scheduleInfo.map((s) => (
                <tr key={s.id} className="bg-white dark:bg-gray-900">
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                      {s.nome}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {fmtDate(s.start)}
                  </td>
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {fmtDate(s.finish)}
                  </td>
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {fmtDate(s.blFinish)}
                  </td>
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 font-medium text-purple-600 dark:text-purple-400 tabular-nums whitespace-nowrap">
                    {fmtPct(s.realPct)}
                  </td>
                  <td className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 font-medium text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap">
                    {fmtPct(s.plannedPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
