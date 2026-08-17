import { round2 } from '@/lib/curve-utils'

export type StatusSetor = 'concluido' | 'em_dia' | 'atencao' | 'atrasado' | 'sem_dados'

export interface StatusSetorInfo {
  id: StatusSetor
  label: string
  cor: string
  classe: string
}

export const STATUS_SETORES: Record<StatusSetor, StatusSetorInfo> = {
  concluido: { id: 'concluido', label: 'Concluído', cor: '#16a34a', classe: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  em_dia: { id: 'em_dia', label: 'Em dia', cor: '#2563eb', classe: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300' },
  atencao: { id: 'atencao', label: 'Atenção', cor: '#d97706', classe: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  atrasado: { id: 'atrasado', label: 'Atrasado', cor: '#dc2626', classe: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300' },
  sem_dados: { id: 'sem_dados', label: 'Sem dados', cor: '#64748b', classe: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300' },
}

/** Diferença em pontos percentuais entre o avanço concluído e o previsto. */
export function calcularDesvioSetor(previsto: number | null, concluido: number | null): number | null {
  if (previsto == null || concluido == null) return null
  return round2(concluido - previsto)
}

/**
 * Classifica o andamento do setor. Uma diferença de até cinco pontos abaixo do
 * previsto merece atenção, mas ainda não vira atraso crítico.
 */
export function classificarStatusSetor(previsto: number | null, concluido: number | null): StatusSetor {
  if (concluido != null && concluido >= 100) return 'concluido'
  const desvio = calcularDesvioSetor(previsto, concluido)
  if (desvio == null) return 'sem_dados'
  if (desvio >= 0) return 'em_dia'
  if (desvio >= -5) return 'atencao'
  return 'atrasado'
}

export interface SetorFiltravel {
  id: string
  nome: string
  engenheiro: string | null
  status: StatusSetor
  orfao: boolean
}

export interface SetorVisual extends SetorFiltravel {
  previsto: number | null
  concluido: number | null
  desvio: number | null
  inicio: string
  termino: string
  corEngenheiro: string
  atualizadoEm: string
}

export type OrdenacaoSetores = 'criticidade' | 'nome' | 'concluido' | 'desvio' | 'engenheiro'

export interface FiltrosSetores {
  busca: string
  status: StatusSetor | 'todos'
  engenheiro: string | 'todos'
  somenteOrfaos: boolean
}

export const FILTROS_SETORES_INICIAIS: FiltrosSetores = {
  busca: '',
  status: 'todos',
  engenheiro: 'todos',
  somenteOrfaos: false,
}

function normalizar(valor: string | null | undefined) {
  return (valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function filtrarSetores<T extends SetorFiltravel>(setores: T[], filtros: FiltrosSetores): T[] {
  const busca = normalizar(filtros.busca.trim())
  return setores.filter((setor) => {
    if (busca && !normalizar(setor.nome).includes(busca) && !normalizar(setor.engenheiro).includes(busca)) return false
    if (filtros.status !== 'todos' && setor.status !== filtros.status) return false
    if (filtros.engenheiro !== 'todos' && setor.engenheiro !== filtros.engenheiro) return false
    if (filtros.somenteOrfaos && !setor.orfao) return false
    return true
  })
}

const PRIORIDADE_STATUS: Record<StatusSetor, number> = {
  atrasado: 0,
  atencao: 1,
  sem_dados: 2,
  em_dia: 3,
  concluido: 4,
}

function compararNulosNoFim(a: number | null, b: number | null, direcao: 1 | -1) {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return (a - b) * direcao
}

/** Mantém os setores mais críticos no topo sem alterar a lista recebida. */
export function ordenarSetores(setores: SetorVisual[], ordenacao: OrdenacaoSetores): SetorVisual[] {
  return [...setores].sort((a, b) => {
    if (ordenacao === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR')
    if (ordenacao === 'concluido') return compararNulosNoFim(a.concluido, b.concluido, -1) || a.nome.localeCompare(b.nome, 'pt-BR')
    if (ordenacao === 'desvio') return compararNulosNoFim(a.desvio, b.desvio, 1) || a.nome.localeCompare(b.nome, 'pt-BR')
    if (ordenacao === 'engenheiro') {
      if (a.engenheiro == null) return b.engenheiro == null ? a.nome.localeCompare(b.nome, 'pt-BR') : 1
      if (b.engenheiro == null) return -1
      return a.engenheiro.localeCompare(b.engenheiro, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
    }

    return PRIORIDADE_STATUS[a.status] - PRIORIDADE_STATUS[b.status]
      || compararNulosNoFim(a.desvio, b.desvio, 1)
      || a.nome.localeCompare(b.nome, 'pt-BR')
  })
}
