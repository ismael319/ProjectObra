import type { SegmentRow } from '@/lib/adherence'

interface Props {
  title: string
  rows: SegmentRow[]
}

// Mesmo dado de PainelAderencia (computeSegment), mas em tabela — com a
// Aderência do Cronograma ao lado da Ajustada, pra dar pra ver por engenheiro
// se a reprogramação foi coerente, não só o número já "limpo". Já vem
// ordenada do maior pro menor (computeSegment ordena por pct).
export default function TabelaAderenciaEngenheiro({ title, rows }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Sem dados</p>
      ) : (
        <div className="max-h-64 overflow-y-auto pr-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 dark:text-gray-500">
                <th className="text-left font-medium pb-2">Engenheiro</th>
                <th className="text-right font-medium pb-2">Qtd</th>
                <th className="text-right font-medium pb-2">Cronograma</th>
                <th className="text-right font-medium pb-2">Ajustada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-gray-100 dark:border-gray-700">
                  <td
                    className="py-1.5 pr-2 max-w-[9rem] truncate text-gray-600 dark:text-gray-300"
                    title={r.name}
                  >
                    {r.name}
                  </td>
                  <td className="py-1.5 text-right text-gray-400 dark:text-gray-500">{r.count}</td>
                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-300">
                    {Math.round(r.pctCronograma * 100)}%
                  </td>
                  <td className="py-1.5 text-right font-medium text-gray-900 dark:text-white">
                    {Math.round(r.pct * 100)}%
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
