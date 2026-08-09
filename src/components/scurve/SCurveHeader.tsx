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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Curva S</h1>
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
        <>
        <div className="grid gap-2 sm:hidden">
          {scheduleInfo.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex min-w-0 items-center gap-2 font-semibold text-gray-800 dark:text-gray-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.cor }} />
                <span className="truncate">{s.nome}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-gray-400">Início</dt><dd className="font-medium text-gray-700 dark:text-gray-300">{fmtDate(s.start)}</dd></div>
                <div><dt className="text-gray-400">Término</dt><dd className="font-medium text-gray-700 dark:text-gray-300">{fmtDate(s.finish)}</dd></div>
                <div><dt className="text-gray-400">Término LB</dt><dd className="font-medium text-gray-700 dark:text-gray-300">{fmtDate(s.blFinish)}</dd></div>
                <div><dt className="text-purple-500">Avanço real</dt><dd className="font-semibold text-purple-600 dark:text-purple-400">{fmtPct(s.realPct)}</dd></div>
                <div><dt className="text-blue-500">Avanço BL0</dt><dd className="font-semibold text-blue-600 dark:text-blue-400">{fmtPct(s.plannedPct)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 sm:block">
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
        </>
      )}
    </div>
  )
}
