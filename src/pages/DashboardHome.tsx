import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import GridLayoutBase, { WidthProvider, type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { useProject } from '@/lib/project-context'
import { useProjects } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import {
  Settings2, Eye, EyeOff, ArrowUp, ArrowDown, Check, X, Filter,
  GripVertical, ImagePlus, Loader2, Download, FileDown, LayoutGrid, Plus,
} from 'lucide-react'
import type { WBSActivity } from '@/lib/xml-parser'
import KPICards from '@/components/KPICards'
import { StatusPieChart, MonthlyBarChart, ProgressAreaChart } from '@/components/Charts'
import EngineeringHighlights from '@/components/EngineeringHighlights'
import WorkforceSummary from '@/components/WorkforceSummary'
import WbsTable, { type WbsQuickFilter } from '@/components/WbsTable'
import DashboardAttention from '@/components/DashboardAttention'
import WidgetFilterMenu from '@/components/WidgetFilterMenu'
import EVMIndicators from '@/components/EVMIndicators'
import OccurrencesSummary from '@/components/OccurrencesSummary'
import ExecutiveSummary from '@/components/ExecutiveSummary'
import DashboardInspector from '@/components/DashboardInspector'
import PhotoWidgetCard from '@/components/PhotoWidgetCard'
import WidgetCatalogoPanel from '@/components/WidgetCatalogoPanel'
import KpiProjetoSnapshotCard from '@/components/KpiProjetoSnapshotCard'
import AderenciaEngenheiroCard from '@/components/AderenciaEngenheiroCard'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ColumnValueFilter, { computeColumnFilterExcludedUids, EMPTY_VALUE } from '@/components/ColumnValueFilter'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CronogramaInfo } from '@/lib/project-store'
import { useMediaQuery } from '@/lib/use-media-query'
import { useUploadFotoDashboard, useExcluirFotoDashboard } from '@/lib/dashboard-fotos-db'
import { downloadNodeAsA4Png, downloadNodeAsPdf } from '@/lib/png-export'
import {
  ASPECTO_RATIO,
  useWidgetCatalogo,
  useDashboardLayout,
  useCriarLayout,
  useSalvarInspetor,
  useSalvarWidgets,
  type DashboardWidgetInstance,
  type InspetorValores,
  type WidgetFiltros,
  type WidgetTipo,
} from '@/lib/dashboard-widgets-db'

// WidthProvider precisa ser aplicado uma vez só, fora do componente — senão
// cada render remonta a lib de grid do zero (perde estado de drag em curso).
const GridLayout = WidthProvider(GridLayoutBase)

// Únicos tipos com dado vindo das atividades do cronograma (WBSActivity) —
// os outros (EVM, Curva S, Ocorrências, Mão de Obra, snapshot, foto) usam
// fonte própria, sem esse vínculo.
const FILTERABLE_TIPOS = ['KPIS', 'CHARTS', 'ENGINEERING', 'WBS_TABLE']

const SEM_FILTRO: WidgetFiltros = { cronograma: 'todos', colunas: [] }
const DEFAULT_INSPETOR: InspetorValores = { aspecto: '16:9', fonte: 14, tema: 'claro', grade: 32 }

function temFiltroAtivo(filtros: WidgetFiltros | undefined): boolean {
  return !!filtros && (filtros.cronograma !== 'todos' || filtros.colunas.length > 0)
}

function novoIdTemporario(): string {
  return `temp:${crypto.randomUUID()}`
}

function ehTemporario(id: string): boolean {
  return id.startsWith('temp:')
}

// Posição livre pro próximo widget adicionado — empilha embaixo de tudo que
// já existe, nunca sobrepõe.
function proximaPosicaoLivre(widgets: DashboardWidgetInstance[]): { x: number; y: number; w: number; h: number } {
  const maxY = widgets.reduce((acc, w) => Math.max(acc, w.pos_y + w.altura), 0)
  return { x: 0, y: maxY, w: 4, h: 6 }
}

function DashboardHomeSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando Visão Geral</span>
      <div aria-hidden="true" className="h-36 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-gray-800 sm:hidden" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div aria-hidden="true" key={index} className="h-28 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-gray-800 sm:h-36 sm:rounded-xl" />)}
      </div>
      <div aria-hidden="true" className="h-80 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-gray-800 sm:rounded-xl" />
      <div aria-hidden="true" className="h-72 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-gray-800 sm:rounded-xl" />
    </div>
  )
}

function descreverFiltro(filtros: WidgetFiltros, cronogramasAtivos: CronogramaInfo[]): string {
  const partes: string[] = []
  if (filtros.cronograma !== 'todos') {
    partes.push(`cronograma "${cronogramasAtivos[filtros.cronograma]?.nome ?? filtros.cronograma + 1}"`)
  }
  for (const c of filtros.colunas) {
    const valores = c.values.map((v) => (v === EMPTY_VALUE ? '(vazio)' : v)).join(', ')
    partes.push(`${c.label}: ${valores}`)
  }
  return partes.join(' · ')
}

export default function DashboardHome() {
  const { activities } = useProject()
  const { user, userProfile } = useAuth()
  const isMobile = useMediaQuery('(max-width: 639px)')
  // Nomes reais dos cronogramas ativos (sourceCronogramaIndex é só a posição
  // nessa mesma lista — project-context.tsx > setMultipleProjects) — pra
  // mostrar "728 001 FS..." no filtro em vez de "Cronograma 1".
  const { currentProject } = useProjects()
  const cronogramasAtivos = useMemo(
    () => (currentProject?.cronogramas ?? []).filter((c) => c.ativo),
    [currentProject]
  )

  const podeEditarDashboard = userProfile?.papel === 'edicao' || userProfile?.is_super_admin === true
  const projetoId = currentProject?.id

  const { data: catalogo = [] } = useWidgetCatalogo()
  const { data: layoutData, isLoading: configLoading } = useDashboardLayout(projetoId)
  const criarLayoutMut = useCriarLayout()
  const salvarInspetorMut = useSalvarInspetor()
  const salvarWidgetsMut = useSalvarWidgets()
  const uploadFotoMut = useUploadFotoDashboard()
  const excluirFotoMut = useExcluirFotoDashboard()

  const catalogoPorCodigo = useMemo(() => {
    const mapa = new Map<string, WidgetTipo>()
    for (const t of catalogo) mapa.set(t.codigo, t)
    return mapa
  }, [catalogo])

  const savedWidgets = useMemo(() => layoutData?.widgets ?? [], [layoutData])
  const savedInspetor: InspetorValores = layoutData?.layout
    ? { aspecto: layoutData.layout.aspecto, fonte: layoutData.layout.fonte, tema: layoutData.layout.tema, grade: layoutData.layout.grade }
    : DEFAULT_INSPETOR

  const [isEditing, setIsEditing] = useState(false)
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetInstance[]>([])
  const [draftInspetor, setDraftInspetor] = useState<InspetorValores>(DEFAULT_INSPETOR)
  const [idsParaExcluir, setIdsParaExcluir] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [menuAberto, setMenuAberto] = useState<{ widgetId: string; x: number; y: number } | null>(null)
  const [wbsQuickFilter, setWbsQuickFilter] = useState<WbsQuickFilter>('todas')
  const [wbsSearchResetKey, setWbsSearchResetKey] = useState(0)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [exportando, setExportando] = useState(false)
  const wbsSectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filtro global: uma única seleção de cronograma/colunas aplicada a TODOS os
  // cards filtráveis de uma vez. É materializado nos `filtros` de cada card
  // (que é o que a config salva), então não precisa de registro próprio.
  const [filtroGlobal, setFiltroGlobal] = useState<WidgetFiltros>(SEM_FILTRO)

  useEffect(() => {
    if (!isMobile) setWbsQuickFilter('todas')
  }, [isMobile])

  const activitiesParaFiltro = (filtros: WidgetFiltros | undefined): WBSActivity[] => {
    if (!filtros) return activities
    const porCronograma = (a: WBSActivity) =>
      filtros.cronograma === 'todos' || (a.sourceCronogramaIndex ?? 0) === filtros.cronograma
    if (filtros.colunas.length === 0) {
      return activities.filter(porCronograma)
    }
    // computeColumnFilterExcludedUids trabalha com uid cru, que não é único entre
    // cronogramas mesclados (cada XML do MS Project numera a partir de 1) — por
    // isso a exclusão é calculada por cronograma de origem (mesma lista bruta
    // usada no menu de filtro) e cruzada por (sourceCronogramaIndex, uid), do
    // jeito já estabelecido pro resto da Visão Geral.
    const excluidosPorCronograma = new Map<number, Set<number>>()
    cronogramasAtivos.forEach((c, idx) => {
      excluidosPorCronograma.set(
        idx,
        computeColumnFilterExcludedUids(c.dados?.activities || [], filtros.colunas, c.dados?.customFieldDefs || [])
      )
    })
    return activities.filter((a) => {
      if (!porCronograma(a)) return false
      const idx = a.sourceCronogramaIndex ?? 0
      return !excluidosPorCronograma.get(idx)?.has(a.uid)
    })
  }

  const iniciarEdicao = () => {
    setDraftWidgets(savedWidgets)
    setDraftInspetor(savedInspetor)
    setIdsParaExcluir([])
    setIsEditing(true)
  }

  const cancelarEdicao = () => {
    setMenuAberto(null)
    setIsEditing(false)
  }

  const salvarEdicao = async () => {
    if (!projetoId) return
    setSalvando(true)
    try {
      let layoutId = layoutData?.layout?.id
      if (!layoutId) {
        const novo = await criarLayoutMut.mutateAsync({ projetoId, userId: user?.id ?? null })
        layoutId = novo.id
      }
      await salvarInspetorMut.mutateAsync({ layoutId, projetoId, ...draftInspetor, userId: user?.id ?? null })
      await salvarWidgetsMut.mutateAsync({
        projetoId,
        upserts: draftWidgets.map((w) => ({
          id: ehTemporario(w.id) ? undefined : w.id,
          dashboard_layout_id: layoutId!,
          widget_tipo_codigo: w.widget_tipo_codigo,
          titulo_customizado: w.titulo_customizado,
          configuracao: w.configuracao,
          visivel: w.visivel,
          pos_x: w.pos_x,
          pos_y: w.pos_y,
          largura: w.largura,
          altura: w.altura,
        })),
        idsParaExcluir,
      })
      setMenuAberto(null)
      setIsEditing(false)
      toast.success('Dashboard salvo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar dashboard')
    } finally {
      setSalvando(false)
    }
  }

  const alternarVisibilidade = (id: string) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, visivel: !w.visivel } : w)))
  }

  const moverWidget = (id: string, direcao: -1 | 1) => {
    setDraftWidgets((prev) => {
      const ordenados = [...prev].sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x)
      const idx = ordenados.findIndex((w) => w.id === id)
      const alvo = idx + direcao
      if (idx === -1 || alvo < 0 || alvo >= ordenados.length) return prev
      const a = ordenados[idx]
      const b = ordenados[alvo]
      return prev.map((w) => (w.id === a.id ? { ...w, pos_y: b.pos_y } : w.id === b.id ? { ...w, pos_y: a.pos_y } : w))
    })
  }

  const atualizarFiltros = (id: string, filtros: WidgetFiltros) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, configuracao: { ...w.configuracao, filtros } } : w)))
  }

  const paraUpsert = (w: DashboardWidgetInstance) => ({
    id: ehTemporario(w.id) ? undefined : w.id,
    dashboard_layout_id: w.dashboard_layout_id,
    widget_tipo_codigo: w.widget_tipo_codigo,
    titulo_customizado: w.titulo_customizado,
    configuracao: w.configuracao,
    visivel: w.visivel,
    pos_x: w.pos_x,
    pos_y: w.pos_y,
    largura: w.largura,
    altura: w.altura,
  })

  // Espelha um filtro em todos os cards filtráveis de uma vez. No modo de
  // edição só mexe no rascunho; fora dele, persiste na hora (o "Salvar"
  // normal cobre o resto dos casos).
  const aplicarFiltroGlobal = async (filtros: WidgetFiltros) => {
    setFiltroGlobal(filtros)
    const aplicar = (lista: DashboardWidgetInstance[]) =>
      lista.map((w) => (FILTERABLE_TIPOS.includes(w.widget_tipo_codigo) ? { ...w, configuracao: { ...w.configuracao, filtros } } : w))

    if (isEditing) {
      setDraftWidgets((prev) => aplicar(prev))
      return
    }
    if (!projetoId || savedWidgets.length === 0) return
    const alterados = aplicar(savedWidgets).filter((w) => FILTERABLE_TIPOS.includes(w.widget_tipo_codigo))
    try {
      await salvarWidgetsMut.mutateAsync({ projetoId, upserts: alterados.map(paraUpsert), idsParaExcluir: [] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar filtro global')
    }
  }

  const abrirMenuFiltro = (e: React.MouseEvent, widgetId: string) => {
    e.preventDefault()
    setMenuAberto({ widgetId, x: e.clientX, y: e.clientY })
  }

  const abrirWbsComFiltro = (filter: WbsQuickFilter) => {
    setWbsQuickFilter(filter)
    setWbsSearchResetKey((key) => key + 1)
    requestAnimationFrame(() => wbsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ---------- Canvas livre (arrastar/redimensionar, só desktop) ----------

  const handleLayoutChange = (novoLayout: Layout) => {
    if (!isEditing) return
    const porId = new Map(novoLayout.map((item) => [item.i, item]))
    setDraftWidgets((prev) =>
      prev.map((w) => {
        const item = porId.get(w.id)
        return item ? { ...w, pos_x: item.x, pos_y: item.y, largura: item.w, altura: item.h } : w
      })
    )
  }

  const handleAdicionarWidget = (tipo: WidgetTipo) => {
    const pos = proximaPosicaoLivre(draftWidgets)
    const novo: DashboardWidgetInstance = {
      id: novoIdTemporario(),
      dashboard_layout_id: layoutData?.layout?.id ?? '',
      widget_tipo_codigo: tipo.codigo,
      titulo_customizado: null,
      configuracao: {},
      visivel: true,
      pos_x: pos.x,
      pos_y: pos.y,
      largura: pos.w,
      altura: pos.h,
    }
    setDraftWidgets((prev) => [...prev, novo])
  }

  const handleEscolherFoto = () => fileInputRef.current?.click()

  const handleArquivoFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    const organizacaoId = userProfile?.organizacao_id
    if (!arquivo || !organizacaoId) return
    setEnviandoFoto(true)
    try {
      const path = await uploadFotoMut.mutateAsync({ organizacaoId, arquivo })
      const pos = proximaPosicaoLivre(draftWidgets)
      const novo: DashboardWidgetInstance = {
        id: novoIdTemporario(),
        dashboard_layout_id: layoutData?.layout?.id ?? '',
        widget_tipo_codigo: 'FOTO',
        titulo_customizado: null,
        configuracao: { path },
        visivel: true,
        pos_x: pos.x,
        pos_y: pos.y,
        largura: pos.w,
        altura: pos.h,
      }
      setDraftWidgets((prev) => [...prev, novo])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar a foto')
    } finally {
      setEnviandoFoto(false)
    }
  }

  const handleExcluirWidget = (w: DashboardWidgetInstance) => {
    setDraftWidgets((prev) => prev.filter((x) => x.id !== w.id))
    if (!ehTemporario(w.id)) setIdsParaExcluir((prev) => [...prev, w.id])
    if (w.widget_tipo_codigo === 'FOTO' && w.configuracao.path) excluirFotoMut.mutate(w.configuracao.path)
  }

  const handleLegendaFoto = (id: string, legenda: string) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, configuracao: { ...w.configuracao, legenda } } : w)))
  }

  const handleExportar = async (formato: 'png' | 'pdf') => {
    if (!canvasRef.current) return
    setExportando(true)
    const fundo = inspetorAtual.tema === 'escuro' ? '#0f172a' : '#ffffff'
    try {
      if (formato === 'png') await downloadNodeAsA4Png(canvasRef.current, 'visao-geral.png', fundo)
      else await downloadNodeAsPdf(canvasRef.current, 'visao-geral.pdf', fundo)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar')
    } finally {
      setExportando(false)
    }
  }

  const renderWidget = (w: DashboardWidgetInstance) => {
    switch (w.widget_tipo_codigo) {
      case 'KPIS':
        return <KPICards activities={activitiesParaFiltro(w.configuracao.filtros)} />
      case 'EVM':
        return <EVMIndicators />
      case 'CHARTS':
        if (isMobile) {
          return (
            <div className="rounded-b-xl border border-t-0 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400">
              Gráficos demonstrativos ocultos no mobile.
            </div>
          )
        }
        return (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <StatusPieChart activities={activitiesParaFiltro(w.configuracao.filtros)} />
            <MonthlyBarChart activities={activitiesParaFiltro(w.configuracao.filtros)} />
          </div>
        )
      case 'CURVA_S':
        return <ProgressAreaChart />
      case 'ENGINEERING':
        return <EngineeringHighlights activities={activitiesParaFiltro(w.configuracao.filtros)} />
      case 'OCCURRENCES':
        return <OccurrencesSummary />
      case 'WORKFORCE':
        return <WorkforceSummary projetoId={projetoId} />
      case 'ADERENCIA_ENGENHEIRO':
        return <AderenciaEngenheiroCard projetoId={projetoId} />
      case 'WBS_TABLE':
        return (
          <WbsTable
            activities={activitiesParaFiltro(w.configuracao.filtros)}
            quickFilter={wbsQuickFilter}
            onQuickFilterChange={setWbsQuickFilter}
            searchResetKey={wbsSearchResetKey}
          />
        )
      case 'KPI_PROJETO_SNAPSHOT':
        return <KpiProjetoSnapshotCard projetoId={projetoId} />
      case 'FOTO':
        return (
          <PhotoWidgetCard
            path={w.configuracao.path ?? ''}
            legenda={w.configuracao.legenda}
            editando={isEditing}
            onExcluir={() => handleExcluirWidget(w)}
            onLegendaChange={(legenda) => handleLegendaFoto(w.id, legenda)}
          />
        )
      default:
        return <div className="p-4 text-xs text-gray-400 dark:text-gray-500">Widget "{w.widget_tipo_codigo}" ainda não implementado.</div>
    }
  }

  const configAtual = isEditing ? { widgets: draftWidgets, inspetor: draftInspetor } : { widgets: savedWidgets, inspetor: savedInspetor }
  const inspetorAtual = configAtual.inspetor
  const widgetsBase = isEditing ? draftWidgets : savedWidgets.filter((w) => w.visivel)
  const widgetsExibidos = isMobile && !isEditing ? widgetsBase.filter((w) => w.widget_tipo_codigo !== 'CHARTS') : widgetsBase
  const widgetDoMenu = menuAberto ? draftWidgets.find((w) => w.id === menuAberto.widgetId) : undefined
  const codigosNoDashboard = (isEditing ? draftWidgets : savedWidgets).map((w) => w.widget_tipo_codigo)

  const renderWidgetFrame = (w: DashboardWidgetInstance, idx: number, mostrarSetas: boolean) => {
    const tipo = catalogoPorCodigo.get(w.widget_tipo_codigo)
    const nome = tipo?.nome ?? w.widget_tipo_codigo
    const temFiltro = FILTERABLE_TIPOS.includes(w.widget_tipo_codigo) && temFiltroAtivo(w.configuracao.filtros)
    return (
      <div
        ref={tipo?.codigo === 'WBS_TABLE' ? wbsSectionRef : undefined}
        className={`h-full overflow-y-auto ${isEditing && !w.visivel ? 'opacity-40' : ''}`}
        onContextMenu={isEditing && !isMobile ? (e) => abrirMenuFiltro(e, w.id) : undefined}
      >
        {isEditing && (
          <div className="flex flex-col gap-2 rounded-t-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs dark:border-gray-600 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
              {!mostrarSetas && <GripVertical size={13} className="shrink-0 cursor-grab text-gray-400" />}
              <span className="truncate">{nome}</span>
              {!w.visivel && <span className="shrink-0 text-gray-400 dark:text-gray-500">(oculto)</span>}
              {temFiltro && (
                <span className="flex shrink-0 items-center gap-0.5 text-blue-600 dark:text-blue-400" title={isMobile ? undefined : 'Filtro aplicado neste card'}>
                  <Filter size={11} /> filtrado
                </span>
              )}
            </span>
            <div className={`grid w-full gap-1 sm:flex sm:w-auto sm:items-center ${mostrarSetas ? 'grid-cols-4' : 'grid-cols-2'}`}>
              <button
                onClick={(e) => abrirMenuFiltro(e, w.id)}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : 'Filtros do card (ou clique com o botão direito no card)'}
                aria-label={`Filtros de ${nome}`}
              >
                <Filter size={16} className="sm:h-3.5 sm:w-3.5" />
              </button>
              {mostrarSetas && (
                <>
                  <button
                    onClick={() => moverWidget(w.id, -1)}
                    disabled={idx === 0}
                    className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                    title={isMobile ? undefined : 'Mover para cima'}
                    aria-label={`Mover ${nome} para cima`}
                  >
                    <ArrowUp size={16} className="sm:h-3.5 sm:w-3.5" />
                  </button>
                  <button
                    onClick={() => moverWidget(w.id, 1)}
                    disabled={idx === widgetsExibidos.length - 1}
                    className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                    title={isMobile ? undefined : 'Mover para baixo'}
                    aria-label={`Mover ${nome} para baixo`}
                  >
                    <ArrowDown size={16} className="sm:h-3.5 sm:w-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => alternarVisibilidade(w.id)}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : w.visivel ? 'Ocultar' : 'Mostrar'}
                aria-label={`${w.visivel ? 'Ocultar' : 'Mostrar'} ${nome}`}
              >
                {w.visivel ? <Eye size={16} className="sm:h-3.5 sm:w-3.5" /> : <EyeOff size={16} className="sm:h-3.5 sm:w-3.5" />}
              </button>
              {!mostrarSetas && w.widget_tipo_codigo !== 'FOTO' && (
                <button
                  onClick={() => handleExcluirWidget(w)}
                  className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 sm:h-auto sm:p-1"
                  title="Remover do dashboard"
                  aria-label={`Remover ${nome}`}
                >
                  <X size={16} className="sm:h-3.5 sm:w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
        {!isEditing && isMobile && temFiltro && w.configuracao.filtros && (
          <div className="mb-2 flex items-start gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            <Filter size={13} className="mt-0.5 shrink-0" />
            <span>Filtro ativo: {descreverFiltro(w.configuracao.filtros, cronogramasAtivos)}</span>
          </div>
        )}
        {renderWidget(w)}
      </div>
    )
  }

  if (configLoading) return <DashboardHomeSkeleton />

  const wbsWidget = widgetsExibidos.find((widget) => widget.widget_tipo_codigo === 'WBS_TABLE' && widget.visivel)
  const wbsVisivel = !!wbsWidget
  const attentionActivities = wbsWidget ? activitiesParaFiltro(wbsWidget.configuracao.filtros) : activities

  const barraSuperior = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {cronogramasAtivos.length > 0 && activities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Filter size={15} className="text-gray-400" /> Filtro global
          </span>
          {cronogramasAtivos.length > 1 && (
            <select
              value={filtroGlobal.cronograma}
              onChange={(e) =>
                aplicarFiltroGlobal({ ...filtroGlobal, cronograma: e.target.value === 'todos' ? 'todos' : Number(e.target.value) })
              }
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos os cronogramas</option>
              {cronogramasAtivos.map((c, idx) => (
                <option key={c.id} value={idx}>{c.nome}</option>
              ))}
            </select>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Colunas
                {filtroGlobal.colunas.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold text-white bg-blue-600">
                    {filtroGlobal.colunas.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
              <ColumnValueFilter
                sources={cronogramasAtivos.map((c) => ({
                  activities: c.dados?.activities || [],
                  customFieldDefs: c.dados?.customFieldDefs || [],
                }))}
                filters={filtroGlobal.colunas}
                onChange={(colunas) => aplicarFiltroGlobal({ ...filtroGlobal, colunas })}
              />
            </PopoverContent>
          </Popover>
          {filtroGlobal.cronograma !== 'todos' || filtroGlobal.colunas.length > 0 ? (
            <>
              <span
                className="text-xs text-gray-500 dark:text-gray-400 max-w-[14rem] truncate"
                title={descreverFiltro(filtroGlobal, cronogramasAtivos)}
              >
                {descreverFiltro(filtroGlobal, cronogramasAtivos)}
              </span>
              <button
                onClick={() => aplicarFiltroGlobal(SEM_FILTRO)}
                title="Limpar filtro global"
                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">todos os cronogramas</span>
          )}
        </div>
      )}

      {podeEditarDashboard && (
        <div className="flex items-center gap-2 lg:justify-end">
          {!isEditing ? (
            <button
              onClick={iniciarEdicao}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:min-h-0 sm:w-auto sm:rounded-lg sm:shadow-none"
            >
              <Settings2 size={16} /> Editar página
            </button>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                onClick={cancelarEdicao}
                disabled={salvando}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:min-h-0 sm:rounded-lg"
              >
                <X size={16} /> Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                disabled={salvando}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0 sm:rounded-lg"
              >
                <Check size={16} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const estadoVazio = widgetsExibidos.length === 0 && (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-600 dark:bg-gray-800">
      <LayoutGrid size={28} className="text-gray-300 dark:text-gray-600" />
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Esse projeto ainda não tem nenhum card no dashboard.</p>
      {podeEditarDashboard && !isEditing && (
        <button
          onClick={iniciarEdicao}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} /> Adicionar primeiro card
        </button>
      )}
    </div>
  )

  // Mobile continua com a lista empilhada de sempre — a lib de canvas
  // arrastável/redimensionável não é boa em touch/telas pequenas, então essa
  // experiência (reordenar por seta, sem foto, sem Inspector/catálogo) fica
  // só aqui.
  if (isMobile) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {barraSuperior}
        <ExecutiveSummary activities={activitiesParaFiltro(filtroGlobal)} />
        {!isEditing && (
          <DashboardAttention
            activities={attentionActivities}
            onOpenLate={wbsVisivel ? () => abrirWbsComFiltro('atrasadas') : undefined}
            onOpenActive={wbsVisivel ? () => abrirWbsComFiltro('em-andamento') : undefined}
          />
        )}
        {widgetsExibidos.length === 0
          ? estadoVazio
          : [...widgetsExibidos].sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x).map((w, idx) => (
              <div key={w.id}>{renderWidgetFrame(w, idx, true)}</div>
            ))}
        {menuAberto && widgetDoMenu && (
          <WidgetFilterMenu
            x={menuAberto.x}
            y={menuAberto.y}
            widgetId={menuAberto.widgetId}
            widgetLabel={catalogoPorCodigo.get(widgetDoMenu.widget_tipo_codigo)?.nome ?? widgetDoMenu.widget_tipo_codigo}
            suportaFiltros={FILTERABLE_TIPOS.includes(widgetDoMenu.widget_tipo_codigo)}
            cronogramasAtivos={cronogramasAtivos}
            filtros={widgetDoMenu.configuracao.filtros ?? SEM_FILTRO}
            onChange={(filtros) => atualizarFiltros(menuAberto.widgetId, filtros)}
            onClose={() => setMenuAberto(null)}
          />
        )}
      </div>
    )
  }

  // Desktop: canvas livre — cada widget/foto tem posição e tamanho próprios,
  // arrastáveis/redimensionáveis só durante a edição.
  const layout: Layout = widgetsExibidos.map((w) => ({ i: w.id, x: w.pos_x, y: w.pos_y, w: w.largura, h: w.altura }))
  const fundoCanvas = inspetorAtual.tema === 'escuro' ? 'bg-slate-900' : 'bg-white'

  return (
    <div className="space-y-4 sm:space-y-6">
      {barraSuperior}

      <ExecutiveSummary activities={activitiesParaFiltro(filtroGlobal)} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {isEditing && (
          <div className="flex flex-col gap-3 lg:w-64 lg:shrink-0">
            <DashboardInspector inspetor={draftInspetor} onChange={setDraftInspetor} />
            <button
              onClick={handleEscolherFoto}
              disabled={enviandoFoto}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {enviandoFoto ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              Adicionar foto
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleArquivoFoto} />
            <WidgetCatalogoPanel catalogo={catalogo} adicionados={codigosNoDashboard} onAdicionar={handleAdicionarWidget} />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          {widgetsExibidos.length === 0 ? (
            estadoVazio
          ) : (
            <div
              className={`rounded-2xl border border-gray-200 dark:border-gray-700 ${isEditing ? 'overflow-y-auto' : 'overflow-hidden'}`}
              style={{ aspectRatio: isEditing ? undefined : ASPECTO_RATIO[inspetorAtual.aspecto], maxHeight: isEditing ? '75vh' : undefined }}
            >
              <div ref={canvasRef} className={`p-2 ${fundoCanvas}`}>
                <TooltipProvider delayDuration={300}>
                  <GridLayout
                    layout={layout}
                    cols={12}
                    rowHeight={inspetorAtual.grade}
                    margin={[8, 8]}
                    containerPadding={[0, 0]}
                    isDraggable={isEditing}
                    isResizable={isEditing}
                    draggableCancel="button, input, select, textarea, a"
                    onLayoutChange={handleLayoutChange}
                  >
                    {widgetsExibidos.map((w, idx) => {
                      const tipo = catalogoPorCodigo.get(w.widget_tipo_codigo)
                      const temFiltro = FILTERABLE_TIPOS.includes(w.widget_tipo_codigo) && temFiltroAtivo(w.configuracao.filtros)
                      return (
                        <div key={w.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>{renderWidgetFrame(w, idx, false)}</TooltipTrigger>
                            <TooltipContent side="top" align="start" className="max-w-xs space-y-1.5">
                              <p className="font-semibold">{tipo?.nome ?? w.widget_tipo_codigo}</p>
                              {tipo?.descricao && <p className="text-muted-foreground leading-relaxed">{tipo.descricao}</p>}
                              {temFiltro && w.configuracao.filtros && (
                                <p className="pt-1 border-t border-border/60 text-blue-600 dark:text-blue-400">
                                  Filtro ativo: {descreverFiltro(w.configuracao.filtros, cronogramasAtivos)}
                                </p>
                              )}
                              {FILTERABLE_TIPOS.includes(w.widget_tipo_codigo) && !temFiltro && (
                                <p className="text-muted-foreground/70 italic">
                                  No modo de edição, clique com o botão direito no card pra filtrar por cronograma ou coluna.
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )
                    })}
                  </GridLayout>
                </TooltipProvider>
              </div>
            </div>
          )}

          {widgetsExibidos.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap gap-5 text-xs text-gray-500 dark:text-gray-400">
                <span><strong className="text-gray-900 dark:text-white">{widgetsExibidos.length}</strong> widgets</span>
                <span>Aspecto <strong className="text-gray-900 dark:text-white">{inspetorAtual.aspecto}</strong></span>
                <span>Impressão <strong className="text-emerald-600 dark:text-emerald-400">A4 auto</strong></span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportar('png')}
                  disabled={exportando}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download size={13} /> PNG A4
                </button>
                <button
                  onClick={() => handleExportar('pdf')}
                  disabled={exportando}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <FileDown size={13} /> PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {menuAberto && widgetDoMenu && (
        <WidgetFilterMenu
          x={menuAberto.x}
          y={menuAberto.y}
          widgetId={menuAberto.widgetId}
          widgetLabel={catalogoPorCodigo.get(widgetDoMenu.widget_tipo_codigo)?.nome ?? widgetDoMenu.widget_tipo_codigo}
          suportaFiltros={FILTERABLE_TIPOS.includes(widgetDoMenu.widget_tipo_codigo)}
          cronogramasAtivos={cronogramasAtivos}
          filtros={widgetDoMenu.configuracao.filtros ?? SEM_FILTRO}
          onChange={(filtros) => atualizarFiltros(menuAberto.widgetId, filtros)}
          onClose={() => setMenuAberto(null)}
        />
      )}
    </div>
  )
}
