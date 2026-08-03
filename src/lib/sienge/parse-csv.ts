import type { SiengeItem, TipoRelatorio } from './types'
import { parseGenerico } from './parse-base'
import { planilhaParaLinhas } from './parse-xlsx'

export async function parseCsv(file: File): Promise<{ tipo: TipoRelatorio; itens: SiengeItem[] } | null> {
  const XLSX = await import('xlsx')
  const texto = await file.text()
  const workbook = XLSX.read(texto, { type: 'string' })
  const linhas = planilhaParaLinhas(workbook, XLSX)
  return parseGenerico(linhas)
}
