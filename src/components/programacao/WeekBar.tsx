import { ChevronLeft, ChevronRight, FileDown, FileUp, Lock, Unlock, Download, Eraser } from 'lucide-react'
import { formatShortDate, parseISODateStr } from '@/lib/iso-week'

interface Props {
  isoYear: number
  isoWeek: number
  startDate: string
  endDate: string
  status: 'rascunho' | 'consolidado'
  ppc: number
  aderencia: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onExportExcel: () => void
  onImportExcel: (file: File) => void
  onLock: () => void
  onUnlock: () => void
  onImportActivities: () => void
  onClearWeek: () => void
}

export default function WeekBar({
  isoYear,
  isoWeek,
  startDate,
  endDate,
  status,
  ppc,
  aderencia,
  onPrev,
  onNext,
  onToday,
  onExportExcel,
  onImportExcel,
  onLock,
  onUnlock,
  onImportActivities,
  onClearWeek,
}: Props) {
  const start = parseISODateStr(startDate)
  const end = parseISODateStr(endDate)
  const isoLabel = `${isoYear}-S${String(isoWeek).padStart(2, '0')}`
  const locked = status === 'consolidado'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          title="Semana anterior"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="px-2 text-sm font-medium tabular-nums text-gray-900 dark:text-white">
          {formatShortDate(start)} — {formatShortDate(end)}
          <span className="ml-2 text-gray-500 dark:text-gray-400">({isoLabel})</span>
        </div>
        <button
          onClick={onNext}
          title="Próxima semana"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <button
        onClick={onToday}
        className="px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        Semana atual
      </button>

      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${
          locked
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
        }`}
      >
        {locked ? <Lock size={11} /> : null}
        {locked ? 'Bloqueada' : 'Rascunho'}
      </span>

      <div className="ml-auto flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span>Aderência cronograma:</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {Math.round(ppc * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span>Aderência total:</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {Math.round(aderencia * 100)}%
          </span>
        </div>
      </div>

      <div className="relative group">
        <button className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Ações
        </button>
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-1 hidden group-hover:block">
          {locked ? (
            <button
              onClick={onUnlock}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
            >
              <Unlock size={14} className="text-green-600" />
              Desbloquear semana
            </button>
          ) : (
            <button
              onClick={onLock}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
            >
              <Lock size={14} className="text-red-600" />
              Bloquear semana
            </button>
          )}
          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
          <button
            onClick={onImportActivities}
            disabled={locked}
            title={locked ? 'Desbloqueie a semana para importar atividades' : undefined}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} className="text-purple-600" />
            Importar atividades
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
          <button
            onClick={onExportExcel}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
          >
            <FileDown size={14} className="text-blue-600" />
            Exportar Excel
          </button>
          <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition cursor-pointer">
            <FileUp size={14} className="text-orange-600" />
            Importar Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImportExcel(f)
                e.target.value = ''
              }}
            />
          </label>
          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
          <button
            onClick={onClearWeek}
            disabled={locked}
            title={locked ? 'Desbloqueie a semana para limpar' : undefined}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Eraser size={14} />
            Limpar semana
          </button>
        </div>
      </div>
    </div>
  )
}
