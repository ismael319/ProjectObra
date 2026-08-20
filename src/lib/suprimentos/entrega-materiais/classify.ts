export type StatusEntrega = 'pendente' | 'parcial' | 'completo' | 'excedente'

export const STATUS_LABEL: Record<StatusEntrega, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  completo: 'Completo',
  excedente: 'Excedente',
}

// Mesmo padrão de badge claro/escuro usado em sienge/classify.ts —
// 'excedente' usa roxo (não vermelho): overdelivery é permitido de
// propósito, não é um erro, só precisa saltar aos olhos.
export const STATUS_BADGE: Record<StatusEntrega, string> = {
  pendente: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  parcial: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  completo: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  excedente: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
}

export function classificarEntrega(pct: number | null): StatusEntrega {
  if (!pct || pct <= 0) return 'pendente'
  if (pct > 1) return 'excedente'
  if (pct >= 1) return 'completo'
  return 'parcial'
}
