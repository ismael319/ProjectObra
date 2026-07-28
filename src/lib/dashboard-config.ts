import { supabase } from '@/lib/supabase'
import type { ColumnFilterState } from '@/components/ColumnValueFilter'

// Os 6 blocos que a Visão Geral já renderiza — "charts" e "people-safety"
// juntam dois componentes cada (mesma grade de 2 colunas de hoje), pra não
// precisar de um sistema de grid arrastável só pra evitar um card órfão.
export type WidgetId = 'kpis' | 'charts' | 'progress' | 'engineering' | 'people-safety' | 'wbs-table'

// Só os widgets cujos dados vêm das atividades do cronograma (WBSActivity,
// com sourceCronogramaIndex/discipline/responsible/campos personalizados)
// suportam filtro hoje — "charts" ainda é dado de exemplo fixo e
// "people-safety" vem de apontamentos/ocorrências, sem esse vínculo. Cada
// widget guarda seu próprio WidgetFiltros — filtro de um card nunca afeta
// outro, mesmo que os dois usem o mesmo tipo de widget.
export const FILTERABLE_WIDGETS: WidgetId[] = ['kpis', 'engineering', 'wbs-table']

export interface WidgetFiltros {
  cronograma: number | 'todos'
  // Mesmo filtro por coluna (disciplina, responsável, campos personalizados)
  // usado na Curva S — component/lógica compartilhados via ColumnValueFilter.
  colunas: ColumnFilterState[]
}

export interface WidgetConfig {
  id: WidgetId
  visible: boolean
  // Ausente = sem filtro (mostra tudo), igual ao comportamento de antes do
  // filtro por card existir.
  filtros?: WidgetFiltros
}

// Ordem/visibilidade de hoje — nada muda visualmente até um admin salvar
// uma customização de verdade.
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpis', visible: true },
  { id: 'charts', visible: true },
  { id: 'progress', visible: true },
  { id: 'engineering', visible: true },
  { id: 'people-safety', visible: true },
  { id: 'wbs-table', visible: true },
]

interface ConfigRow {
  widgets: unknown
}

function sanitizeColunas(raw: unknown): ColumnFilterState[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((c): c is ColumnFilterState =>
    !!c && typeof c === 'object' &&
    typeof (c as Record<string, unknown>).key === 'string' &&
    typeof (c as Record<string, unknown>).label === 'string' &&
    Array.isArray((c as Record<string, unknown>).values) &&
    ((c as Record<string, unknown>).values as unknown[]).every((v) => typeof v === 'string')
  )
}

function sanitizeFiltros(raw: unknown): WidgetFiltros | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  const cronograma = f.cronograma === 'todos' || typeof f.cronograma === 'number' ? (f.cronograma as number | 'todos') : 'todos'
  const colunas = sanitizeColunas(f.colunas)
  // "todos" sem nenhuma coluna equivale a nenhum filtro — não vale a pena
  // carregar o campo à toa.
  if (cronograma === 'todos' && colunas.length === 0) return undefined
  return { cronograma, colunas }
}

// Reconcilia o que veio salvo com a lista atual de widgets conhecidos — se um
// widget novo for adicionado depois, uma empresa com config antiga não teria
// esse id no array salvo (ficaria "ausente", não "visível por padrão"); e se
// um widget for removido, o id salvo não deve mais aparecer. A ordem final
// segue a ordem salva, com qualquer id novo (sem registro salvo) anexado ao
// final.
export function mergeWithDefaults(salvo: unknown): WidgetConfig[] {
  const validIds = new Set(DEFAULT_WIDGETS.map((w) => w.id))
  const salvoArray = Array.isArray(salvo) ? (salvo as Record<string, unknown>[]) : []

  const porId = new Map<WidgetId, Record<string, unknown>>()
  const idsSalvos: WidgetId[] = []
  for (const item of salvoArray) {
    if (typeof item.id === 'string' && validIds.has(item.id as WidgetId)) {
      const id = item.id as WidgetId
      porId.set(id, item)
      idsSalvos.push(id)
    }
  }

  const ordemFinal = [...idsSalvos, ...DEFAULT_WIDGETS.map((w) => w.id).filter((id) => !porId.has(id))]

  return ordemFinal.map((id) => {
    const item = porId.get(id)
    const visible = typeof item?.visible === 'boolean' ? item.visible : true
    const filtros = sanitizeFiltros(item?.filtros)
    return filtros ? { id, visible, filtros } : { id, visible }
  })
}

// Nunca lança — se não existir config salva ainda (empresa nova) ou a
// consulta falhar por qualquer motivo, cai silenciosamente no layout padrão
// (é o caminho esperado, não uma falha real pra avisar o usuário).
export async function loadDashboardConfig(organizacaoId: string): Promise<WidgetConfig[]> {
  try {
    const { data, error } = await supabase
      .from('dashboard_visao_geral_config')
      .select('widgets')
      .eq('organizacao_id', organizacaoId)
      .maybeSingle()
    if (error || !data) return DEFAULT_WIDGETS
    return mergeWithDefaults((data as ConfigRow).widgets)
  } catch {
    return DEFAULT_WIDGETS
  }
}

// Lança em erro — quem chama (o botão Salvar) mostra o toast, diferente do
// carregamento, onde uma config ausente é normal e não deve virar aviso.
export async function saveDashboardConfig(organizacaoId: string, widgets: WidgetConfig[], userId: string | null): Promise<void> {
  const { error } = await supabase.from('dashboard_visao_geral_config').upsert(
    {
      organizacao_id: organizacaoId,
      widgets,
      atualizado_por: userId,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'organizacao_id' }
  )
  if (error) throw new Error(error.message)
}
