import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, MinusCircle, XCircle, Trash2, Plus, X, Layers, Eraser, Download, AlertTriangle, ListChecks, Image, Ban, RotateCcw, CheckCheck, CalendarClock, History, CalendarX, CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'
import { computeDelayDays, type ActivityLike, type ActivityStatus, type SubEtapa, type SubEtapaStatus, type WeekIndicators } from '@/lib/adherence'
import { parseISODateStr, formatShortDate, WEEKDAY_LABELS } from '@/lib/iso-week'
import { getAreaNivel2 } from '@/lib/week-activities'
import { addSubEtapa, setSubEtapaStatus, deleteSubEtapa, listSubEtapas, statusAoSincronizarSubetapas, type WeekStatus } from '@/lib/programacao-db'
import type { WBSActivity } from '@/lib/xml-parser'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const STATUS_HINTS: Record<string, string> = {
  'Concluída': 'Marca a atividade como 100% executada neste dia — conta a favor do PPC da semana.',
  'Parcial': 'Marca a atividade como parcialmente executada neste dia — soma parcial pro PPC ponderado.',
  'Não concluída': 'Marca que a atividade estava prevista mas não foi executada neste dia — conta contra o PPC.',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  date: string | null
  organizacaoId: string
  activities: ActivityLike[]
  /** As 7 datas ISO da semana carregada — usado pelo "Reprogramar" (só oferece dias
   * dentro dessa semana) e pelo "Adicionar não realizadas". */
  weekDays: string[]
  /** TODAS as atividades da semana (não só as do dia aberto) — usado pra achar dias
   * futuros da mesma tarefa (Finalizar 100%), dias já ocupados por uma tarefa
   * (Reprogramar) e pendências de dias anteriores (Adicionar não realizadas). */
  todasAtividadesDaSemana: ActivityLike[]
  weekConsolidated: boolean
  /** Estado do ciclo da semana — decide o que pode ser editado (ver WeekStatus).
   * `weekConsolidated` continua existindo porque várias regras só olham "fechada
   * ou não"; este campo é o que distingue montagem de comprometida. */
  weekStatus: WeekStatus
  onSetStatus: (id: string, status: ActivityStatus, observation: string | null) => Promise<void>
  /** Inativa/reativa um item pra análise (ex.: não ficou claro por que não foi
   * executado) — sai do PPC/aderência ATUAL enquanto inativo, mas continua no
   * denominador do plano comprometido. É o caminho pro imprevisto no meio da
   * semana; pra tirar do plano ANTES dele começar, use onSetForaDoPlano. */
  onSetInativa: (id: string, inativa: boolean, motivo: string | null) => Promise<void>
  /** Marca/desmarca "fora desta semana": a atividade veio do cronograma por data
   * (uma tarefa em andamento que atravessa a semana), mas já se sabe que estará
   * parada. Fica visível e riscada no quadro, fora do baseline e de qualquer
   * denominador. Só disponível enquanto a semana está em montagem. */
  onSetForaDoPlano: (id: string, fora: boolean, motivo: string | null) => Promise<void>
  /** Marca/desmarca a atividade como "Extra" — não estava planejada pro dia, mas foi
   * (ou vai ser) executada mesmo assim. É só um status de exibição: não mexe no
   * vínculo com o cronograma de origem (uma atividade real pode ser extra e
   * continuar agrupada no cronograma dela — ver addActivitiesBulk). */
  onSetExtra: (id: string, isExtra: boolean) => Promise<void>
  /** Marca concluída e remove a atividade dos dias futuros da semana que ainda
   * tinham a mesma tarefa programada. Funciona mesmo com a semana bloqueada. */
  onFinalizar: (activity: ActivityLike) => Promise<void>
  /** Move a atividade pra outro dia da semana carregada. Funciona mesmo com a semana
   * bloqueada (mas só dentro do intervalo da semana). */
  onReprogramar: (activityId: string, novaData: string) => Promise<void>
  /** Traz pra `date` uma ou mais atividades não realizadas de dias anteriores desta
   * semana (sai do dia original). Funciona mesmo com a semana bloqueada. */
  onAdicionarNaoRealizadas: (activityIds: string[], data: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Sub-etapas recém-lidas do banco de UMA atividade. Deixa a tela refletir a
   * mudança sem recarregar a semana inteira — ver sincronizarStatus. */
  onSubetapasAtualizadas: (activityId: string, subetapas: SubEtapa[]) => void
  onAddExtra: (payload: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => Promise<void>
  onClearDay: () => void
  onAddFromCronograma: () => void
  /** Nomes já cadastrados em "Engenheiros por Área" (sem repetição) — sugestão ao
   * preencher o campo Engenheiro do formulário de atividade avulsa. */
  engenheirosDisponiveis: string[]
  /** Áreas (nível 2 da EDT) que existem nos cronogramas ativos do projeto —
   * sugestão ao preencher o campo Área do formulário de atividade avulsa. */
  areasDisponiveis: string[]
  /** Abre o gerador de imagem (Fechamento/Programação) pro dia aberto — funciona
   * mesmo com a semana bloqueada, é só um reflexo do que já está gravado. */
  onExportarImagem: () => void
  /** Resolve a atividade importada pra sua WBSActivity de origem no cronograma (pra
   * mostrar atraso, % avanço atual e datas de início/término) — null quando a
   * atividade é extra manual ou foi importada antes desse vínculo existir. */
  getActivityDetail: (activity: ActivityLike) => WBSActivity | null
  /** Dia comprometido de cada atividade (activity_id → data), de
   * diaComprometidoPorAtividade. Vazio enquanto a semana está em montagem. */
  diaComprometido: Map<string, string>
  /** Taxa de acerto deste dia contra o que foi comprometido PRA ele — null
   * quando não há plano comprometido. */
  acertoDia: WeekIndicators | null
}

const EXTRAS_GROUP = '__extras__'

// Cor do card inteiro conforme o status vira realidade — status tem prioridade sobre
// "extra" (uma extra marcada como concluída fica verde, não azul); só quando ainda
// está pendente é que "extra" ganha uma cor própria (azul) pra se distinguir de uma
// pendente comum (cinza neutro).
function cardColorClasses(activity: ActivityLike): string {
  // "Fora desta semana" tem prioridade sobre tudo: o item continua visível pra
  // quem confere o quadro contra o cronograma, mas não participa de nenhuma conta.
  if (activity.foraDoPlano) {
    return 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 opacity-60'
  }
  if (activity.inativa) {
    return 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800/60 opacity-70'
  }
  if (activity.status === 'concluida') {
    return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/15'
  }
  if (activity.status === 'parcial') {
    return 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/15'
  }
  if (activity.status === 'nao_concluida') {
    return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/15'
  }
  if (activity.is_extra) {
    return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/15'
  }
  return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750'
}

const SEM_AREA = 'Sem área'

// Sub-agrupa as atividades de um cronograma por Área (nível 2 da EDT) — sem isso,
// um dia com muitas atividades (várias dezenas) fica uma lista única fora de
// ordem, misturando áreas bem diferentes da planta uma atrás da outra.
function groupByArea(activities: ActivityLike[]): [string, ActivityLike[]][] {
  const map = new Map<string, ActivityLike[]>()
  for (const a of activities) {
    const key = a.areaPath ? getAreaNivel2(a.areaPath) || SEM_AREA : SEM_AREA
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }
  // Dentro de cada área, ordena por nível 3 da EDT (areaPath completo) + nome — junta
  // atividades da mesma etapa (ex.: "COBERTURA") uma perto da outra, em vez de ordem
  // de importação/id.
  for (const acts of map.values()) {
    acts.sort((x, y) => `${x.areaPath ?? ''}${x.name}`.localeCompare(`${y.areaPath ?? ''}${y.name}`, 'pt-BR'))
  }

  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === SEM_AREA) return 1
    if (b === SEM_AREA) return -1
    return a.localeCompare(b, 'pt-BR')
  })
}

