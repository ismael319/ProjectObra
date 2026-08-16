export type StatusSetor = 'concluido' | 'em_dia' | 'atencao' | 'atrasado' | 'sem_dados'

export interface StatusSetorInfo {
  id: StatusSetor
  label: string
  cor: string
  classe: string
}

export const STATUS_SETORES: Record<StatusSetor, StatusSetorInfo> = {
  concluido: { id: 'concluido', label: 'Concluído', cor: '#16a34a', classe: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  em_dia: { id: 'em_dia', label: 'Em dia', cor: '#2563eb', classe: 'text-blue-700 bg-blue-50 border-blue-200' },
  atencao: { id: 'atencao', label: 'Atenção', cor: '#d97706', classe: 'text-amber-700 bg-amber-50 border-amber-200' },
  atrasado: { id: 'atrasado', label: 'Atrasado', cor: '#dc2626', classe: 'text-red-700 bg-red-50 border-red-200' },
  sem_dados: { id: 'sem_dados', label: 'Sem dados', cor: '#64748b', classe: 'text-slate-700 bg-slate-50 border-slate-200' },
}

/** Diferença em pontos percentuais entre o avanço concluído e o previsto. */
export function calcularDesvioSetor(previsto: number | null, concluido: number | null): number | null {
  if (previsto == null || concluido == null) return null
  return Math.round((concluido - previsto) * 100) / 100
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
}

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
