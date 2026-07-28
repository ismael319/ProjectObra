import type { SiengeItem, TipoRelatorio } from './types'
import { ITEM_VAZIO } from './types'

export type LinhaTabela = string[]

const HEADER_XLSX_SOLICITACAO = ['Nº da solicitação', 'Observação da solicitação', 'Cód. comprador']
const HEADER_XLSX_CONTRATO = ['Contrato', 'Cliente/Fornecedor', 'Objeto do Contrato']
const HEADER_XLSX_PEDIDO = ['N. do Pedido', 'Fornecedor', 'Obra']

/** Equivalente a `_celula_para_str`/`limpar_celula` do app original. */
export function limparCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/\r?\n/g, ' ').split(/\s+/).filter(Boolean).join(' ')
}

/** "YYYY-MM-DD..." -> "DD/MM/YYYY". Devolve a string original se não bater o formato. */
function normalizarData(dataStr: string): string {
  if (!dataStr) return ''
  let s = dataStr
  if (s.includes('T') || s.includes(' ')) {
    s = s.split('T')[0]!.split(' ')[0]!
  }
  const partes = s.split('-')
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`
  }
  return dataStr
}

function primeirasNColunasIguais(linha: LinhaTabela, header: string[]): boolean {
  return header.every((h, i) => (linha[i] ?? '').trim() === h)
}

function formatoContrato(linhas: LinhaTabela[]): boolean {
  return linhas.slice(0, 5).some((linha) => primeirasNColunasIguais(linha, HEADER_XLSX_CONTRATO))
}

function formatoPedido(linhas: LinhaTabela[]): boolean {
  return linhas.slice(0, 5).some((linha) => primeirasNColunasIguais(linha, HEADER_XLSX_PEDIDO))
}

function formatoSolicitacao(linhas: LinhaTabela[]): boolean {
  return linhas.slice(0, 5).some((linha) => primeirasNColunasIguais(linha, HEADER_XLSX_SOLICITACAO))
}

/** Detecta o tipo de relatório pelas 3 primeiras colunas do cabeçalho (contrato -> pedido -> solicitação, nessa ordem). */
export function detectarTitulo(linhas: LinhaTabela[]): TipoRelatorio | null {
  if (formatoContrato(linhas)) return 'contratos'
  if (formatoPedido(linhas)) return 'pedidos'
  if (formatoSolicitacao(linhas)) return 'solicitacoes'
  return null
}

function encontrarInicioDados(linhas: LinhaTabela[], header: string[]): number | null {
  for (let i = 0; i < linhas.length; i++) {
    if (primeirasNColunasIguais(linhas[i]!, header)) return i + 1
  }
  return null
}

function parseSolicitacoesXlsx(linhas: LinhaTabela[]): SiengeItem[] {
  const idxInicio = encontrarInicioDados(linhas, HEADER_XLSX_SOLICITACAO)
  if (idxInicio === null) return []

  const itens: SiengeItem[] = []
  for (const linha of linhas.slice(idxInicio)) {
    const c = linha.map((v) => (v ?? '').trim())
    if (c.length < 20) continue
    if (!c[0] || !c[5]) continue

    const solicitacao = c[0]!
    const insumo = c[5]!
    itens.push({
      ...ITEM_VAZIO,
      chave: `${solicitacao}|${insumo}`,
      insumo,
      obra: c[11] ?? '',
      data: c[12] ?? '',
      solicitante: c[13] ?? '',
      solicitacao,
      autorizado: (c[14] ?? '').trim().toLowerCase() === 'sim',
      dtAut: c[15] ?? '',
      qtPendente: c[17] ?? '',
      unidade: c[18] ?? '',
      qtAtendida: c[20] ?? '',
      sd: c[21] ?? '',
      dtPrevisao: c[23] ?? '',
      dtAtend: c[26] ?? '',
    })
  }
  return itens
}

function parseContratosXlsx(linhas: LinhaTabela[]): SiengeItem[] {
  const idxInicio = encontrarInicioDados(linhas, HEADER_XLSX_CONTRATO)
  if (idxInicio === null) return []

  const itens: SiengeItem[] = []
  for (const linha of linhas.slice(idxInicio)) {
    const c = linha.map((v) => (v ?? '').trim())
    if (c.length < 9) continue
    if (!c[0] || !c[1]) continue

    const contrato = c[0]!
    const objeto = c[2] ?? ''
    const obras = c[4] ?? ''
    const situacao = c[6] ?? ''
    const total = c[7] ?? ''
    itens.push({
      ...ITEM_VAZIO,
      chave: contrato,
      insumo: objeto,
      obra: obras,
      data: normalizarData(c[5] ?? ''),
      solicitacao: contrato,
      autorizado: true,
      sd: situacao,
      fornecedor: c[1] ?? '',
      numeroPedido: contrato,
      totalItem: total,
      total,
      contrato,
      objeto,
      empresa: c[3] ?? '',
      obras,
      situacao,
      saldo: c[8] ?? '',
    })
  }
  return itens
}

function parsePedidosXlsx(linhas: LinhaTabela[]): SiengeItem[] {
  const idxInicio = encontrarInicioDados(linhas, HEADER_XLSX_PEDIDO)
  if (idxInicio === null) return []

  const itens: SiengeItem[] = []
  for (const linha of linhas.slice(idxInicio)) {
    const c = linha.map((v) => (v ?? '').trim())
    if (c.length < 7) continue
    if (!c[0] || !c[1]) continue

    const numeroPedido = c[0]!
    const total = c[6] ?? ''
    itens.push({
      ...ITEM_VAZIO,
      chave: numeroPedido,
      obra: c[2] ?? '',
      data: c[3] ?? '',
      solicitante: c[4] ?? '',
      solicitacao: numeroPedido,
      autorizado: true,
      sd: c[5] ?? '',
      fornecedor: c[1] ?? '',
      numeroPedido,
      totalItem: total,
      total,
    })
  }
  return itens
}

/**
 * Ponto único de entrada pra transformar uma matriz de linhas (já extraída
 * de XLSX/CSV — e futuramente PDF) em itens tipados. Detecta o tipo pelo
 * cabeçalho e despacha pro parser posicional correspondente.
 */
export function parseGenerico(linhas: LinhaTabela[]): { tipo: TipoRelatorio; itens: SiengeItem[] } | null {
  const tipo = detectarTitulo(linhas)
  if (!tipo) return null

  const itens =
    tipo === 'contratos' ? parseContratosXlsx(linhas) :
    tipo === 'pedidos' ? parsePedidosXlsx(linhas) :
    parseSolicitacoesXlsx(linhas)

  return { tipo, itens }
}
