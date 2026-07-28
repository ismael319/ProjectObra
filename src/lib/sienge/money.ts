/**
 * "1.234,56" (formato pt-BR do export do Sienge) -> 1234.56
 * "1234.56" (célula sem formatação pt-BR — o SheetJS devolve o número cru,
 * com ponto decimal) -> 1234.56, sem tratar o ponto como milhar
 */
export function parseMoeda(s: string | undefined | null): number {
  if (!s) return 0
  const texto = String(s).trim()
  if (!texto) return 0
  if (texto.includes(',')) {
    return parseFloat(texto.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(texto) || 0
}

export function formatarMoeda(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
