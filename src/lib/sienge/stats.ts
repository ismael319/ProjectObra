import type { ItemComClassificacao, TipoRelatorio } from './types'
import { parseMoeda } from './money'
import { paraData, RESOLVIDOS_CONTRATO } from './classify'

export interface CategoriaValor {
  nome: string
  valor: number
}

export interface Distribuicao {
  nome: string
  total: number
}

/** Soma de um campo monetário (total/saldo) sobre os itens. */
export function somaMoeda(itens: ItemComClassificacao[], campo: 'total' | 'saldo'): number {
  return itens.reduce((soma, i) => soma + parseMoeda(i[campo]), 0)
}

/** Agrupa por um campo de texto e soma um campo monetário, ordenado por valor (decrescente). */
export function valorPorCategoria(
  itens: ItemComClassificacao[],
  agruparPor: keyof Pick<ItemComClassificacao, 'fornecedor' | 'obra' | 'empresa' | 'obras'>,
  campo: 'total' | 'saldo',
  topN: number = 10
): CategoriaValor[] {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    const chave = String(item[agruparPor] ?? '').trim()
    if (!chave) continue
    mapa.set(chave, (mapa.get(chave) ?? 0) + parseMoeda(item[campo]))
  }
  return [...mapa.entries()]
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, topN)
}

/** Contagem de itens por um campo (situação, status, etc.), ordenado por total (decrescente). */
export function distribuicaoPorCampo(
  itens: ItemComClassificacao[],
  campo: keyof Pick<ItemComClassificacao, 'sd' | 'situacao' | 'autorizado'>
): Distribuicao[] {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    const valor = campo === 'autorizado' ? (item.autorizado ? 'Autorizado' : 'Não autorizado') : String(item[campo] ?? '').trim()
    const chave = valor || '(vazio)'
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
  }
  return [...mapa.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
}

/** Itens por mês (a partir da coluna data DD/MM/YYYY), em ordem cronológica. */
export function itensPorMes(itens: ItemComClassificacao[]): Distribuicao[] {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    const data = paraData(item.data)
    if (!data) continue
    const mes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
    mapa.set(mes, (mapa.get(mes) ?? 0) + 1)
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, total]) => ({
      nome: new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      total,
    }))
}

/** Itens que seguem "em aberto" para o tipo (mesmo critério dos cards da tela). */
export function emAbertoPorTipo(itens: ItemComClassificacao[], tipo: TipoRelatorio): ItemComClassificacao[] {
  if (tipo === 'contratos') return itens.filter((i) => !RESOLVIDOS_CONTRATO.has(i.sd))
  if (tipo === 'pedidos') return itens.filter((i) => i.classificacao.classe !== 'good')
  return itens.filter((i) => i.classificacao.classe !== 'good')
}

export interface ConsolidadoEmAberto {
  pedidos: number
  contratos: number
  total: number
}

/** Somatório dos valores em aberto entre pedidos (total) e contratos (saldo). */
export function consolidadoEmAberto(
  pedidos: ItemComClassificacao[],
  contratos: ItemComClassificacao[]
): ConsolidadoEmAberto {
  const valorPedidos = somaMoeda(emAbertoPorTipo(pedidos, 'pedidos'), 'total')
  const valorContratos = somaMoeda(emAbertoPorTipo(contratos, 'contratos'), 'saldo')
  return { pedidos: valorPedidos, contratos: valorContratos, total: valorPedidos + valorContratos }
}
