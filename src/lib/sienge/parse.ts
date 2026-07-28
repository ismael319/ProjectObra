import type { SiengeItem, TipoRelatorio } from './types'
import { parseXlsx } from './parse-xlsx'
import { parseCsv } from './parse-csv'

export interface ResultadoParse {
  tipo: TipoRelatorio
  itens: SiengeItem[]
}

/**
 * Ponto único de entrada pro upload: detecta o formato pela extensão e
 * despacha pro parser correspondente. PDF ainda não é suportado — fica pra
 * uma fase futura (ver parse-base.ts, que já foi desenhado pra receber um
 * parser de PDF sem precisar mudar mais nada).
 */
export async function parseArquivoSienge(file: File): Promise<ResultadoParse> {
  const extensao = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()

  let resultado: ResultadoParse | null
  if (extensao === '.xlsx' || extensao === '.xls') {
    resultado = await parseXlsx(file)
  } else if (extensao === '.csv') {
    resultado = await parseCsv(file)
  } else if (extensao === '.pdf') {
    throw new Error('Importação de PDF ainda não é suportada — exporte o relatório do Sienge em XLSX ou CSV.')
  } else {
    throw new Error(`Formato "${extensao}" não suportado. Use XLSX ou CSV.`)
  }

  if (!resultado) {
    throw new Error(
      'Não foi possível reconhecer o tipo de relatório neste arquivo. Confira se é uma exportação do Sienge (Relação de Solicitações, Pedido de Compra ou Relação de Contratos) em XLSX ou CSV.'
    )
  }
  if (resultado.itens.length === 0) {
    throw new Error('Nenhum item foi encontrado neste arquivo.')
  }
  return resultado
}
