import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ColumnFilterState } from '@/components/ColumnValueFilter'

export type TipoVisualizacao = 'kpi_numerico' | 'grafico_linha' | 'grafico_barra' | 'grafico_pizza' | 'gauge' | 'tabela' | 'texto' | 'imagem'
export type StatusWidgetTipo = 'ativo' | 'beta' | 'planejado'
export type DashboardAspecto = '16:9' | '4:3' | '1:1'
export type DashboardTema = 'claro' | 'escuro'

export const ASPECTO_RATIO: Record<DashboardAspecto, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
}

export interface WidgetTipo {
  codigo: string
  nome: string
  descricao: string | null
  categoria: string | null
  modulo_origem: string | null
  tipo_visualizacao: TipoVisualizacao
  fonte_view: string | null
  status: StatusWidgetTipo
  ordem_exibicao: number
}

export interface DashboardLayoutRow {
  id: string
  projeto_id: string
  nome: string
  aspecto: DashboardAspecto
  fonte: number
  tema: DashboardTema
  grade: number
}

// Só os 4 campos "de canvas" do layout — usado pelo Inspector, que não
// precisa (nem deveria) saber sobre id/projeto_id/nome.
export interface InspetorValores {
  aspecto: DashboardAspecto
  fonte: number
  tema: DashboardTema
  grade: number
}

export interface WidgetFiltros {
  cronograma: number | 'todos'
  colunas: ColumnFilterState[]
}

// Overrides do widget — livre de propósito (não uma coluna por override
// possível), guardado em dashboard_widgets.configuracao. "filtros" é o
// filtro por cronograma/coluna que a Visão Geral já tinha; "path"/"legenda"
// são exclusivos do widget FOTO.
export interface WidgetConfiguracao {
  filtros?: WidgetFiltros
  path?: string
  legenda?: string
}

export interface DashboardWidgetInstance {
  id: string
  dashboard_layout_id: string
  widget_tipo_codigo: string
  titulo_customizado: string | null
  configuracao: WidgetConfiguracao
  visivel: boolean
  pos_x: number
  pos_y: number
  largura: number
  altura: number
}

const NOME_LAYOUT_PADRAO = 'Visão Geral'

export function useWidgetCatalogo() {
  return useQuery({
    queryKey: ['widget_tipos'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('widget_tipos').select('*').order('ordem_exibicao')
      if (error) throw new Error(error.message)
      return (data ?? []) as WidgetTipo[]
    },
  })
}

interface DashboardLayoutData {
  layout: DashboardLayoutRow | null
  widgets: DashboardWidgetInstance[]
}

// Não cria a linha de layout aqui — quem só visualiza (papel diferente de
// edição) não tem permissão de INSERT via RLS, e a maioria dos acessos é
// visualização. A criação é preguiçosa, no primeiro Salvar (ver
// useCriarLayout), só quando alguém que pode editar de fato mexe em algo.
export function useDashboardLayout(projetoId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard_layout', projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<DashboardLayoutData> => {
      const { data: layout, error } = await supabase
        .from('dashboard_layouts')
        .select('*')
        .eq('projeto_id', projetoId!)
        .eq('nome', NOME_LAYOUT_PADRAO)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!layout) return { layout: null, widgets: [] }

      const { data: widgets, error: errW } = await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('dashboard_layout_id', (layout as DashboardLayoutRow).id)
        .order('criado_em')
      if (errW) throw new Error(errW.message)

      return { layout: layout as DashboardLayoutRow, widgets: (widgets ?? []) as DashboardWidgetInstance[] }
    },
  })
}

export function useCriarLayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projetoId, userId }: { projetoId: string; userId: string | null }) => {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .insert({ projeto_id: projetoId, nome: NOME_LAYOUT_PADRAO, atualizado_por: userId })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as DashboardLayoutRow
    },
    onSuccess: (_data, { projetoId }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_layout', projetoId] })
    },
  })
}

export function useSalvarInspetor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      layoutId, aspecto, fonte, tema, grade, userId,
    }: { layoutId: string; projetoId: string; aspecto: DashboardAspecto; fonte: number; tema: DashboardTema; grade: number; userId: string | null }) => {
      const { error } = await supabase
        .from('dashboard_layouts')
        .update({ aspecto, fonte, tema, grade, atualizado_por: userId, atualizado_em: new Date().toISOString() })
        .eq('id', layoutId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { projetoId }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_layout', projetoId] })
    },
  })
}

interface WidgetUpsert {
  id?: string
  dashboard_layout_id: string
  widget_tipo_codigo: string
  titulo_customizado?: string | null
  configuracao: WidgetConfiguracao
  visivel: boolean
  pos_x: number
  pos_y: number
  largura: number
  altura: number
}

// Salva tudo de uma vez ao clicar "Salvar" (não a cada pixel arrastado):
// insere os widgets novos (sem id ainda), atualiza os existentes e apaga os
// removidos durante a edição. projetoId só entra pra invalidar a query certa
// depois — a coluna em si é preenchida pelo banco a partir do layout (ver
// trigger não é necessário aqui: o client já manda dashboard_layout_id
// correto, e projeto_id é redundante só pra RLS — mandado explícito abaixo).
export function useSalvarWidgets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projetoId, upserts, idsParaExcluir,
    }: { projetoId: string; upserts: WidgetUpsert[]; idsParaExcluir: string[] }) => {
      if (idsParaExcluir.length > 0) {
        const { error } = await supabase.from('dashboard_widgets').delete().in('id', idsParaExcluir)
        if (error) throw new Error(error.message)
      }
      const novos = upserts.filter((w) => !w.id)
      const existentes = upserts.filter((w) => !!w.id)

      if (novos.length > 0) {
        const { error } = await supabase.from('dashboard_widgets').insert(novos.map((w) => ({ ...w, projeto_id: projetoId })))
        if (error) throw new Error(error.message)
      }
      for (const w of existentes) {
        const { id, ...resto } = w
        const { error } = await supabase.from('dashboard_widgets').update(resto).eq('id', id!)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: (_data, { projetoId }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_layout', projetoId] })
    },
  })
}
