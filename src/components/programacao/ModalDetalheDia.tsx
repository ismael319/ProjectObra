import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, MinusCircle, XCircle, Trash2, Plus, X, Layers, Eraser, Download, AlertTriangle, ListChecks, Image, Ban, RotateCcw, CheckCheck, CalendarClock, History } from 'lucide-react'
import { toast } from 'sonner'
import { computeDelayDays, type ActivityLike, type ActivityStatus, type SubEtapa } from '@/lib/adherence'
import { parseISODateStr, formatShortDate, WEEKDAY_LABELS } from '@/lib/iso-week'
import { getAreaNivel2 } from '@/lib/week-activities'
import { addSubEtapa, toggleSubEtapa, deleteSubEtapa, computeStatusFromSubetapas } from '@/lib/programacao-db'
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
  activities: ActivityLike[]
  /** As 7 datas ISO da semana carregada — usado pelo "Reprogramar" (só oferece dias
   * dentro dessa semana) e pelo "Adicionar não realizadas". */
  weekDays: string[]
  /** TODAS as atividades da semana (não só as do dia aberto) — usado pra achar dias
   * futuros da mesma tarefa (Finalizar 100%), dias já ocupados por uma tarefa
   * (Reprogramar) e pendências de dias anteriores (Adicionar não realizadas). */
  todasAtividadesDaSemana: ActivityLike[]
  weekConsolidated: boolean
  onSetStatus: (id: string, status: ActivityStatus, observation: string | null) => Promise<void>
  /** Inativa/reativa um item pra análise (ex.: não ficou claro por que não foi
   * executado) — sai do PPC/aderência enquanto inativo. Funciona mesmo com a semana
   * bloqueada, igual às sub-etapas. */
  onSetInativa: (id: string, inativa: boolean, motivo: string | null) => Promise<void>
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
  /** Atualiza a lista de atividades sem mudar status de nenhuma — usado quando a
   * última sub-etapa de um item é excluída (computeStatusFromSubetapas volta a
   * null, então onSetStatus não é chamado, e sem isso a lista não refletia a
   * exclusão). */
  onRefresh: () => void
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
  /** Abre o gerador de imagem (Fechamento/Programação) pro dia aberto — funciona
   * mesmo com a semana bloqueada, é só um reflexo do que já está gravado. */
  onExportarImagem: () => void
  /** Resolve a atividade importada pra sua WBSActivity de origem no cronograma (pra
   * mostrar atraso, % avanço atual e datas de início/término) — null quando a
   * atividade é extra manual ou foi importada antes desse vínculo existir. */
  getActivityDetail: (activity: ActivityLike) => WBSActivity | null
}

const EXTRAS_GROUP = '__extras__'

