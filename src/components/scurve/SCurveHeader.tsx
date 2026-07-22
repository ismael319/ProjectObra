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
  scheduleInfo: Array<{
    id: string
    nome: string
    cor: string
    start: Date | null
    finish: Date | null
    blFinish: Date | null
  }>
  selectedBLInfo: {
    label: string
  } | undefined
  selectedBLTotal: number
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR') : '—'
}

export function SCurveHeader({ projectName, unit, overallPace, scheduleInfo, selectedBLInfo, selectedBLTotal }: SCurveHeaderProps) {

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Curva S</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Análise de Earned Value - {projectName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            {unit === 'HH' ? 'Trabalho' : 'Custo'}
          </span>
          {overallPace?.terminoLabel && (
            <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Término projetado {overallPace.terminoLabel}
            </span>
          )}
        </div>
        {selectedBLInfo && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
            <span className="text-blue-700 dark:text-blue-300 font-medium">{selectedBLInfo.label}</span>
            <span className="text-blue-500 dark:text-blue-400">|</span>
            <span className="text-blue-600 dark:text-blue-300 font-mono">{fmtK(selectedBLTotal, unit)}</span>
          </div>
        )}
      </div>

      {scheduleInfo.length > 0 && (
        <div className="flex flex-col gap-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-2">
          {scheduleInfo.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300 min-w-[140px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                {s.nome}
              </span>
              <span>
                <span className="font-medium text-gray-600 dark:text-gray-400">Início:</span> {fmtDate(s.start)}
              </span>
              <span>
                <span className="font-medium text-gray-600 dark:text-gray-400">Término:</span> {fmtDate(s.finish)}
              </span>
              <span>
                <span className="font-medium text-gray-600 dark:text-gray-400">Término LB:</span> {fmtDate(s.blFinish)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
