import { CheckCircle2, Circle, MinusCircle, PlusCircle, XCircle, Clock } from 'lucide-react'
import { parseISODateStr, WEEKDAY_LABELS, formatShortDate } from '@/lib/iso-week'
import { statusWeight, type ActivityLike } from '@/lib/adherence'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  date: string
  activities: ActivityLike[]
  onOpen: (date: string) => void
}

export default function CardDia({ date, activities, onOpen }: Props) {
  const d = parseISODateStr(date)
  const weekdayIdx = (d.getDay() - 5 + 7) % 7 // Sex=0, Sáb=1, ..., Qui=6
  const label = WEEKDAY_LABELS[weekdayIdx]
  const short = formatShortDate(d)

  const total = activities.length
  const concluidas = activities.filter((a) => a.status === 'concluida').length
  const parciais = activities.filter((a) => a.status === 'parcial').length
  const naoConc = activities.filter((a) => a.status === 'nao_concluida').length
  const pendentes = activities.filter((a) => a.status === 'pendente').length
  const extras = activities.filter((a) => a.is_extra).length
  const cronograma = activities.filter((a) => !!a.source).length

  // Mesma fórmula da Aderência do resto do app (computeIndicators/relatorio-visual):
  // extras fora do denominador, pendentes contam, parcial vale meio crédito.
  const planejadas = activities.filter((a) => !a.is_extra)
  const denom = planejadas.length
  const weighted = planejadas.reduce((s, a) => s + statusWeight(a.status, 0.5), 0)
  const aderenciaPct = denom > 0 ? Math.round((weighted / denom) * 100) : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(date)}
          className="group relative flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-left shadow-sm transition hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="mr-1 font-semibold text-gray-900 dark:text-white">{label}</span>
              {short}
            </span>
            <span className="text-right leading-none">
              <span className="block text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                {aderenciaPct != null ? `${aderenciaPct}%` : '—'}
              </span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Aderência
              </span>
            </span>
          </div>
          <div className="mt-4 text-center">
            <div className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">{total}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              atividades
            </div>
          </div>
          <ul className="mt-4 space-y-1 text-xs">
            <Row icon={<CheckCircle2 size={14} />} label="Concluídas" value={concluidas} tone="text-emerald-600" />
            <Row icon={<MinusCircle size={14} />} label="Parciais" value={parciais} tone="text-amber-600" />
            <Row icon={<XCircle size={14} />} label="Não conc." value={naoConc} tone="text-red-600" />
            <Row icon={<Circle size={14} />} label="Pendentes" value={pendentes} tone="text-gray-400 dark:text-gray-500" />
            <Row icon={<PlusCircle size={14} />} label="Extras" value={extras} tone="text-sky-600" />
            {cronograma > 0 && (
              <Row icon={<Clock size={14} />} label="Cronograma" value={cronograma} tone="text-purple-600" />
            )}
          </ul>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        Clique pra abrir o detalhe do dia. "Extras" são atividades adicionadas manualmente (fora do
        cronograma); "Cronograma" são as importadas de um cronograma carregado — os status (Concluída,
        Parcial, Não concluída, Pendente) alimentam o PPC e a Aderência da semana.
      </TooltipContent>
    </Tooltip>
  )
}

function Row({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <li className={`flex items-center justify-between ${tone}`}>
      <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
        <span className={tone}>{icon}</span>
        <span>{label}</span>
      </span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </li>
  )
}
