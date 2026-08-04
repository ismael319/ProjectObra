import { saveAs } from 'file-saver'
import type { ColunaConfig } from './report-config'
import type { ItemComClassificacao } from './types'
import { valorColuna } from './column-filters'
import { parseMoeda } from './money'

/** Valor pronto pra planilha: moeda vira número, unidade entra junto no texto. */
function valorExport(item: ItemComClassificacao, col: ColunaConfig): string | number {
  const texto = valorColuna(item, col.key)
  if (col.key === 'dias') return item.classificacao.dias
  if (col.moeda) return parseMoeda(texto)
  if (col.comUnidade) return [texto, item.unidade].filter(Boolean).join(' ')
  return texto
}

interface Props {
  titulo: string
  nomeArquivo: string
  colunas: ColunaConfig[]
  colunasDetalhe: ColunaConfig[]
  colunasVisiveis: Record<string, boolean>
  itens: ItemComClassificacao[]
}

/** Exporta a visão filtrada/ordenada da tabela (colunas principais + aba de detalhes) em XLSX. */
export async function exportarItensXlsx({ titulo, nomeArquivo, colunas, colunasDetalhe, colunasVisiveis, itens }: Props) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const principais = colunas.filter((c) => colunasVisiveis[c.key] !== false)
  const detalhes = colunasDetalhe.filter((c) => colunasVisiveis[c.key] !== false)

  const cabecalho = ['Classificação', ...principais.map((c) => c.label)]
  const linhas = itens.map((item) => [
    item.classificacao.label,
    ...principais.map((c) => valorExport(item, c)),
  ])
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas])
  ws['!cols'] = cabecalho.map((h, i) => ({ wch: i === 0 ? 14 : 22 }))
  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31))

  if (detalhes.length > 0) {
    const cabecalhoDetalhe = detalhes.map((c) => c.label)
    const linhasDetalhe = itens.map((item) => detalhes.map((c) => valorExport(item, c)))
    const wsDetalhe = XLSX.utils.aoa_to_sheet([cabecalhoDetalhe, ...linhasDetalhe])
    wsDetalhe['!cols'] = cabecalhoDetalhe.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, wsDetalhe, 'Detalhes')
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, `${nomeArquivo}.xlsx`)
}
