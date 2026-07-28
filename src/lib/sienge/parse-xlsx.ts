import * as XLSX from 'xlsx'
import type { SiengeItem, TipoRelatorio } from './types'
import { limparCelula, parseGenerico, type LinhaTabela } from './parse-base'

export function planilhaParaLinhas(workbook: XLSX.WorkBook): LinhaTabela[] {
  const nomeAba = workbook.SheetNames[0]
  if (!nomeAba) return []
  const planilha = workbook.Sheets[nomeAba]!
  const linhasBrutas = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, raw: false, defval: '' })
  return linhasBrutas.map((linha) => linha.map(limparCelula))
}

export async function parseXlsx(file: File): Promise<{ tipo: TipoRelatorio; itens: SiengeItem[] } | null> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: 'array' })
  const linhas = planilhaParaLinhas(workbook)
  return parseGenerico(linhas)
}