// Cor do card inteiro conforme o status vira realidade — status tem prioridade sobre
// "extra" (uma extra marcada como concluída fica verde, não azul); só quando ainda
// está pendente é que "extra" ganha uma cor própria (azul) pra se distinguir de uma
// pendente comum (cinza neutro).
function cardColorClasses(activity: ActivityLike): string {
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
  activities,
  weekDays,
  todasAtividadesDaSemana,
  weekConsolidated,
  onSetStatus,
  onSetInativa,
  onFinalizar,
  onReprogramar,
  onAdicionarNaoRealizadas,
  onDelete,
  onRefresh,
  onAddExtra,
  onClearDay,
  onAddFromCronograma,
  onExportarImagem,
  getActivityDetail,
}: Props) {
  const [showExtra, setShowExtra] = useState(false)
  const [showNaoRealizadas, setShowNaoRealizadas] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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
  const naoRealizadasAnteriores = useMemo(() => {
    if (!date) return []
    const porTask = new Map<string, ActivityLike>()
    for (const a of todasAtividadesDaSemana) {
      if (a.planned_date >= date || a.status === 'concluida' || a.inativa) continue
      const key = a.taskUid ?? a.id
      const atual = porTask.get(key)
      if (!atual || a.planned_date > atual.planned_date) porTask.set(key, a)
    }
    const jaHoje = new Set(activities.filter((a) => a.taskUid).map((a) => a.taskUid))
    return Array.from(porTask.values())
      .filter((a) => !(a.taskUid && jaHoje.has(a.taskUid)))
      .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
  }, [todasAtividadesDaSemana, activities, date])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
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
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Atividades do dia {date ? formatShortDate(parseISODateStr(date)) : ''}
            </h2>
            {activities.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {activities.length} {activities.length === 1 ? 'atividade' : 'atividades'} · {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
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
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                    isExtrasGroup
                      ? 'bg-sky-50/60 dark:bg-sky-900/10 hover:bg-sky-50 dark:hover:bg-sky-900/20'
                      : 'bg-purple-50/60 dark:bg-purple-900/10 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                  }`}
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                  <Layers size={13} className={isExtrasGroup ? 'text-sky-500' : 'text-purple-500'} />
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {isExtrasGroup ? 'Atividades Extras' : groupKey}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {groupActivities.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2 text-[11px] shrink-0">
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
                      return areaGroups.map(([areaNome, areaActivities]) => (
                        <div key={areaNome} className="space-y-2">
                          {mostrarAreas && (
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1">
                              {areaNome} <span className="font-normal normal-case">· {areaActivities.length}</span>
                            </p>
                          )}
                          {areaActivities.map((a) => (
                            <ActivityRow
                              key={a.id}
                              activity={a}
                              weekDays={weekDays}
                              todasAtividadesDaSemana={todasAtividadesDaSemana}
                              weekConsolidated={weekConsolidated}
                              onSetStatus={onSetStatus}
                              onSetInativa={onSetInativa}
                              onFinalizar={onFinalizar}
                              onReprogramar={onReprogramar}
                              onDelete={onDelete}
                              onRefresh={onRefresh}
                              detail={getActivityDetail(a)}
                            />
                          ))}
                        </div>
                      ))
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
              onCancel={() => setShowExtra(false)}
              onSubmit={async (p) => {
                await onAddExtra(p)
                setShowExtra(false)
              }}
            />
          ) : showNaoRealizadas && date ? (
            <NaoRealizadasForm
              candidatas={naoRealizadasAnteriores}
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
                <Plus size={16} /> Cadastrar atividade extra
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onAddFromCronograma}
                disabled={!date || weekConsolidated}
                title={weekConsolidated ? 'Desbloqueie a semana para adicionar do cronograma' : 'Buscar tarefas do cronograma pra este dia (ex.: um domingo com trabalho excepcional)'}
              >
                <Download size={16} /> Adicionar do cronograma
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setShowNaoRealizadas(true)}
                disabled={!date || naoRealizadasAnteriores.length === 0}
                title="Traz pra hoje atividades ainda não realizadas em dias anteriores desta semana"
              >
                <History size={16} /> Não realizadas {naoRealizadasAnteriores.length > 0 ? `(${naoRealizadasAnteriores.length})` : ''}
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
  weekDays,
  todasAtividadesDaSemana,
  weekConsolidated,
  onSetStatus,
  onSetInativa,
  onFinalizar,
  onReprogramar,
  onDelete,
  onRefresh,
  detail,
}: {
  activity: ActivityLike
  weekDays: Props['weekDays']
  todasAtividadesDaSemana: Props['todasAtividadesDaSemana']
  weekConsolidated: boolean
  onSetStatus: Props['onSetStatus']
  onSetInativa: Props['onSetInativa']
  onFinalizar: Props['onFinalizar']
  onReprogramar: Props['onReprogramar']
  onDelete: Props['onDelete']
  onRefresh: Props['onRefresh']
  detail: WBSActivity | null
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
  const canDelete = !weekConsolidated || activity.is_extra
  const delayDays = detail ? computeDelayDays(detail) : 0
  const subetapas = activity.subetapas ?? []
  const temSubetapas = subetapas.length > 0
  // Dias em que essa mesma tarefa (taskUid) já tem uma linha própria — pra não
  // oferecer reprogramar pra um dia que geraria uma segunda linha da mesma tarefa.
  const diasOcupadosPorTask = useMemo(() => {
    if (!activity.taskUid) return new Set<string>()
    return new Set(todasAtividadesDaSemana.filter((a) => a.taskUid === activity.taskUid).map((a) => a.planned_date))
  }, [todasAtividadesDaSemana, activity.taskUid])

  async function handleInativar() {
    const motivo = motivoInativar.trim()
    if (!motivo) return
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
  async function sincronizarStatus(lista: SubEtapa[]) {
    const status = computeStatusFromSubetapas(lista)
    if (status) await onSetStatus(activity.id, status, obs || null)
    else onRefresh()
  }

  async function handleAddSubetapa() {
    const nome = novaSubetapa.trim()
    if (!nome) return
    setSavingSubetapa(true)
    try {
      const nova = await addSubEtapa(activity.id, nome)
      setNovaSubetapa('')
      await sincronizarStatus([...subetapas, nova])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar sub-etapa')
    } finally {
      setSavingSubetapa(false)
    }
  }

  async function handleToggleSubetapa(sub: SubEtapa) {
    setSavingSubetapa(true)
    try {
      await toggleSubEtapa(sub.id, !sub.concluida)
      await sincronizarStatus(subetapas.map((s) => (s.id === sub.id ? { ...s, concluida: !sub.concluida } : s)))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao marcar sub-etapa')
    } finally {
      setSavingSubetapa(false)
    }
  }

  async function handleDeleteSubetapa(sub: SubEtapa) {
    setSavingSubetapa(true)
    try {
      await deleteSubEtapa(sub.id)
      await sincronizarStatus(subetapas.filter((s) => s.id !== sub.id))
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
          </div>
          {activity.areaPath && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{activity.areaPath}</p>
          )}
          {activity.inativa && activity.motivoInativacao && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="font-medium">Motivo:</span> {activity.motivoInativacao}
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
            disabled={temSubetapas}
            hint={temSubetapas ? ' — calculado a partir das sub-etapas, não dá pra marcar manualmente.' : ' — clique de novo pra desmarcar (volta pra pendente), caso tenha clicado errado.'}
            onClick={() => onSetStatus(activity.id, activity.status === 'concluida' ? 'pendente' : 'concluida', obs || null)}
          />
          <StatusButton
            active={activity.status === 'parcial'}
            tone="amber"
            icon={<MinusCircle size={16} />}
            label="Parcial"
            disabled={temSubetapas}
            hint={temSubetapas ? ' — calculado a partir das sub-etapas, não dá pra marcar manualmente.' : ' — clique de novo pra desmarcar (volta pra pendente), caso tenha clicado errado.'}
            onClick={() => onSetStatus(activity.id, activity.status === 'parcial' ? 'pendente' : 'parcial', obs || null)}
          />
          <StatusButton
            active={activity.status === 'nao_concluida'}
            tone="red"
            icon={<XCircle size={16} />}
            label="Não concluída"
            disabled={temSubetapas}
            hint={temSubetapas ? ' — calculado a partir das sub-etapas, não dá pra marcar manualmente.' : ' — clique de novo pra desmarcar (volta pra pendente), caso tenha clicado errado.'}
            onClick={() => onSetStatus(activity.id, activity.status === 'nao_concluida' ? 'pendente' : 'nao_concluida', obs || null)}
          />
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

      {showInativarForm && !activity.inativa && (
        <div className="mt-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-2">
          <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
            Motivo (por que ainda não foi executada?)
          </label>
          <textarea
            value={motivoInativar}
            onChange={(e) => setMotivoInativar(e.target.value)}
            autoFocus
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
              disabled={savingInativa || !motivoInativar.trim()}
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
          Sub-etapas{temSubetapas ? ` (${subetapas.filter((s) => s.concluida).length}/${subetapas.length})` : ''}
        </button>
        {showSubetapas && (
          <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
            {subetapas.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={s.concluida}
                  disabled={savingSubetapa}
                  onChange={() => handleToggleSubetapa(s)}
                  className="w-3.5 h-3.5"
                />
                <span className={`flex-1 ${s.concluida ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
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
  onCancel,
  onSubmit,
}: {
  candidatas: ActivityLike[]
  onCancel: () => void
  onSubmit: (ids: string[]) => Promise<void>
}) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set(candidatas.map((a) => a.id)))
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-md border border-dashed border-orange-300 dark:border-orange-700 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Atividades não realizadas em dias anteriores desta semana — as marcadas serão movidas pra hoje.
      </p>
      {candidatas.length === 0 ? (
        <p className="py-2 text-xs text-gray-400 dark:text-gray-500">Nenhuma atividade pendente em dias anteriores.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {candidatas.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-2 py-1 text-xs">
              <input type="checkbox" checked={selecionadas.has(a.id)} onChange={() => toggle(a.id)} className="w-3.5 h-3.5" />
              <span className="flex-1 text-gray-800 dark:text-gray-200">{a.name}</span>
              <span className="text-gray-400 dark:text-gray-500">{formatShortDate(parseISODateStr(a.planned_date))}</span>
            </label>
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
  tone: 'emerald' | 'amber' | 'red'
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
  onSubmit,
  onCancel,
}: {
  date: string
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
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Nova atividade extra</p>
      <div className="grid grid-cols-2 gap-2">
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
        <Field label="Área" value={f.area} onChange={(v) => setF({ ...f, area: v })} />
        <Field label="Etapa" value={f.stage} onChange={(v) => setF({ ...f, stage: v })} />
        <Field label="Engenheiro" value={f.foreman} onChange={(v) => setF({ ...f, foreman: v })} />
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />
    </div>
  )
}
