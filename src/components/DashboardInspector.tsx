import { SlidersHorizontal } from 'lucide-react'
import type { DashboardAspecto, InspetorValores } from '@/lib/dashboard-widgets-db'

const ASPECTOS: DashboardAspecto[] = ['16:9', '4:3', '1:1']

export default function DashboardInspector({
  inspetor,
  onChange,
}: {
  inspetor: InspetorValores
  onChange: (proximo: InspetorValores) => void
}) {
  return (
    <div className="w-full shrink-0 space-y-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900 lg:w-56">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <SlidersHorizontal size={13} /> Inspector
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Aspecto</label>
        <div className="flex gap-1">
          {ASPECTOS.map((a) => (
            <button
              key={a}
              onClick={() => onChange({ ...inspetor, aspecto: a })}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                inspetor.aspecto === a
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">Proporção usada na exportação A4/PDF.</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Fonte</label>
          <span className="text-xs text-gray-400 dark:text-gray-500">{inspetor.fonte} px</span>
        </div>
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={inspetor.fonte}
          onChange={(e) => onChange({ ...inspetor, fonte: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tema</label>
        <div className="flex gap-1">
          {(['claro', 'escuro'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onChange({ ...inspetor, tema: t })}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition ${
                inspetor.tema === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">Vale pro fundo do canvas e pros cards de foto — os widgets de dado seguem o tema do app.</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Grade</label>
          <span className="text-xs text-gray-400 dark:text-gray-500">{inspetor.grade} px</span>
        </div>
        <input
          type="range"
          min={16}
          max={48}
          step={4}
          value={inspetor.grade}
          onChange={(e) => onChange({ ...inspetor, grade: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </div>
    </div>
  )
}
