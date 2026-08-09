import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useProject } from '@/lib/project-context'
import { useProjects } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { Settings2, Eye, EyeOff, ArrowUp, ArrowDown, Check, X, Filter } from 'lucide-react'
import type { WBSActivity } from '@/lib/xml-parser'
import KPICards from '@/components/KPICards'
import { StatusPieChart, MonthlyBarChart, ProgressAreaChart } from '@/components/Charts'
import EngineeringHighlights from '@/components/EngineeringHighlights'
import WorkforceSummary from '@/components/WorkforceSummary'
import WbsTable from '@/components/WbsTable'
import WidgetFilterMenu from '@/components/WidgetFilterMenu'
import { computeColumnFilterExcludedUids, EMPTY_VALUE } from '@/components/ColumnValueFilter'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CronogramaInfo } from '@/lib/project-store'
import { useMediaQuery } from '@/lib/use-media-query'
import {
  DEFAULT_WIDGETS,
  FILTERABLE_WIDGETS,
  loadDashboardConfig,
  saveDashboardConfig,
  type WidgetConfig,
  type WidgetFiltros,
  type WidgetId,
} from '@/lib/dashboard-config'

const WIDGET_LABELS: Record<WidgetId, string> = {
  kpis: 'Cards de KPI',
  charts: 'Gráficos (status e mensal)',
  progress: 'Curva de progresso',
  engineering: 'Pontos de Engenharia',
  'people-safety': 'Mão de Obra',
  'wbs-table': 'Estrutura WBS',
}

// Explica de onde vem a informação de cada card — mostrado no balão ao passar
// o mouse, pra quem não conhece a origem dos dados não precisar adivinhar.
const WIDGET_DESCRICOES: Record<WidgetId, string> = {
  kpis: 'Indicadores gerais do cronograma: total de atividades, percentual concluído, atividades no prazo e atrasadas — calculados a partir das atividades do(s) cronograma(s) ativo(s).',
  charts: 'Gráficos de exemplo (Status dos Projetos e Projetos por Mês) — ainda ilustrativos, não conectados aos dados reais do cronograma.',
  progress: 'Curva S simplificada: compara o avanço físico previsto (linha tracejada) com o realizado (linha cheia), em % acumulado, a partir dos dados de HH do(s) cronograma(s) ativo(s).',
  engineering: 'Avanço por disciplina, próximos marcos (milestones) pendentes e as atividades mais atrasadas do cronograma.',
  'people-safety': 'Resumo do efetivo (HH apontadas e recursos ativos por grupo, a partir dos apontamentos de mão de obra).',
  'wbs-table': 'Lista completa das atividades do cronograma, organizada pela Estrutura Analítica do Projeto (EAP/WBS), com datas, progresso e status de cada item.',
}

