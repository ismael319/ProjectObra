/** "1.234,56" (formato pt-BR do export do Sienge) -> 1234.56 */
export function parseMoeda(s: string | undefined | null): number {
  if (!s) return 0
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
}

export function formatarMoeda(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
