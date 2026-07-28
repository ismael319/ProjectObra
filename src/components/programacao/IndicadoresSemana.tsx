import type { WeekIndicators } from '@/lib/adherence'

interface Props {
  ind: WeekIndicators
}

export default function IndicadoresSemana({ ind }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
          Indicadores da Semana
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Base: {ind.total - ind.extras} atividade(s) · {ind.extras} extra(s)
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          title="PPC"
          value={`${Math.round(ind.ppc * 100)}%`}
          bg="bg-slate-50 dark:bg-slate-800"
          border="border-gray-100 dark:border-gray-700"
          titleColor="text-gray-500 dark:text-gray-400"
          valueColor="text-gray-900 dark:text-white"
        />
        <Card
          title="Aderência Semanal"
          value={`${Math.round(ind.aderencia * 100)}%`}
          bg="bg-slate-50 dark:bg-slate-800"
          border="border-gray-100 dark:border-gray-700"
          titleColor="text-gray-500 dark:text-gray-400"
          valueColor="text-gray-900 dark:text-white"
        />
        <Card
          title="Concluídas"
          value={String(ind.concluidas)}
          bg="bg-green-50 dark:bg-green-900/20"
          border="border-green-100 dark:border-green-900/40"
          titleColor="text-green-700 dark:text-green-400"
          valueColor="text-green-700 dark:text-green-400"
        />
        <Card
          title="Parciais"
          value={String(ind.parciais)}
          bg="bg-amber-50 dark:bg-amber-900/20"
          border="border-amber-100 dark:border-amber-900/40"
          titleColor="text-amber-700 dark:text-amber-400"
          valueColor="text-amber-700 dark:text-amber-400"
        />
        <Card
          title="Não Concluídas"
          value={String(ind.naoConcluidas)}
          bg="bg-red-50 dark:bg-red-900/20"
          border="border-red-100 dark:border-red-900/40"
          titleColor="text-red-700 dark:text-red-400"
          valueColor="text-red-700 dark:text-red-400"
        />
      </div>
    </div>
  )
}

function Card({
  title,
  value,
  bg,
  border,
  titleColor,
  valueColor,
}: {
  title: string
  value: string
  bg: string
  border: string
  titleColor: string
  valueColor: string
}) {
  return (
    <div className={`${bg} rounded-xl p-4 border ${border}`}>
      <p className={`text-xs font-semibold ${titleColor} uppercase`}>{title}</p>
      <p className={`text-2xl font-bold ${valueColor} mt-1`}>{value}</p>
    </div>
  )
}