const SEM_FILTRO: WidgetFiltros = { cronograma: 'todos', colunas: [] }

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
  const [savedWidgets, setSavedWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS)
  const [isEditing, setIsEditing] = useState(false)
  const [draftWidgets, setDraftWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS)
  const [salvando, setSalvando] = useState(false)
  const [menuAberto, setMenuAberto] = useState<{ widgetId: WidgetId; x: number; y: number } | null>(null)

  useEffect(() => {
    const organizacaoId = userProfile?.organizacao_id
    if (!organizacaoId) return
    loadDashboardConfig(organizacaoId).then(setSavedWidgets)
  }, [userProfile?.organizacao_id])

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
    setIsEditing(true)
  }

  const cancelarEdicao = () => {
    setMenuAberto(null)
    setIsEditing(false)
  }

  const salvarEdicao = async () => {
    const organizacaoId = userProfile?.organizacao_id
    if (!organizacaoId) return
    setSalvando(true)
    try {
      await saveDashboardConfig(organizacaoId, draftWidgets, user?.id ?? null)
      setSavedWidgets(draftWidgets)
      setMenuAberto(null)
      setIsEditing(false)
      toast.success('Layout da Visão Geral salvo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar layout')
    } finally {
      setSalvando(false)
    }
  }

  const alternarVisibilidade = (id: WidgetId) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)))
  }

  const moverWidget = (id: WidgetId, direcao: -1 | 1) => {
    setDraftWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id)
      const alvo = idx + direcao
      if (idx === -1 || alvo < 0 || alvo >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[alvo]] = [next[alvo], next[idx]]
      return next
    })
  }

  const atualizarFiltros = (id: WidgetId, filtros: WidgetFiltros) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, filtros } : w)))
  }

  const abrirMenuFiltro = (e: React.MouseEvent, widgetId: WidgetId) => {
    e.preventDefault()
    setMenuAberto({ widgetId, x: e.clientX, y: e.clientY })
  }

  const renderWidget = (w: WidgetConfig) => {
    switch (w.id) {
      case 'kpis':
        return <KPICards activities={activitiesParaFiltro(w.filtros)} />
      case 'charts':
        return (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <StatusPieChart />
            <MonthlyBarChart />
          </div>
        )
      case 'progress':
        return <ProgressAreaChart />
      case 'engineering':
        return <EngineeringHighlights activities={activitiesParaFiltro(w.filtros)} />
      case 'people-safety':
        return <WorkforceSummary />
      case 'wbs-table':
        return <WbsTable activities={activitiesParaFiltro(w.filtros)} />
    }
  }

  const widgetsExibidos = isEditing ? draftWidgets : savedWidgets.filter((w) => w.visible)
  const widgetDoMenu = menuAberto ? draftWidgets.find((w) => w.id === menuAberto.widgetId) : undefined

  const renderWidgetFrame = (w: WidgetConfig, idx: number) => {
    const temFiltro = FILTERABLE_WIDGETS.includes(w.id) && !!w.filtros
    return (
      <div
        key={w.id}
        className={isEditing && !w.visible ? 'opacity-40' : undefined}
        onContextMenu={isEditing && !isMobile ? (e) => abrirMenuFiltro(e, w.id) : undefined}
      >
        {isEditing && (
          <div className="flex flex-col gap-2 rounded-t-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs dark:border-gray-600 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
              <span className="truncate">{WIDGET_LABELS[w.id]}</span>
              {!w.visible && <span className="shrink-0 text-gray-400 dark:text-gray-500">(oculto)</span>}
              {temFiltro && (
                <span className="flex shrink-0 items-center gap-0.5 text-blue-600 dark:text-blue-400" title={isMobile ? undefined : 'Filtro aplicado neste card'}>
                  <Filter size={11} /> filtrado
                </span>
              )}
            </span>
            <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:items-center">
              <button
                onClick={(e) => abrirMenuFiltro(e, w.id)}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : 'Filtros do card (ou clique com o botão direito no card)'}
                aria-label={`Filtros de ${WIDGET_LABELS[w.id]}`}
              >
                <Filter size={16} className="sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={() => moverWidget(w.id, -1)}
                disabled={idx === 0}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : 'Mover para cima'}
                aria-label={`Mover ${WIDGET_LABELS[w.id]} para cima`}
              >
                <ArrowUp size={16} className="sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={() => moverWidget(w.id, 1)}
                disabled={idx === widgetsExibidos.length - 1}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : 'Mover para baixo'}
                aria-label={`Mover ${WIDGET_LABELS[w.id]} para baixo`}
              >
                <ArrowDown size={16} className="sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={() => alternarVisibilidade(w.id)}
                className="flex h-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 sm:h-auto sm:p-1"
                title={isMobile ? undefined : w.visible ? 'Ocultar' : 'Mostrar'}
                aria-label={`${w.visible ? 'Ocultar' : 'Mostrar'} ${WIDGET_LABELS[w.id]}`}
              >
                {w.visible ? <Eye size={16} className="sm:h-3.5 sm:w-3.5" /> : <EyeOff size={16} className="sm:h-3.5 sm:w-3.5" />}
              </button>
            </div>
          </div>
        )}
        {renderWidget(w)}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {podeEditarDashboard && (
        <div className="flex justify-end">
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

      {isMobile ? (
        widgetsExibidos.map(renderWidgetFrame)
      ) : (
        <TooltipProvider delayDuration={300}>
          {widgetsExibidos.map((w, idx) => {
            const temFiltro = FILTERABLE_WIDGETS.includes(w.id) && !!w.filtros
            return (
              <Tooltip key={w.id}>
                <TooltipTrigger asChild>{renderWidgetFrame(w, idx)}</TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs space-y-1.5">
                  <p className="font-semibold">{WIDGET_LABELS[w.id]}</p>
                  <p className="text-muted-foreground leading-relaxed">{WIDGET_DESCRICOES[w.id]}</p>
                  {temFiltro && w.filtros && (
                    <p className="pt-1 border-t border-border/60 text-blue-600 dark:text-blue-400">
                      Filtro ativo: {descreverFiltro(w.filtros, cronogramasAtivos)}
                    </p>
                  )}
                  {FILTERABLE_WIDGETS.includes(w.id) && !temFiltro && (
                    <p className="text-muted-foreground/70 italic">
                      No modo de edição, clique com o botão direito no card pra filtrar por cronograma ou coluna.
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      )}

      {menuAberto && widgetDoMenu && (
        <WidgetFilterMenu
          x={menuAberto.x}
          y={menuAberto.y}
          widgetId={menuAberto.widgetId}
          widgetLabel={WIDGET_LABELS[menuAberto.widgetId]}
          cronogramasAtivos={cronogramasAtivos}
          filtros={widgetDoMenu.filtros ?? SEM_FILTRO}
          onChange={(filtros) => atualizarFiltros(menuAberto.widgetId, filtros)}
          onClose={() => setMenuAberto(null)}
        />
      )}
    </div>
  )
}
