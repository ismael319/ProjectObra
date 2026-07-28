import type { Classificacao, ClassificacaoResultado, SiengeItem, TipoRelatorio } from './types'

export const DIAS_LIMITE_ATRASO = 7

/** Converte "DD/MM/YYYY" em Date à meia-noite, ou null se o formato não bater. */
export function paraData(dataStr: string): Date | null {
  const partes = dataStr?.trim().split('/')
  if (!partes || partes.length !== 3) return null
  const [d, m, y] = partes.map((p) => parseInt(p, 10))
  if (!d || !m || !y) return null
  const data = new Date(y, m - 1, d)
  return Number.isNaN(data.getTime()) ? null : data
}

/** dias = hoje - data (formato DD/MM/YYYY). Nunca é persistido — sempre recalculado na exibição. */
export function calcularDias(dataStr: string, hoje: Date = new Date()): number {
  const data = paraData(dataStr)
  if (!data) return 0
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const diffMs = hojeSemHora.getTime() - data.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/** Classes Tailwind (claro/escuro) por classificação — mesmo padrão de badgeClass usado em occurrence-types.ts. */
export const CLASSIFICACAO_BADGE: Record<Classificacao, string> = {
  good: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  serious: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
}

export const CLASSIFICACAO_ACCENT: Record<Classificacao, string> = {
  good: '#16a34a',
  warning: '#d97706',
  serious: '#ea580c',
  critical: '#dc2626',
}

export function classificarGenerico(dias: number): { classe: Classificacao; label: string } {
  if (dias >= 30) return { classe: 'critical', label: 'Crítico' }
  if (dias >= 15) return { classe: 'serious', label: 'Sério' }
  if (dias > DIAS_LIMITE_ATRASO) return { classe: 'warning', label: 'Atenção' }
  return { classe: 'good', label: 'Em dia' }
}

const RESOLVIDOS_SOLICITACAO = new Set(['Não', 'N'])
const RESOLVIDOS_PEDIDO = new Set(['Totalmente entregue', 'Cancelado'])
const RESOLVIDOS_CONTRATO = new Set(['Concluído', 'Totalmente medido', 'Rescindido'])

export function classificarItem(item: SiengeItem, tipo: TipoRelatorio, hoje?: Date): ClassificacaoResultado {
  const dias = calcularDias(item.data, hoje)

  if (tipo === 'solicitacoes') {
    if (item.autorizado === false) return { classe: 'critical', label: 'Não autorizado', dias }
    if (RESOLVIDOS_SOLICITACAO.has(item.sd)) return { classe: 'good', label: 'Atendido', dias }
  } else if (tipo === 'pedidos') {
    if (RESOLVIDOS_PEDIDO.has(item.sd)) return { classe: 'good', label: 'Resolvido', dias }
  } else if (tipo === 'contratos') {
    if (RESOLVIDOS_CONTRATO.has(item.sd)) return { classe: 'good', label: 'Resolvido', dias }
  }

  const { classe, label } = classificarGenerico(dias)
  return { classe, label, dias }
}
