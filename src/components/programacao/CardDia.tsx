import { CheckCircle2, Circle, MinusCircle, PlusCircle, XCircle, Clock, Ban, CalendarX } from 'lucide-react'
import { parseISODateStr, WEEKDAY_LABELS, formatShortDate } from '@/lib/iso-week'
import { statusWeight, type ActivityLike, type WeekIndicators } from '@/lib/adherence'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  date: string
  activities: ActivityLike[]
  onOpen: (date: string) => void
  /** Peso da atividade parcial, de app_settings.partial_weight (ver getWeek).
   * Era 0.5 fixo aqui, então mudar a configuração fazia o card do dia divergir
   * dos indicadores da semana pros mesmos dados. */
  partialWeight?: number
  /** Taxa de acerto do dia contra o que foi comprometido PRA ele
   * (computeIndicatorsDia) — null quando a semana ainda está em montagem ou o
   * dia não tinha nada comprometido. Diferente da "Aderência" abaixo, que olha o
   * quadro como está agora e por isso sobe sozinha quando uma pendência é
   * arrastada pra outro dia. */
  acertoDia?: WeekIndicators | null
}

export default function CardDia({ date, activities, onOpen, partialWeight = 0.5, acertoDia }: Props) {
  const d = parseISODateStr(date)
  const weekdayIdx = (d.getDay() - 5 + 7) % 7 // Sex=0, Sáb=1, ..., Qui=6
  const label = WEEKDAY_LABELS[weekdayIdx]
  const short = formatShortDate(d)

  // Inativas (em análise, ver "Inativar" no detalhe do dia) contam à parte, não
  // dentro do status que tinham antes de serem colocadas de lado — senão inflam
  // "Pendentes" (destino mais comum de quem inativa algo ainda não resolvido) sem
  // deixar claro quantas são só pendência de verdade.
  // "Fora desta semana" sai junto com as inativas: computeIndicators e
  // computeSegment já as excluem, então contá-las aqui fazia o card do dia
  // divergir dos indicadores da semana pros mesmos dados.
  const noPlano = activities.filter((a) => !a.foraDoPlano)
  const forasDoPlano = activities.length - noPlano.length
  // O número grande do card conta o que está no plano do dia — uma marcada "fora
  // desta semana" continua listada no detalhe, mas não é trabalho previsto.
  const total = noPlano.length
  const ativas = noPlano.filter((a) => !a.inativa)
  const inativas = noPlano.length - ativas.length
  const concluidas = ativas.filter((a) => a.status === 'concluida').length
  const parciais = ativas.filter((a) => a.status === 'parcial').length
  const naoConc = ativas.filter((a) => a.status === 'nao_concluida').length
  // Extra com status ainda 'pendente' já foi executada — é isso que "Extra" comunica
  // (trabalho fora do plano, mas que aconteceu); o único efeito do flag é sair da
  // conta de PPC/Aderência, não deixa de ter sido feita. Sem excluir aqui, uma extra
  // sem status marcado contava em dobro: em "Extras" E em "Pendentes".
  const pendentes = ativas.filter((a) => a.status === 'pendente' && !a.is_extra).length
  const extras = ativas.filter((a) => a.is_extra).length
  const cronograma = ativas.filter((a) => !!a.source).length

  // Mesma fórmula da Aderência do resto do app (computeIndicators/relatorio-visual):
  // inativas e extras fora do denominador, pendentes contam, parcial vale meio crédito.
  const planejadas = ativas.filter((a) => !a.is_extra)
  const denom = planejadas.length
  const weighted = planejadas.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0)
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
            <span className="flex items-start gap-3">
              {acertoDia && (
                <span className="text-right leading-none">
                  <span className="block text-sm font-bold tabular-nums text-blue-700 dark:text-blue-400">
                    {Math.round(acertoDia.ppc * 100)}%
                  </span>
                  <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-blue-400 dark:text-blue-500">
                    Acerto
                  </span>
                </span>
              )}
              <span className="text-right leading-none">
                <span className="block text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                  {aderenciaPct != null ? `${aderenciaPct}%` : '—'}
                </span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Aderência
                </span>
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
            {inativas > 0 && (
              <Row icon={<Ban size={14} />} label="Inativas" value={inativas} tone="text-gray-500 dark:text-gray-400" />
            )}
            {forasDoPlano > 0 && (
              <Row icon={<CalendarX size={14} />} label="Fora da semana" value={forasDoPlano} tone="text-amber-600 dark:text-amber-400" />
            )}
          </ul>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {acertoDia && (
          <p className="mb-1.5">
            <span className="font-semibold text-blue-400">Acerto {Math.round(acertoDia.ppc * 100)}%</span> —{' '}
            {acertoDia.concluidas} de {acertoDia.total - acertoDia.extras} atividade(s) comprometidas
            PRA este dia foram concluídas. Esse número não muda quando uma pendência é arrastada pra
            outro dia: o compromisso do dia foi congelado quando a semana foi comprometida.
          </p>
        )}
        Clique pra abrir o detalhe do dia. "Extras" são atividades marcadas como não planejadas pro
        dia (mesmo vindas do cronograma); "Cronograma" são as importadas de um cronograma carregado.
        "Inativas" estão de lado pra análise e não entram nos outros números nem no PPC/Aderência —
        os demais status (Concluída, Parcial, Não concluída, Pendente) alimentam o PPC e a Aderência
        da semana. A "Aderência" reflete o quadro como está AGORA.
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
