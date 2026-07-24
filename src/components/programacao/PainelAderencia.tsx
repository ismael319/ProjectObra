import type { SegmentRow } from '@/lib/adherence'

interface Props {
  title: string
  rows: SegmentRow[]
}

export default function PainelAderencia({ title, rows }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Sem dados</p>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-2 text-xs">
              <span
                className="w-24 shrink-0 truncate text-gray-600 dark:text-gray-300"
                title={r.name}
              >
                {r.name}
              </span>
              <span className="w-6 shrink-0 text-right text-gray-400 dark:text-gray-500">
                {r.count}
              </span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 min-w-[40px]">
                <div
                  className="h-1.5 rounded-full bg-blue-600"
                  style={{ width: `${Math.round(r.pct * 100)}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right font-medium text-gray-700 dark:text-gray-200">
                {Math.round(r.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
