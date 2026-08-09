import type { ItemComClassificacao } from '@/lib/sienge/types'
import type { StatCard } from '@/lib/sienge/report-config'
import { CLASSIFICACAO_ACCENT } from '@/lib/sienge/classify'

interface Props {
  stats: StatCard[]
  itens: ItemComClassificacao[]
}

export default function SiengeStatsCards({ stats, itens }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => {
        const valor = stat.valor(itens)
        return (
          <div
            key={stat.label}
            className="relative min-w-0 bg-white dark:bg-gray-800 rounded-xl p-3 sm:p-4 border border-gray-100 dark:border-gray-700/80 shadow-sm overflow-hidden"
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px] opacity-80"
              style={{ backgroundColor: CLASSIFICACAO_ACCENT[stat.classe] }}
            />
            <p className="text-xs leading-tight text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-lg sm:text-2xl leading-tight font-bold text-gray-900 dark:text-white mt-1 truncate" title={valor}>{valor}</p>
          </div>
        )
      })}
    </div>
  )
}
