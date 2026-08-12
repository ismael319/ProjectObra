import { useMemo, useState, useEffect, useCallback } from 'react'
import { Calendar, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { getISOWeekYearAndNumber, isoWeekFromParts, addDays, toISODateStr, parseISODateStr, formatShortDate } from '@/lib/iso-week'
import { computeIndicators, computeIndicatorsCronograma, computeIndicatorsDia, diaComprometidoPorAtividade, computeSegment, type ActivityLike, type ActivityStatus, type WeekIndicators } from '@/lib/adherence'
import {
  getWeek,
  lockWeekWithBaseline,
  unlockWeekWithBaseline,
  setActivityStatus,
  setActivityInativa,
  setActivityExtra,
  deleteActivity,
  addExtraActivity,
  mergeExcel,
  descreverMergeExcel,
  clearWeekActivities,
  clearDayActivities,
  listEngenheirosArea,
  moverAtividadesParaDia,
  finalizarAtividade,
  comprometerSemana,
  reabrirParaMontagem,
  resumoComprometimento,
  setActivityForaDoPlano,
  type WeekData,
} from '@/lib/programacao-db'
import { useProjects } from '@/lib/project-store'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { findActivitiesWithWorkInWeek, listDistinctAreaNames, type WeekActivity } from '@/lib/week-activities'
import type { WBSActivity } from '@/lib/xml-parser'

import WeekBar from '@/components/programacao/WeekBar'
import CardDia from '@/components/programacao/CardDia'
import ModalDetalheDia from '@/components/programacao/ModalDetalheDia'
import ModalImportarAtividades from '@/components/programacao/ModalImportarAtividades'
import ModalEngenheirosArea from '@/components/programacao/ModalEngenheirosArea'
import ModalExportarImagem, { type AlvoExportacao } from '@/components/programacao/ModalExportarImagem'
import IndicadoresSemana from '@/components/programacao/IndicadoresSemana'
import PainelAderencia from '@/components/programacao/PainelAderencia'
import ModalAnaliseSemana from '@/components/programacao/ModalAnaliseSemana'
import PainelValidacaoSemana from '@/components/programacao/PainelValidacaoSemana'
import { programacaoProntaParaBloqueio } from '@/lib/validacao/programacao'
import { TooltipProvider } from '@/components/ui/tooltip'

// Intervalo "sem limite prático" pra busca de atividade em todo o cronograma
// (handleSearchDayActivities) — mais simples que calcular o min/max real das
// atividades, e cobre qualquer cronograma de obra sem risco de cortar nada.
const MIN_DATE = new Date(2000, 0, 1)
const MAX_DATE = new Date(2100, 0, 1)

export default function DailyProgramming() {
  const { currentProject } = useProjects()
  const { userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? ''
  const { podeEditar } = usePapelModulo('engenharia')
  const now = new Date()
  const cur = getISOWeekYearAndNumber(now)
  const [isoYear, setIsoYear] = useState(cur.year)
  const [isoWeek, setIsoWeek] = useState(cur.week)
  const [loading, setLoading] = useState(true)
  // Tipo vindo de getWeek em vez de redeclarado aqui: a cópia local ficava pra
  // trás a cada coluna nova (era ela que ainda dizia status: 'rascunho' |
  // 'consolidado' depois do estado 'comprometida' existir).
  const [weekData, setWeekData] = useState<WeekData | null>(null)
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [showWeekActivities, setShowWeekActivities] = useState(false)
  const [weekActivities, setWeekActivities] = useState<WeekActivity[]>([])
  const [loadingWeekActivities, setLoadingWeekActivities] = useState(false)
  const [showDayImport, setShowDayImport] = useState(false)
  const [dayImportDate, setDayImportDate] = useState<string | null>(null)
  const [dayImportActivities, setDayImportActivities] = useState<WeekActivity[]>([])
  const [loadingDayImport, setLoadingDayImport] = useState(false)
  const [showEngenheirosArea, setShowEngenheirosArea] = useState(false)
  const [engenheirosPorArea, setEngenheirosPorArea] = useState<Map<string, string>>(new Map())
  const [areaIdPorArea, setAreaIdPorArea] = useState<Map<string, string>>(new Map())
  const [showExportar, setShowExportar] = useState(false)
  const [alvoExportacao, setAlvoExportacao] = useState<AlvoExportacao | null>(null)
  const [showAnalise, setShowAnalise] = useState(false)

  // showLoading=false evita o spinner de página inteira (que some com o modal aberto)
  // em atualizações depois de uma ação — status, exclusão, importação etc. Só a
  // primeira carga da semana (ou troca de semana) precisa do loading bloqueante.
  const fetchData = useCallback(async (showLoading = true) => {
    // organizacaoId só existe depois que o perfil do usuário carrega (async) —
    // sem essa guarda, o primeiro disparo do efeito abaixo (no mount, antes do
    // perfil chegar) tentava buscar a semana sem organização, o que ou
    // vazava dados de outra empresa ou quebrava com um 400 (ver getWeek).
    if (!organizacaoId) return
    if (showLoading) setLoading(true)
    try {
      const data = await getWeek(organizacaoId, isoYear, isoWeek)
      setWeekData(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar semana'
      toast.error(msg)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [organizacaoId, isoYear, isoWeek])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const activities = weekData?.activities ?? []
  const partialWeight = weekData?.partialWeight ?? 0.5
  const baseline = weekData?.baseline ?? []

  const indicators = useMemo(() => computeIndicators(activities, partialWeight), [activities, partialWeight])
  // Aderência do Cronograma (plano original, ignora Extra/Inativa feitos depois) x
  // Aderência Ajustada (indicators, acima) — ver WeekBar/IndicadoresSemana pra
  // comparação exibida na tela.
  const indicatorsCronograma = useMemo(() => computeIndicatorsCronograma(activities, partialWeight), [activities, partialWeight])

  const segArea = useMemo(() => computeSegment(activities, 'area', partialWeight), [activities, partialWeight])
  const segEnc = useMemo(() => computeSegment(activities, 'foreman', partialWeight), [activities, partialWeight])

  const days = useMemo(() => {
    if (!weekData?.week) return []
    const start = parseISODateStr(weekData.week.start_date)
    return Array.from({ length: 7 }, (_, i) => toISODateStr(addDays(start, i)))
  }, [weekData?.week])

  const activitiesByDate = useMemo(() => {
    const m = new Map<string, ActivityLike[]>()
    for (const d of days) m.set(d, [])
    for (const a of activities) {
      const arr = m.get(a.planned_date)
      if (arr) arr.push(a)
      else m.set(a.planned_date, [a])
    }
    return m
  }, [days, activities])

  // Taxa de acerto de cada dia contra o que foi comprometido PRA ele. Vem do
  // baseline (não da programação atual), então arrastar uma pendência de um dia
  // pro outro não maquia nenhum dos dois — ver computeIndicatorsDia.
  const acertoPorDia = useMemo(() => {
    const m = new Map<string, WeekIndicators | null>()
    for (const d of days) m.set(d, computeIndicatorsDia(baseline, activities, d, partialWeight))
    return m
  }, [days, baseline, activities, partialWeight])

  /** Dia em que cada atividade foi comprometida — alimenta o selo "veio de". */
  const diaComprometido = useMemo(() => diaComprometidoPorAtividade(baseline), [baseline])

  // Cronogramas ativos no formato que o ColumnValueFilter (mesmo componente da Curva
  // S) e o cálculo de exclusão por coluna esperam — inclui também os índices de LB
  // (0-10) disponíveis EM CADA cronograma, já que cada um pode ter baselines
  // diferentes e a seleção de LB na janela de importação é por cronograma.
  const importSources = useMemo(() => {
    return (currentProject?.cronogramas || [])
      .filter((c) => c.ativo && c.dados)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        activities: c.dados!.activities,
        customFieldDefs: c.dados!.customFieldDefs || [],
        availableBLIndices: c.dados!.baselines.filter((bl) => bl.available).map((bl) => bl.index).sort((a, b) => a - b),
      }))
  }, [currentProject])

  // Áreas (nível 2 da EDT) que existem de fato nos cronogramas ativos do projeto —
  // usada tanto pra montar a tela "Engenheiros por Área" quanto (via engenheirosPorArea)
  // pra sugerir o Engenheiro na 2ª etapa da importação.
  const areasDoCronograma = useMemo(
    () => listDistinctAreaNames(currentProject?.cronogramas || []),
    [currentProject],
  )

  // Nomes de engenheiro já cadastrados (sem repetição) — sugestão no formulário de
  // atividade avulsa.
  const engenheirosDisponiveis = useMemo(
    () => Array.from(new Set(engenheirosPorArea.values())).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [engenheirosPorArea],
  )

  useEffect(() => {
    if (!currentProject?.id) {
      setEngenheirosPorArea(new Map())
      setAreaIdPorArea(new Map())
      return
    }
    listEngenheirosArea(currentProject.id)
      .then((rows) => {
        setEngenheirosPorArea(new Map(rows.filter((r) => r.engenheiro).map((r) => [r.area_nome, r.engenheiro!])))
        setAreaIdPorArea(new Map(rows.filter((r) => r.area_id).map((r) => [r.area_nome, r.area_id!])))
      })
      .catch(() => { /* só afeta o preenchimento automático, não é crítico */ })
    // Recarrega quando o modal de gerenciamento fecha, pra já refletir edições recentes.
  }, [currentProject?.id, showEngenheirosArea])

  // Índice cronograma+uid -> WBSActivity, pra buscar atraso/% avanço/datas ao vivo
  // do cronograma quando o modal do dia mostra uma atividade importada. Só funciona
  // pra atividades importadas DEPOIS que o campo taskUid passou a ser gravado —
  // programações antigas (ou extras manuais) não têm essa referência e simplesmente
  // não mostram esses dados extras.
  const cronogramaActivityIndex = useMemo(() => {
    const map = new Map<string, WBSActivity>()
    for (const c of currentProject?.cronogramas || []) {
      if (!c.ativo || !c.dados) continue
      for (const act of c.dados.activities) {
        map.set(`${c.nome}::${act.uid}`, act)
      }
    }
    return map
  }, [currentProject])

  // Mapa nome do cronograma -> ID do cronograma, pra converter source (nome) em
  // cronogramaId (ID) ao calcular as chaves pré-selecionadas no modal de importação.
  const cronogramaNomeToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of currentProject?.cronogramas || []) {
      map.set(c.nome, c.id)
    }
    return map
  }, [currentProject])

  const getActivityDetail = useCallback(
    (a: ActivityLike): WBSActivity | null => {
      if (!a.source || !a.taskUid) return null
      return cronogramaActivityIndex.get(`${a.source}::${a.taskUid}`) ?? null
    },
    [cronogramaActivityIndex],
  )

  const handleSearchWeekActivities = () => {
    if (!currentProject?.cronogramas?.length) {
      toast.warning('Nenhum cronograma carregado no projeto')
      return
    }

    setLoadingWeekActivities(true)
    setShowWeekActivities(true)

    try {
      const friday = isoWeekFromParts(isoYear, isoWeek)
      const thursday = addDays(friday, 6)
      const results = findActivitiesWithWorkInWeek(
        currentProject.cronogramas,
        friday,
        thursday,
      )
      setWeekActivities(results)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao buscar atividades'
      toast.error(msg)
    } finally {
      setLoadingWeekActivities(false)
    }
  }

  // Busca em TODO o cronograma (não só o que se sobrepõe ao dia) — o caso de uso
  // aqui é justamente encontrar uma atividade que não estava planejada pra esse dia
  // (ex.: domingo, ou qualquer outro dia fora da janela normal dela) mas que foi
  // executada mesmo assim. ModalImportarAtividades recebe `targetDate` e decide,
  // atividade por atividade, se ela vira "extra" (não some no board como planejada
  // de verdade) comparando a janela original dela com esse dia.
  const handleSearchDayActivities = (date: string) => {
    if (!currentProject?.cronogramas?.length) {
      toast.warning('Nenhum cronograma carregado no projeto')
      return
    }

    setDayImportDate(date)
    setLoadingDayImport(true)
    setShowDayImport(true)

    try {
      const results = findActivitiesWithWorkInWeek(currentProject.cronogramas, MIN_DATE, MAX_DATE)
      setDayImportActivities(results)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao buscar atividades'
      toast.error(msg)
    } finally {
      setLoadingDayImport(false)
    }
  }

  const handleExportarDia = (date: string) => {
    setOpenDate(null)
    setAlvoExportacao({ tipo: 'dia', data: date })
    setShowExportar(true)
  }

  const handleExportarSemana = () => {
    if (days.length === 0) return
    setAlvoExportacao({ tipo: 'semana', weekDays: days })
    setShowExportar(true)
  }

  const goto = (y: number, w: number) => {
    setIsoYear(y)
    setIsoWeek(w)
  }

  const shift = (delta: number) => {
    const friday = isoWeekFromParts(isoYear, isoWeek)
    const next = addDays(friday, delta * 7)
    const p = getISOWeekYearAndNumber(next)
    goto(p.year, p.week)
  }

  const handleExportExcel = async () => {
    if (!weekData) return
    const XLSX = await import('xlsx')
    const statusLabel: Record<string, string> = {
      pendente: 'Pendente',
      concluida: 'Concluída',
      parcial: 'Parcial',
      nao_concluida: 'Não concluída',
    }
    const rows = activities.map((a) => ({
      UID: a.id,
      Nome: a.name,
      Empresa: a.company ?? '',
      Disciplina: a.discipline ?? '',
      Área: a.area ?? '',
      Etapa: a.stage ?? '',
      Engenheiro: a.foreman ?? '',
      Data: a.planned_date,
      '% Previsto': a.planned_pct,
      Status: statusLabel[a.status] ?? a.status,
      Observações: a.observation ?? '',
      'Produtividade Real': '',
      Extra: a.is_extra ? 'Sim' : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Programação')
    XLSX.writeFile(wb, `programacao-${isoYear}-S${String(isoWeek).padStart(2, '0')}.xlsx`)
    toast.success('Excel exportado com sucesso')
  }

  const handleImportExcel = async (file: File) => {
    if (!weekData?.week) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(ws, { defval: null })
      const result = await mergeExcel(organizacaoId, weekData.week.id, rows)
      const { texto, ok } = descreverMergeExcel(result)
      // Importação que não casou nenhuma linha é erro do ponto de vista de quem
      // preencheu a planilha, não sucesso com zero — antes saía um toast verde
      // dizendo "0 atividade(s) atualizada(s)" e ninguém percebia.
      if (ok) toast.success(`Excel importado: ${texto}`)
      else toast.error(texto, { duration: 10000 })
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao importar Excel'
      toast.error(msg)
    }
  }

  // Comprometer é o momento em que o plano da semana vira compromisso: é aqui
  // que o baseline é congelado, e é contra ele que o PPC passa a ser medido.
  // O gate de confirmação dos engenheiros veio de handleLock junto com o
  // baseline — validar no FECHAMENTO era confirmar um plano cujo resultado já
  // estava na tela; a confirmação só significa alguma coisa antes da semana
  // rodar.
  const handleComprometer = async () => {
    if (!weekData?.week) return
    try {
      const { comprometidas, foraDoPlano } = await resumoComprometimento(organizacaoId, weekData.week.id)

      const pronta = await programacaoProntaParaBloqueio(weekData.week.id)
      const avisoValidacao = pronta
        ? ''
        : '\n\nATENÇÃO: nem todos os engenheiros confirmaram a programação desta semana.'

      const seguir = confirm(
        `Comprometer a semana congela o plano:\n\n` +
          `• ${comprometidas} atividade(s) entram no compromisso\n` +
          `• ${foraDoPlano} marcada(s) como "fora desta semana" (ficam fora da conta)\n\n` +
          `A partir daqui o PPC é medido contra esse conjunto. Apontar status continua livre; ` +
          `alterações no conjunto passam a aparecer na Análise Semanal.${avisoValidacao}\n\nContinuar?`,
      )
      if (!seguir) return

      await comprometerSemana(organizacaoId, weekData.week.id)
      toast.success(`Semana comprometida — ${comprometidas} atividade(s) no plano`)
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao comprometer semana'
      toast.error(msg)
    }
  }

  const handleReabrirMontagem = async () => {
    if (!weekData?.week) return
    if (
      !confirm(
        'Voltar pra montagem DESCARTA o plano comprometido desta semana.\n\n' +
          'O baseline é apagado e o PPC volta a não existir até você comprometer de novo. ' +
          'Use só pra corrigir um comprometimento feito por engano.\n\nContinuar?',
      )
    )
      return
    try {
      await reabrirParaMontagem(organizacaoId, weekData.week.id)
      toast.success('Semana voltou pra montagem — plano descartado')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao reabrir semana'
      toast.error(msg)
    }
  }

  // Fechar não grava mais baseline — só encerra a semana. O plano já foi
  // congelado em handleComprometer.
  const handleLock = async () => {
    if (!weekData?.week) return
    try {
      await lockWeekWithBaseline(organizacaoId, weekData.week.id)
      toast.success('Semana fechada')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao fechar semana'
      toast.error(msg)
    }
  }

  const handleUnlock = async () => {
    if (!weekData?.week) return
    try {
      await unlockWeekWithBaseline(organizacaoId, weekData.week.id)
      toast.success('Semana reaberta — o plano comprometido foi mantido')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao reabrir semana'
      toast.error(msg)
    }
  }

  const handleClearWeek = async () => {
    if (!weekData?.week) return
    if (!confirm('Remover todas as atividades desta semana (inclusive as extras)? Esta ação não pode ser desfeita.')) return
    try {
      await clearWeekActivities(organizacaoId, weekData.week.id)
      toast.success('Semana limpa')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao limpar semana'
      toast.error(msg)
    }
  }

  const handleClearDay = async (date: string) => {
    if (!weekData?.week) return
    if (!confirm(`Remover todas as atividades de ${date} (inclusive as extras)? Esta ação não pode ser desfeita.`)) return
    try {
      await clearDayActivities(organizacaoId, weekData.week.id, date)
      toast.success('Dia limpo')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao limpar o dia'
      toast.error(msg)
    }
  }

  const handleSetStatus = async (id: string, status: ActivityStatus, observation: string | null) => {
    try {
      await setActivityStatus(organizacaoId, id, status, observation)
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar status'
      toast.error(msg)
    }
  }

  const handleSetInativa = async (id: string, inativa: boolean, motivo: string | null) => {
    try {
      await setActivityInativa(organizacaoId, id, inativa, motivo)
      toast.success(inativa ? 'Atividade inativada' : 'Atividade reativada')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao inativar a atividade'
      toast.error(msg)
    }
  }

  const handleSetForaDoPlano = async (id: string, fora: boolean, motivo: string | null) => {
    try {
      await setActivityForaDoPlano(organizacaoId, id, fora, motivo)
      toast.success(fora ? 'Atividade fora desta semana' : 'Atividade de volta ao plano')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar o plano da atividade'
      toast.error(msg)
    }
  }

  const handleSetExtra = async (id: string, isExtra: boolean) => {
    try {
      await setActivityExtra(organizacaoId, id, isExtra)
      toast.success(isExtra ? 'Marcada como extra' : 'Desmarcada como extra')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar a atividade'
      toast.error(msg)
    }
  }

  // "Finalizado 100%": marca concluída e limpa os dias FUTUROS da mesma semana que
  // ainda tinham essa mesma tarefa (mesmo taskUid) programada — evita ela continuar
  // aparecendo como pendente depois de já ter sido entregue antes do previsto.
  const handleFinalizarAtividade = async (activity: ActivityLike) => {
    const futuras = activity.taskUid
      ? activities.filter((a) => a.taskUid === activity.taskUid && a.planned_date > activity.planned_date)
      : []
    if (futuras.length > 0) {
      const dias = Array.from(new Set(futuras.map((a) => a.planned_date)))
        .sort()
        .map((d) => formatShortDate(parseISODateStr(d)))
        .join(', ')
      if (!confirm(`Marcar como concluída e remover essa atividade dos dias restantes da semana (${dias})? Essa ação não pode ser desfeita.`)) return
    }
    try {
      await finalizarAtividade(organizacaoId, activity.id, futuras.map((a) => a.id), activity.observation)
      toast.success(futuras.length > 0 ? `Atividade finalizada e removida de ${futuras.length} dia(s)` : 'Atividade finalizada')
      fetchData(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao finalizar a atividade')
    }
  }

  const handleReprogramar = async (activityId: string, novaData: string) => {
    try {
      await moverAtividadesParaDia(organizacaoId, [activityId], novaData)
      toast.success('Atividade reprogramada')
      fetchData(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reprogramar')
    }
  }

  const handleAdicionarNaoRealizadas = async (activityIds: string[], data: string) => {
    try {
      await moverAtividadesParaDia(organizacaoId, activityIds, data)
      toast.success(`${activityIds.length} atividade(s) trazida(s) pra ${formatShortDate(parseISODateStr(data))}`)
      fetchData(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar atividades')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteActivity(organizacaoId, id)
      toast.success('Atividade removida')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao remover'
      toast.error(msg)
    }
  }

  const handleAddExtra = async (payload: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => {
    if (!weekData?.week) return
    try {
      await addExtraActivity({ organizacaoId, weekId: weekData.week.id, ...payload })
      toast.success('Atividade extra adicionada')
      fetchData(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao adicionar'
      toast.error(msg)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={32} />
      </div>
    )
  }

  if (!weekData) {
    return (
      <div className="text-center py-16">
        <Calendar className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Erro ao carregar dados</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Verifique a conexão com o banco de dados</p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6">
      <WeekBar
        isoYear={weekData.week.iso_year}
        isoWeek={weekData.week.iso_week}
        startDate={weekData.week.start_date}
        endDate={weekData.week.end_date}
        status={weekData.week.status}
        podeEditar={podeEditar}
        aderenciaCronograma={indicatorsCronograma.aderencia}
        aderenciaAjustada={indicators.aderencia}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={() => goto(cur.year, cur.week)}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onImportActivities={handleSearchWeekActivities}
        onComprometer={handleComprometer}
        onReabrirMontagem={handleReabrirMontagem}
        onClearWeek={handleClearWeek}
        onManageEngenheiros={() => setShowEngenheirosArea(true)}
        onExportSemanal={handleExportarSemana}
        onAnalysis={() => setShowAnalise(true)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => (
          <CardDia
            key={d}
            date={d}
            activities={activitiesByDate.get(d) ?? []}
            onOpen={setOpenDate}
            partialWeight={partialWeight}
            acertoDia={acertoPorDia.get(d) ?? null}
          />
        ))}
      </div>

      <PainelValidacaoSemana weekId={weekData.week.id} />

      <IndicadoresSemana ind={indicators} aderenciaCronograma={indicatorsCronograma.aderencia} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PainelAderencia title="Aderência por Área" rows={segArea} />
        <PainelAderencia title="Aderência por Engenheiro" rows={segEnc} />
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Indicadores calculados a partir do status registrado — PPC ponderado Credit activities with partial progress.
      </p>

      <ModalDetalheDia
        open={!!openDate}
        onOpenChange={(v) => !v && setOpenDate(null)}
        date={openDate}
        organizacaoId={organizacaoId}
        activities={openDate ? (activitiesByDate.get(openDate) ?? []) : []}
        weekDays={days}
        todasAtividadesDaSemana={activities}
        weekConsolidated={weekData.week.status === 'consolidado'}
        weekStatus={weekData.week.status}
        diaComprometido={diaComprometido}
        acertoDia={openDate ? (acertoPorDia.get(openDate) ?? null) : null}
        onSetStatus={handleSetStatus}
        onSetInativa={handleSetInativa}
        onSetForaDoPlano={handleSetForaDoPlano}
        onSetExtra={handleSetExtra}
        onFinalizar={handleFinalizarAtividade}
        onReprogramar={handleReprogramar}
        onAdicionarNaoRealizadas={handleAdicionarNaoRealizadas}
        onDelete={handleDelete}
        onRefresh={() => fetchData(false)}
        onAddExtra={handleAddExtra}
        onClearDay={() => openDate && handleClearDay(openDate)}
        onAddFromCronograma={() => openDate && handleSearchDayActivities(openDate)}
        engenheirosDisponiveis={engenheirosDisponiveis}
        areasDisponiveis={areasDoCronograma}
        onExportarImagem={() => openDate && handleExportarDia(openDate)}
        getActivityDetail={getActivityDetail}
      />

      <ModalImportarAtividades
        open={showWeekActivities}
        onOpenChange={setShowWeekActivities}
        activities={weekActivities}
        loading={loadingWeekActivities}
        sources={importSources}
        weekId={weekData.week.id}
        organizacaoId={organizacaoId}
        weekDays={days}
        engenheirosPorArea={engenheirosPorArea}
        areaIdPorArea={areaIdPorArea}
        onImported={() => fetchData(false)}
        preSelectedKeys={
          new Set(
            activities
              .filter((a) => a.source && a.taskUid)
              .map((a) => {
                const cronogramaId = cronogramaNomeToId.get(a.source!)
                // Converte taskUid para string para corresponder ao formato de rowKey no modal
                return cronogramaId ? `${cronogramaId}::${String(a.taskUid)}` : null
              })
              .filter((k): k is string => k !== null)
          )
        }
      />

      <ModalImportarAtividades
        open={showDayImport}
        onOpenChange={setShowDayImport}
        activities={dayImportActivities}
        loading={loadingDayImport}
        sources={importSources}
        weekId={weekData.week.id}
        organizacaoId={organizacaoId}
        weekDays={dayImportDate ? [dayImportDate] : []}
        engenheirosPorArea={engenheirosPorArea}
        areaIdPorArea={areaIdPorArea}
        onImported={() => fetchData(false)}
        preSelectedKeys={
          dayImportDate
            ? new Set(
                (activitiesByDate.get(dayImportDate) ?? [])
                  .filter((a) => a.source && a.taskUid)
                  .map((a) => {
                    const cronogramaId = cronogramaNomeToId.get(a.source!)
                    // Converte taskUid para string para corresponder ao formato de rowKey no modal
                    return cronogramaId ? `${cronogramaId}::${String(a.taskUid)}` : null
                  })
                  .filter((k): k is string => k !== null)
              )
            : undefined
        }
      />

      <ModalEngenheirosArea
        open={showEngenheirosArea}
        onOpenChange={setShowEngenheirosArea}
        projetoId={currentProject?.id ?? null}
        areasDoCronograma={areasDoCronograma}
      />

      <ModalExportarImagem
        open={showExportar}
        onOpenChange={setShowExportar}
        alvo={alvoExportacao}
      />

      {/* analiseAtual vinha fixo em null: o texto era salvo em
          weeks.analise_semanal e nunca lido de volta, então reabrir a análise
          mostrava o campo vazio e sobrescrevia o que já estava gravado. */}
      {weekData?.week && (
        <ModalAnaliseSemana
          open={showAnalise}
          onClose={() => setShowAnalise(false)}
          organizacaoId={organizacaoId}
          weekId={weekData.week.id}
          weekLabel={`${weekData.week.iso_year}-S${String(weekData.week.iso_week).padStart(2, '0')}`}
          analiseAtual={weekData.week.analise_semanal ?? null}
          partialWeight={partialWeight}
          atividades={activities}
          onSaved={() => fetchData(false)}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