function statusCounts(activities: ActivityLike[]) {
  return {
    concluida: activities.filter((a) => a.status === 'concluida').length,
    parcial: activities.filter((a) => a.status === 'parcial').length,
    nao_concluida: activities.filter((a) => a.status === 'nao_concluida').length,
    pendente: activities.filter((a) => a.status === 'pendente').length,
  }
}

export default function ModalDetalheDia({
  open,
  onOpenChange,
  date,
  organizacaoId,
  activities,
  weekDays,
  todasAtividadesDaSemana,
  weekConsolidated,
  weekStatus,
  onSetStatus,
  onSetInativa,
  onSetForaDoPlano,
  onSetExtra,
  onFinalizar,
  onReprogramar,
  onAdicionarNaoRealizadas,
  onDelete,
  onSubetapasAtualizadas,
  onAddExtra,
  onClearDay,
  onAddFromCronograma,
  engenheirosDisponiveis,
  areasDisponiveis,
  onExportarImagem,
  getActivityDetail,
  diaComprometido,
  acertoDia,
}: Props) {
  const [showExtra, setShowExtra] = useState(false)
  const [showNaoRealizadas, setShowNaoRealizadas] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // Chave "<cronograma>::<área>" — um dia com 76 atividades em 3 grupos vira uma
  // rolagem longa; colapsar só o cronograma inteiro era grosso demais.
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const map = new Map<string, ActivityLike[]>()
    for (const a of activities) {
      const key = a.source || EXTRAS_GROUP
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    // Cronogramas em ordem alfabética primeiro, "Atividades Extras" sempre por último.
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === EXTRAS_GROUP) return 1
      if (b === EXTRAS_GROUP) return -1
      return a.localeCompare(b)
    })
  }, [activities])

  // Uma tarefa por dia anterior (não a lista bruta) — se a mesma tarefa (taskUid)
  // ficou pendente em vários dias antes de hoje, só a ocorrência mais recente entra
  // como candidata; trazer mais de uma pra hoje duplicaria a linha do mesmo taskUid.
  // Também não oferece uma tarefa que já tem linha própria hoje.
  //
  // Passou a cobrir a semana INTEIRA, não só os dias anteriores: uma tarefa que
  // entrou no meio da semana (importada depois) e caiu num dia à frente também
  // precisa poder ser puxada pro dia que está sendo apontado. Dias posteriores
  // vêm depois dos atrasados na ordenação, porque atrasado é o caso urgente.
  const naoRealizadasAnteriores = useMemo(() => {
    if (!date) return []
    const porTask = new Map<string, ActivityLike>()
    for (const a of todasAtividadesDaSemana) {
      if (a.planned_date === date || a.status === 'concluida' || a.inativa || a.foraDoPlano) continue
      const key = a.taskUid ?? a.id
      const atual = porTask.get(key)
      // Entre várias ocorrências da mesma tarefa, fica a mais recente ANTES do
      // dia aberto (a pendência que interessa); se só houver posteriores, a mais
      // próxima. Trazer duas duplicaria a linha do mesmo taskUid.
      if (!atual) {
        porTask.set(key, a)
        continue
      }
      const aAtrasada = a.planned_date < date
      const atualAtrasada = atual.planned_date < date
      if (aAtrasada && !atualAtrasada) porTask.set(key, a)
      else if (aAtrasada === atualAtrasada) {
        const melhor = aAtrasada ? a.planned_date > atual.planned_date : a.planned_date < atual.planned_date
        if (melhor) porTask.set(key, a)
      }
    }
    const jaHoje = new Set(activities.filter((a) => a.taskUid).map((a) => a.taskUid))
    return Array.from(porTask.values())
      .filter((a) => !(a.taskUid && jaHoje.has(a.taskUid)))
      .sort((x, y) => {
        const xAtras = x.planned_date < date ? 0 : 1
        const yAtras = y.planned_date < date ? 0 : 1
        if (xAtras !== yAtras) return xAtras - yAtras
        return x.name.localeCompare(y.name, 'pt-BR')
      })
  }, [todasAtividadesDaSemana, activities, date])

  const qtdAtrasadas = useMemo(
    () => (date ? naoRealizadasAnteriores.filter((a) => a.planned_date < date).length : 0),
    [naoRealizadasAnteriores, date],
  )

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleArea = (key: string) => {
    setCollapsedAreas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div className="relative mx-2 flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-800 sm:mx-4 sm:max-h-[85vh]">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Atividades do dia {date ? formatShortDate(parseISODateStr(date)) : ''}
            </h2>
            {activities.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {activities.length} {activities.length === 1 ? 'atividade' : 'atividades'} · {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
                {acertoDia && (
                  <>
                    {' · '}
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      Acerto do dia {Math.round(acertoDia.ppc * 100)}%
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {' '}({acertoDia.concluidas}/{acertoDia.total - acertoDia.extras} comprometidas pra hoje)
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:shrink-0">
            {activities.length > 0 && (
              <button
                onClick={onExportarImagem}
                title="Exportar o dia (Fechamento/Programação) em imagem, PDF ou mensagem de texto"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition"
              >
                <Image size={13} /> Exportar
              </button>
            )}
            {activities.length > 0 && (
              <button
                onClick={onClearDay}
                disabled={weekConsolidated}
                title={weekConsolidated ? 'Desbloqueie a semana para limpar o dia' : 'Remover todas as atividades deste dia'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Eraser size={13} /> Limpar dia
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 sm:px-6">
          {activities.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma atividade programada para este dia.
            </p>
          )}
          {groups.map(([groupKey, groupActivities]) => {
            const isExtrasGroup = groupKey === EXTRAS_GROUP
            const isCollapsed = collapsedGroups.has(groupKey)
            const counts = statusCounts(groupActivities)
            return (
              <div key={groupKey} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left transition ${
                    isExtrasGroup
                      ? 'bg-sky-50/60 dark:bg-sky-900/10 hover:bg-sky-50 dark:hover:bg-sky-900/20'
                      : 'bg-purple-50/60 dark:bg-purple-900/10 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                  }`}
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                  <Layers size={13} className={isExtrasGroup ? 'text-sky-500' : 'text-purple-500'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                    {isExtrasGroup ? 'Atividades Extras' : groupKey}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {groupActivities.length}
                  </span>
                  <div className="flex basis-full items-center justify-end gap-2 text-xs sm:ml-auto sm:basis-auto sm:shrink-0 sm:text-[11px]">
                    {counts.concluida > 0 && <span className="text-emerald-600 dark:text-emerald-400">{counts.concluida} concl.</span>}
                    {counts.parcial > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.parcial} parc.</span>}
                    {counts.nao_concluida > 0 && <span className="text-red-600 dark:text-red-400">{counts.nao_concluida} não concl.</span>}
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="p-2 space-y-3 bg-white dark:bg-gray-800">
                    {(() => {
                      const areaGroups = groupByArea(groupActivities)
                      // Só mostra o subtítulo de Área quando há mais de uma no cronograma —
                      // com uma só (ou nenhuma, caso das extras) o rótulo seria redundante.
                      const mostrarAreas = areaGroups.length > 1
                      return areaGroups.map(([areaNome, areaActivities]) => {
                        const areaKey = `${groupKey}::${areaNome}`
                        // Sem subtítulo de área não há o que colapsar — a lista já
                        // é o conteúdo direto do grupo.
                        const areaCollapsed = mostrarAreas && collapsedAreas.has(areaKey)
                        const areaCounts = statusCounts(areaActivities)
                        return (
                        <div key={areaNome} className="space-y-2">
                          {mostrarAreas && (
                            <button
                              onClick={() => toggleArea(areaKey)}
                              className="w-full flex items-center gap-1.5 px-1 py-0.5 rounded text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                            >
                              {areaCollapsed
                                ? <ChevronRight size={12} className="text-gray-400 shrink-0" />
                                : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">
                                {areaNome} <span className="font-normal normal-case">· {areaActivities.length}</span>
                              </span>
                              <span className="ml-auto flex items-center gap-2 text-[10px] shrink-0">
                                {areaCounts.concluida > 0 && <span className="text-emerald-600 dark:text-emerald-400">{areaCounts.concluida} concl.</span>}
                                {areaCounts.parcial > 0 && <span className="text-amber-600 dark:text-amber-400">{areaCounts.parcial} parc.</span>}
                                {areaCounts.nao_concluida > 0 && <span className="text-red-600 dark:text-red-400">{areaCounts.nao_concluida} não concl.</span>}
                              </span>
                            </button>
                          )}
                          {!areaCollapsed && areaActivities.map((a) => (
                            <ActivityRow
                              key={a.id}
                              activity={a}
                              organizacaoId={organizacaoId}
                              weekDays={weekDays}
                              todasAtividadesDaSemana={todasAtividadesDaSemana}
                              weekConsolidated={weekConsolidated}
                              weekStatus={weekStatus}
                              onSetStatus={onSetStatus}
                              onSetInativa={onSetInativa}
                              onSetForaDoPlano={onSetForaDoPlano}
                              onSetExtra={onSetExtra}
                              onFinalizar={onFinalizar}
                              onReprogramar={onReprogramar}
                              onDelete={onDelete}
                              onSubetapasAtualizadas={onSubetapasAtualizadas}
                              detail={getActivityDetail(a)}
                              diaComprometido={diaComprometido.get(a.id) ?? null}
                            />
                          ))}
                        </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {showExtra && date ? (
            <ExtraForm
              date={date}
              engenheirosDisponiveis={engenheirosDisponiveis}
              areasDisponiveis={areasDisponiveis}
              onCancel={() => setShowExtra(false)}
              onSubmit={async (p) => {
                await onAddExtra(p)
                setShowExtra(false)
              }}
            />
          ) : showNaoRealizadas && date ? (
            <NaoRealizadasForm
              candidatas={naoRealizadasAnteriores}
              dia={date}
              diaComprometido={diaComprometido}
              onCancel={() => setShowNaoRealizadas(false)}
              onSubmit={async (ids) => {
                await onAdicionarNaoRealizadas(ids, date)
                setShowNaoRealizadas(false)
              }}
            />
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                onClick={() => setShowExtra(true)}
                disabled={!date}
              >
                <Plus size={16} /> Adicionar atividade avulsa
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onAddFromCronograma}
                disabled={!date}
                title="Buscar tarefas do cronograma pra este dia (ex.: um domingo com trabalho excepcional). Funciona mesmo com a semana bloqueada."
              >
                <Download size={16} /> Adicionar do cronograma
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setShowNaoRealizadas(true)}
                disabled={!date || naoRealizadasAnteriores.length === 0}
                title="Traz pra este dia atividades não concluídas em outros dias desta semana — atrasadas de dias anteriores ou programadas pra dias à frente. O acerto do dia de origem continua cobrando cada uma delas."
              >
                <History size={16} /> De outros dias{' '}
                {naoRealizadasAnteriores.length > 0
                  ? `(${qtdAtrasadas > 0 ? `${qtdAtrasadas} atras.` : ''}${
                      qtdAtrasadas > 0 && naoRealizadasAnteriores.length > qtdAtrasadas ? ' + ' : ''
                    }${
                      naoRealizadasAnteriores.length > qtdAtrasadas
                        ? `${naoRealizadasAnteriores.length - qtdAtrasadas} adiante`
                        : ''
                    })`
                  : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityRow({
  activity,
  organizacaoId,
  weekDays,
  todasAtividadesDaSemana,
  weekConsolidated,
  weekStatus,
  onSetStatus,
  onSetInativa,
  onSetForaDoPlano,
  onSetExtra,
  onFinalizar,
  onReprogramar,
  onDelete,
  onSubetapasAtualizadas,
  detail,
  diaComprometido,
}: {
  activity: ActivityLike
  organizacaoId: string
  weekDays: Props['weekDays']
  todasAtividadesDaSemana: Props['todasAtividadesDaSemana']
  weekConsolidated: boolean
  weekStatus: WeekStatus
  onSetStatus: Props['onSetStatus']
  onSetInativa: Props['onSetInativa']
  onSetForaDoPlano: Props['onSetForaDoPlano']
  onSetExtra: Props['onSetExtra']
  onFinalizar: Props['onFinalizar']
  onReprogramar: Props['onReprogramar']
  onDelete: Props['onDelete']
  onSubetapasAtualizadas: Props['onSubetapasAtualizadas']
  detail: WBSActivity | null
  /** Dia pro qual esta atividade foi comprometida no início da semana. Diferente
   * do dia aberto = ela foi arrastada pra cá depois. null = não estava no plano
   * comprometido (entrou no meio da semana, ou a semana ainda está em montagem). */
  diaComprometido: string | null
}) {
  const [obs, setObs] = useState(activity.observation ?? '')
  const [showSubetapas, setShowSubetapas] = useState(false)
  const [novaSubetapa, setNovaSubetapa] = useState('')
  const [savingSubetapa, setSavingSubetapa] = useState(false)
  const [showInativarForm, setShowInativarForm] = useState(false)
  const [motivoInativar, setMotivoInativar] = useState('')
  const [savingInativa, setSavingInativa] = useState(false)
  const [showReprogramar, setShowReprogramar] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [savingExtra, setSavingExtra] = useState(false)
  const [showForaForm, setShowForaForm] = useState(false)
  const [motivoFora, setMotivoFora] = useState('')
  const [savingFora, setSavingFora] = useState(false)

  async function handleToggleExtra() {
    setSavingExtra(true)
    try {
      await onSetExtra(activity.id, !activity.is_extra)
    } finally {
      setSavingExtra(false)
    }
  }

  async function handleMarcarFora() {
    setSavingFora(true)
    try {
      await onSetForaDoPlano(activity.id, true, motivoFora.trim() || null)
      setShowForaForm(false)
      setMotivoFora('')
    } finally {
      setSavingFora(false)
    }
  }

  async function handleTrazerParaPlano() {
    setSavingFora(true)
    try {
      await onSetForaDoPlano(activity.id, false, null)
    } finally {
      setSavingFora(false)
    }
  }

  const canDelete = !weekConsolidated || activity.is_extra
  // "Fora desta semana" é decisão de montagem: depois de comprometer, o conjunto
  // já foi assumido e o caminho é inativar (que deixa rastro na análise).
  const podeMexerNoPlano = weekStatus === 'rascunho'
  const delayDays = detail ? computeDelayDays(detail) : 0
  const subetapas = activity.subetapas ?? []
  const temSubetapas = subetapas.length > 0
  // Semana fechada trava o apontamento. Os três botões de status olhavam só
  // `temSubetapas` e deixavam editar status em semana consolidada, contrariando o
  // que o próprio tooltip do WeekBar promete (agora o banco também recusa, ver
  // exigirEscritaPermitida — isto evita oferecer o clique que vai falhar).
  const statusTravado = temSubetapas || weekConsolidated
  const dicaStatusTravado = weekConsolidated
    ? ' — semana fechada, reabra pra editar os status.'
    : temSubetapas
      ? ' — calculado a partir das sub-etapas, não dá pra marcar manualmente.'
      : ' — clique de novo pra desmarcar (volta pra pendente), caso tenha clicado errado.'
  // Dias em que essa mesma tarefa (taskUid) já tem uma linha própria — pra não
  // oferecer reprogramar pra um dia que geraria uma segunda linha da mesma tarefa.
  const diasOcupadosPorTask = useMemo(() => {
    if (!activity.taskUid) return new Set<string>()
    return new Set(todasAtividadesDaSemana.filter((a) => a.taskUid === activity.taskUid).map((a) => a.planned_date))
  }, [todasAtividadesDaSemana, activity.taskUid])

  async function handleInativar() {
    const motivo = motivoInativar.trim() || null
    setSavingInativa(true)
    try {
      await onSetInativa(activity.id, true, motivo)
      setShowInativarForm(false)
      setMotivoInativar('')
    } finally {
      setSavingInativa(false)
    }
  }

  async function handleReativar() {
    setSavingInativa(true)
    try {
      await onSetInativa(activity.id, false, null)
    } finally {
      setSavingInativa(false)
    }
  }

  async function handleFinalizar() {
    setFinalizando(true)
    try {
      await onFinalizar(activity)
    } finally {
      setFinalizando(false)
    }
  }

  async function handleReprogramarPara(novaData: string) {
    await onReprogramar(activity.id, novaData)
    setShowReprogramar(false)
  }

  // Sub-etapas concluídas/não determinam o status da atividade automaticamente —
  // sincroniza no banco (e via onSetStatus, o fetchData(false) do pai já traz a
  // lista de sub-etapas atualizada de volta). Quando a lista fica vazia (excluiu a
  // última), computeStatusFromSubetapas volta null e não há status pra sincronizar —
  // mas ainda assim precisa atualizar a lista, senão a sub-etapa excluída continua
  // aparecendo na tela até o modal ser reaberto.
  //
  // Relê do banco em vez de calcular sobre `activity.subetapas`: aquela prop só
  // muda quando o fetchData(false) do pai termina, e duas marcações seguidas
  // chegavam aqui com a lista da marcação ANTERIOR. O cálculo então via uma
  // sub-etapa ainda "pendente", devolvia null, e a atividade mãe não era
  // atualizada — de forma intermitente, porque bastava o refetch anterior ter
  // chegado a tempo pra dar certo.
  async function sincronizarStatus() {
    const lista = await listSubEtapas(organizacaoId, activity.id)
    // Propaga a lista nova SEMPRE, mesmo quando não há status a gravar: são
    // esses dados que desenham os checkboxes aqui, e quem os trazia de volta era
    // o recarregamento da semana inteira, que saiu de cena por custo de tráfego
    // (ver atualizarAtividadeLocal em DailyProgramming).
    onSubetapasAtualizadas(activity.id, lista)
    const status = statusAoSincronizarSubetapas(lista, activity.status)
    if (status) await onSetStatus(activity.id, status, obs || null)
  }

  async function handleAddSubetapa() {
    const nome = novaSubetapa.trim()
    if (!nome) return
    setSavingSubetapa(true)
    try {
      await addSubEtapa(organizacaoId, activity.id, nome)
      setNovaSubetapa('')
      await sincronizarStatus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar sub-etapa')
    } finally {
      setSavingSubetapa(false)
    }
  }

  // Clicar de novo no mesmo status desmarca (volta pra "pendente" — aguardando),
  // igual ao padrão dos 3 botões de status da atividade.
  async function handleSetSubetapaStatus(sub: SubEtapa, status: SubEtapaStatus) {
    const novoStatus = sub.status === status ? 'pendente' : status
    setSavingSubetapa(true)
    try {
      await setSubEtapaStatus(organizacaoId, sub.id, novoStatus)
      await sincronizarStatus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao marcar sub-etapa')
    } finally {
      setSavingSubetapa(false)
    }
  }

  async function handleDeleteSubetapa(sub: SubEtapa) {
    setSavingSubetapa(true)
    try {
      await deleteSubEtapa(organizacaoId, sub.id)
      await sincronizarStatus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover sub-etapa')
    } finally {
      setSavingSubetapa(false)
    }
  }

  return (
    <div className={`rounded-md border p-3 transition-colors ${cardColorClasses(activity)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate font-medium text-gray-900 dark:text-white">{activity.name}</span>
            {activity.is_extra && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded">
                Extra
              </span>
            )}
            {activity.inativa && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                <Ban size={10} /> Inativa
              </span>
            )}
            {activity.foraDoPlano && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                <CalendarX size={10} /> Fora desta semana
              </span>
            )}
            {/* Arrastada de outro dia: continua sendo cobrada no dia em que foi
                comprometida (ver computeIndicatorsDia) e não entra no
                denominador do dia em que está agora. */}
            {diaComprometido && diaComprometido !== activity.planned_date && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                    <History size={10} /> Veio de {formatShortDate(parseISODateStr(diaComprometido))}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  Foi comprometida pra {formatShortDate(parseISODateStr(diaComprometido))} e arrastada
                  pra cá. O acerto daquele dia continua cobrando ela; o deste dia não a conta, porque
                  não foi prometida aqui.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {activity.areaPath && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{activity.areaPath}</p>
          )}
          {activity.inativa && activity.motivoInativacao && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="font-medium">Motivo:</span> {activity.motivoInativacao}
            </p>
          )}
          {activity.foraDoPlano && activity.motivoFora && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              <span className="font-medium">Fora do plano:</span> {activity.motivoFora}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {activity.stage && <span>EDT: {activity.stage}</span>}
            {activity.discipline && <span>Disciplina: {activity.discipline}</span>}
            {activity.area && <span>Área: {activity.area}</span>}
            {activity.foreman && <span>Engenheiro: {activity.foreman}</span>}
            {activity.company && <span>Empresa: {activity.company}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span>Avanço previsto: {activity.planned_pct}%</span>
            {detail && <span>Avanço atual: {Math.round(detail.percentComplete)}%</span>}
            {detail && <span>Início: {detail.start.toLocaleDateString('pt-BR')}</span>}
            {detail && <span>Término: {detail.finish.toLocaleDateString('pt-BR')}</span>}
            {detail && (
              delayDays > 0 ? (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                  <AlertTriangle size={11} /> Atraso: {delayDays} {delayDays === 1 ? 'dia' : 'dias'}
                </span>
              ) : (
                <span>Atraso: 0 dias</span>
              )
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!temSubetapas && activity.taskUid && activity.status !== 'concluida' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  disabled={finalizando}
                  onClick={handleFinalizar}
                  className="p-1.5 rounded-md transition hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-30 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCheck size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <span className="font-semibold">Finalizar 100%</span> — marca concluída e remove essa atividade dos dias restantes da semana (ela já não está mais programada pros dias seguintes).
              </TooltipContent>
            </Tooltip>
          )}
          <StatusButton
            active={activity.status === 'concluida'}
            tone="emerald"
            icon={<CheckCircle2 size={16} />}
            label="Concluída"
            disabled={statusTravado}
            hint={dicaStatusTravado}
            onClick={() => onSetStatus(activity.id, activity.status === 'concluida' ? 'pendente' : 'concluida', obs || null)}
          />
          <StatusButton
            active={activity.status === 'parcial'}
            tone="amber"
            icon={<MinusCircle size={16} />}
            label="Parcial"
            disabled={statusTravado}
            hint={dicaStatusTravado}
            onClick={() => onSetStatus(activity.id, activity.status === 'parcial' ? 'pendente' : 'parcial', obs || null)}
          />
          <StatusButton
            active={activity.status === 'nao_concluida'}
            tone="red"
            icon={<XCircle size={16} />}
            label="Não concluída"
            disabled={statusTravado}
            hint={dicaStatusTravado}
            onClick={() => onSetStatus(activity.id, activity.status === 'nao_concluida' ? 'pendente' : 'nao_concluida', obs || null)}
          />
          <StatusButton
            active={activity.is_extra}
            tone="blue"
            icon={<Layers size={16} />}
            label="Extra"
            disabled={savingExtra}
            hint="não estava planejada pra esse dia, mas foi (ou vai ser) executada mesmo assim — clique de novo pra desmarcar."
            onClick={handleToggleExtra}
          />
          {/* "Fora desta semana" só aparece na montagem: é a decisão de o que
              entra no plano, tomada antes de comprometer. Depois disso o botão
              some e o caminho passa a ser Inativar. */}
          {podeMexerNoPlano && (
            activity.foraDoPlano ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={savingFora}
                    onClick={handleTrazerParaPlano}
                    className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-md transition disabled:opacity-30 text-amber-600 dark:text-amber-400"
                  >
                    <CalendarCheck size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <span className="font-semibold">Trazer pro plano</span> — a atividade volta a fazer parte do compromisso desta semana.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={savingFora}
                    onClick={() => setShowForaForm((v) => !v)}
                    className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-md transition disabled:opacity-30 text-gray-500 dark:text-gray-400"
                  >
                    <CalendarX size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <span className="font-semibold">Fora desta semana</span> — a tarefa veio do cronograma por data, mas já se sabe que estará parada. Fica visível no quadro e fora do compromisso, sem precisar inativar.
                </TooltipContent>
              </Tooltip>
            )
          )}
          {activity.inativa ? (
            <button
              disabled={savingInativa}
              onClick={handleReativar}
              title="Reativar — volta a contar no PPC/aderência"
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30 text-gray-500 dark:text-gray-400"
            >
              <RotateCcw size={14} />
            </button>
          ) : (
            <button
              disabled={savingInativa}
              onClick={() => setShowInativarForm((v) => !v)}
              title="Inativar — tira do PPC/aderência pra analisar o motivo de não ter sido executada"
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30 text-gray-500 dark:text-gray-400"
            >
              <Ban size={14} />
            </button>
          )}
          <button
            disabled={activity.status === 'concluida'}
            onClick={() => setShowReprogramar((v) => !v)}
            title="Reprogramar — mover essa atividade pra outro dia da semana"
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30 text-gray-500 dark:text-gray-400"
          >
            <CalendarClock size={14} />
          </button>
          <button
            disabled={!canDelete}
            onClick={() => onDelete(activity.id)}
            title={canDelete ? 'Remover' : 'Semana bloqueada — só atividades extras podem ser removidas'}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showReprogramar && (
        <div className="mt-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-2">
          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">Mover pra qual dia?</p>
          <div className="flex flex-wrap gap-1.5">
            {weekDays.map((d, i) => {
              if (d === activity.planned_date) return null
              const ocupado = !!activity.taskUid && diasOcupadosPorTask.has(d)
              return (
                <button
                  key={d}
                  disabled={ocupado}
                  title={ocupado ? 'Essa tarefa já está programada nesse dia' : ''}
                  onClick={() => handleReprogramarPara(d)}
                  className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {WEEKDAY_LABELS[i]} {formatShortDate(parseISODateStr(d))}
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 flex justify-end">
            <button
              onClick={() => setShowReprogramar(false)}
              className="px-2.5 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showForaForm && !activity.foraDoPlano && (
        <div className="mt-2 rounded-md border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 p-2">
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            A atividade sai do compromisso desta semana — não entra no baseline nem em nenhum
            denominador de PPC/aderência. Continua visível no quadro.
          </p>
          <label className="mt-1.5 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
            Motivo (opcional)
          </label>
          <textarea
            value={motivoFora}
            onChange={(e) => setMotivoFora(e.target.value)}
            autoFocus
            placeholder="Ex.: frente parada aguardando liberação de projeto"
            className="mt-1 w-full min-h-[52px] text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              onClick={() => { setShowForaForm(false); setMotivoFora('') }}
              className="px-2.5 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleMarcarFora}
              disabled={savingFora}
              className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 transition disabled:opacity-40"
            >
              Tirar desta semana
            </button>
          </div>
        </div>
      )}

      {showInativarForm && !activity.inativa && (
        <div className="mt-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-2">
          <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
            Motivo (opcional)
          </label>
          <textarea
            value={motivoInativar}
            onChange={(e) => setMotivoInativar(e.target.value)}
            autoFocus
            placeholder="Descreva o motivo da inativação..."
            className="mt-1 w-full min-h-[52px] text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              onClick={() => { setShowInativarForm(false); setMotivoInativar('') }}
              className="px-2.5 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleInativar}
              disabled={savingInativa}
              className="px-2.5 py-1 text-xs font-medium bg-gray-600 text-white rounded hover:bg-gray-700 transition disabled:opacity-40"
            >
              Inativar
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowSubetapas((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
        >
          {showSubetapas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <ListChecks size={12} />
          Sub-etapas{temSubetapas ? ` (${subetapas.filter((s) => s.status === 'concluida').length}/${subetapas.length})` : ''}
        </button>
        {showSubetapas && (
          <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
            {subetapas.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  title="Concluída — clique de novo pra desmarcar (volta pra pendente)"
                  disabled={savingSubetapa}
                  onClick={() => handleSetSubetapaStatus(s, 'concluida')}
                  className={`p-0.5 rounded transition disabled:opacity-30 ${
                    s.status === 'concluida'
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30'
                      : 'text-gray-300 dark:text-gray-600 hover:text-emerald-500'
                  }`}
                >
                  <CheckCircle2 size={14} />
                </button>
                <button
                  type="button"
                  title="Não concluída — clique de novo pra desmarcar (volta pra pendente)"
                  disabled={savingSubetapa}
                  onClick={() => handleSetSubetapaStatus(s, 'nao_concluida')}
                  className={`p-0.5 rounded transition disabled:opacity-30 ${
                    s.status === 'nao_concluida'
                      ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
                      : 'text-gray-300 dark:text-gray-600 hover:text-red-500'
                  }`}
                >
                  <XCircle size={14} />
                </button>
                <span
                  className={`flex-1 ${
                    s.status === 'concluida'
                      ? 'text-gray-500 dark:text-gray-400 line-through'
                      : s.status === 'nao_concluida'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {s.nome}
                </span>
                <button
                  onClick={() => handleDeleteSubetapa(s)}
                  disabled={savingSubetapa}
                  className="text-gray-300 hover:text-red-600 dark:text-gray-600 dark:hover:text-red-400 transition disabled:opacity-30"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                value={novaSubetapa}
                onChange={(e) => setNovaSubetapa(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubetapa() }}
                placeholder="Nova sub-etapa..."
                disabled={savingSubetapa}
                className="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAddSubetapa}
                disabled={savingSubetapa || !novaSubetapa.trim()}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-30 transition"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      <textarea
        placeholder="Observações"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onBlur={() => {
          if ((activity.observation ?? '') !== obs) {
            onSetStatus(activity.id, activity.status, obs || null)
          }
        }}
        className="mt-2 w-full min-h-[52px] text-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  )
}

function NaoRealizadasForm({
  candidatas,
  dia,
  diaComprometido,
  onCancel,
  onSubmit,
}: {
  candidatas: ActivityLike[]
  /** Dia aberto — separa candidatas atrasadas das programadas mais à frente. */
  dia: string
  /** activity_id → dia congelado no baseline. Quem NÃO está aqui entrou na semana
   * depois de ela ser comprometida. Vazio = semana em montagem (não existe plano
   * congelado, então "entrou depois" não quer dizer nada). */
  diaComprometido: Map<string, string>
  onCancel: () => void
  onSubmit: (ids: string[]) => Promise<void>
}) {
  const temPlano = diaComprometido.size > 0
  const entrouDepois = (a: ActivityLike) => temPlano && !diaComprometido.has(a.id)
  const qtdEntrouDepois = candidatas.filter(entrouDepois).length
  // Só as atrasadas vêm marcadas por padrão. Puxar uma tarefa de um dia à frente
  // é decisão consciente (antecipação), não o caso comum de arrastar pendência.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(candidatas.filter((a) => a.planned_date < dia).map((a) => a.id)),
  )
  const [saving, setSaving] = useState(false)

  // Reaproveita o mesmo agrupamento da lista do dia (groupByArea), pra área
  // significar a mesma coisa nos dois lugares. Dentro da área, atrasadas
  // primeiro — é o caso urgente.
  const porArea = useMemo(() => {
    const grupos = groupByArea(candidatas)
    for (const [, itens] of grupos) {
      itens.sort((x, y) => {
        const xa = x.planned_date < dia ? 0 : 1
        const ya = y.planned_date < dia ? 0 : 1
        if (xa !== ya) return xa - ya
        // Mantém o critério do groupByArea (nível 3 da EDT + nome) dentro de
        // cada bloco — reordenar só por nome espalhava as subáreas de novo.
        return `${x.areaPath ?? ''}${x.name}`.localeCompare(`${y.areaPath ?? ''}${y.name}`, 'pt-BR')
      })
    }
    return grupos
  }, [candidatas, dia])

  const toggle = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Marca ou desmarca a área inteira de uma vez — uma frente parada costuma ser
   * arrastada em bloco, item por item é trabalhoso com dezenas de atividades. */
  const toggleArea = (itens: ActivityLike[]) => {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      const todasMarcadas = itens.every((a) => next.has(a.id))
      for (const a of itens) {
        if (todasMarcadas) next.delete(a.id)
        else next.add(a.id)
      }
      return next
    })
  }

  return (
    <div className="rounded-md border border-dashed border-orange-300 dark:border-orange-700 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Atividades não concluídas em outros dias desta semana — as marcadas serão movidas pra este dia.
      </p>
      <p className="mb-2 text-[11px] text-gray-400 dark:text-gray-500">
        Mover não apaga o compromisso: o acerto do dia de origem continua cobrando cada uma, e aqui
        elas aparecem com o selo "Veio de".
      </p>
      {qtdEntrouDepois > 0 && (
        <p className="mb-2 text-[11px] text-violet-700 dark:text-violet-400">
          <span className="font-medium">{qtdEntrouDepois}</span> desta lista{' '}
          {qtdEntrouDepois === 1 ? 'entrou' : 'entraram'} na semana depois de ela ser comprometida —
          marcada{qtdEntrouDepois === 1 ? '' : 's'} com <span className="font-medium">entrou depois</span>.
          Não {qtdEntrouDepois === 1 ? 'estava' : 'estavam'} no plano congelado, então não{' '}
          {qtdEntrouDepois === 1 ? 'entra' : 'entram'} no PPC comprometido nem no acerto de nenhum dia.
        </p>
      )}
      {candidatas.length === 0 ? (
        <p className="py-2 text-xs text-gray-400 dark:text-gray-500">Nenhuma atividade pendente em outros dias.</p>
      ) : (
        // Agrupado por área (nível 2 da EDT): o mesmo nome de tarefa se repete em
        // várias frentes — "Bases em concreto" aparece em meia dúzia de áreas —,
        // e uma lista só de nomes não deixa escolher qual delas trazer.
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {porArea.map(([areaNome, itens]) => (
            <div key={areaNome}>
              <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">
                  {areaNome}
                </span>
                <span className="text-[10px] text-gray-300 dark:text-gray-600 shrink-0">· {itens.length}</span>
                <button
                  type="button"
                  onClick={() => toggleArea(itens)}
                  className="ml-auto shrink-0 text-[10px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
                >
                  {itens.every((a) => selecionadas.has(a.id)) ? 'desmarcar' : 'marcar'} área
                </button>
              </div>
              {itens.map((a) => {
                const atrasada = a.planned_date < dia
                return (
                  <label key={a.id} className="flex cursor-pointer items-start gap-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={selecionadas.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-gray-800 dark:text-gray-200">{a.name}</span>
                      {/* Caminho completo (nível 2 / nível 3) — o cabeçalho acima
                          mostra só o nível 2, e duas subáreas diferentes ficariam
                          indistinguíveis sem isto. */}
                      {a.areaPath && a.areaPath !== areaNome && (
                        <span
                          className="block truncate text-[10px] text-gray-400 dark:text-gray-500"
                          title={a.areaPath}
                        >
                          {a.areaPath}
                        </span>
                      )}
                      <span className="flex flex-wrap items-center gap-x-1.5">
                        {a.foreman && (
                          <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                            {a.foreman}
                          </span>
                        )}
                        {entrouDepois(a) && (
                          <span
                            className="shrink-0 px-1 py-px text-[9px] font-semibold uppercase tracking-wide rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                            title="Não estava no plano congelado quando a semana foi comprometida — foi importada ou criada depois. Não entra no denominador do PPC comprometido nem no acerto de nenhum dia."
                          >
                            entrou depois
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 ${
                        atrasada
                          ? 'font-medium text-orange-600 dark:text-orange-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                      title={atrasada ? 'Atrasada — ficou pendente em dia anterior' : 'Programada pra um dia à frente'}
                    >
                      {atrasada ? '↩ ' : '↪ '}
                      {formatShortDate(parseISODateStr(a.planned_date))}
                    </span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition">
          Cancelar
        </button>
        <button
          disabled={selecionadas.size === 0 || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSubmit(Array.from(selecionadas))
            } finally {
              setSaving(false)
            }
          }}
          className="px-3 py-1.5 text-sm font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 transition disabled:opacity-50"
        >
          Adicionar{selecionadas.size > 0 ? ` (${selecionadas.size})` : ''}
        </button>
      </div>
    </div>
  )
}

function StatusButton({
  active,
  tone,
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  active: boolean
  tone: 'emerald' | 'amber' | 'red' | 'blue'
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  hint?: string
}) {
  const tones: Record<string, string> = {
    emerald: active ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : '',
    amber: active ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : '',
    red: active ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : '',
    blue: active ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : '',
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`p-1.5 rounded-md transition hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${tones[tone]}`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <span className="font-semibold">{label}</span> — {STATUS_HINTS[label] ?? ''}{hint}
      </TooltipContent>
    </Tooltip>
  )
}

function ExtraForm({
  date,
  engenheirosDisponiveis,
  areasDisponiveis,
  onSubmit,
  onCancel,
}: {
  date: string
  engenheirosDisponiveis: string[]
  areasDisponiveis: string[]
  onSubmit: (p: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => Promise<void>
  onCancel: () => void
}) {
  const [f, setF] = useState({ name: '', company: '', discipline: '', area: '', stage: '', foreman: '' })

  return (
    <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Nova atividade avulsa</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Nome *</label>
          <input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <Field label="Empresa" value={f.company} onChange={(v) => setF({ ...f, company: v })} />
        <Field label="Disciplina" value={f.discipline} onChange={(v) => setF({ ...f, discipline: v })} />
        <Field label="Área" value={f.area} onChange={(v) => setF({ ...f, area: v })} options={areasDisponiveis} />
        <Field label="Etapa" value={f.stage} onChange={(v) => setF({ ...f, stage: v })} />
        <Field label="Engenheiro" value={f.foreman} onChange={(v) => setF({ ...f, foreman: v })} options={engenheirosDisponiveis} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition">
          Cancelar
        </button>
        <button
          disabled={!f.name.trim()}
          onClick={() =>
            onSubmit({
              planned_date: date,
              name: f.name.trim(),
              company: f.company || null,
              discipline: f.discipline || null,
              area: f.area || null,
              stage: f.stage || null,
              foreman: f.foreman || null,
            })
          }
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}

// `options`, quando presente, liga um <datalist> ao campo: mostra as opções já
// cadastradas no sistema (ex.: engenheiros de "Engenheiros por Área") como
// sugestão, filtrando conforme digita — mas sem travar em só essas opções, já
// que uma atividade avulsa às vezes precisa de um nome que ainda não existe
// em nenhum cadastro.
function Field({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options?: string[] }) {
  const listId = options ? `field-options-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />
      {options && options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </div>
  )
}
