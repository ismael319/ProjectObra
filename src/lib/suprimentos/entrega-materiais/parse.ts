import { encontrarColuna, lerArquivoComoLinhas, normalizarTexto, type LinhaTabela, type Problema } from '@/lib/administracao/parse-shared'
import type { LinhaImportada } from './types'

export interface ResultadoParseLista {
  linhas: LinhaImportada[]
  problemas: Problema[]
  sugestaoFrente: string | null
}

const CANDIDATOS_MARCA = ['MARCA CONJUNTO', 'MARCA/CONJUNTO', 'MARCA CONJ', 'MARCA', 'CONJUNTO', 'TAG', 'PECA', 'PEÇA']
const CANDIDATOS_DESCRICAO = ['DESCRICAO', 'DESCRIÇÃO', 'DESCRICAO DA PECA', 'ITEM']
const CANDIDATOS_DIMENSOES = ['DIMENSOES', 'DIMENSÕES', 'DIMENSOES (MM)', 'DIMENSÕES (MM)', 'MEDIDAS']
const CANDIDATOS_QTD = ['QTD', 'QUANTIDADE', 'QTD PLANEJADA', 'QUANTIDADE PLANEJADA', 'QTDE']
const CANDIDATOS_PESO = ['PESO UNITARIO', 'PESO UNITÁRIO', 'PESO UNIT', 'PESO UNITARIO (KG)', 'PESO UNITÁRIO (KG)', 'PESO KG', 'PESO']

// Textos de linha de subtotal/rodapé que aparecem em planilhas reais (ex.:
// "QTD DE ELEMENTOS ... 240 ... PESO TOTAL (kg) ... 18409,8" no fim de cada
// seção) — não são peças, têm que ser puladas em silêncio.
const MARCADORES_RODAPE = ['TOTAL DE ELEMENTOS', 'QTD DE ELEMENTOS', 'PESO TOTAL GLOBAL', 'PESO TOTAL']

interface Colunas {
  marca: number
  descricao: number
  dimensoes: number
  qtd: number
  peso: number
}

/** Aceita tanto "1.234,56" (padrão BR) quanto "1234.56" (padrão US, o que o SheetJS normalmente devolve). */
function parseNumero(valor: string): number | null {
  const limpo = valor.trim()
  if (!limpo) return null
  const semMilhar = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(semMilhar)
  return Number.isFinite(n) ? n : null
}

function ehLinhaVazia(linha: LinhaTabela): boolean {
  return linha.every((c) => c === '')
}

// Planilhas reais de romaneio/lista de conjuntos costumam ter várias linhas de
// título/cliente/obra antes da tabela, e podem repetir seções (ex.:
// "CONJUNTOS COM PEÇAS ANEXADAS" / "CONJUNTOS AVULSOS"), cada uma com seu
// próprio cabeçalho de coluna. Uma linha "é cabeçalho" quando dá pra achar as
// colunas de marca e quantidade nela, mas a célula da coluna de quantidade
// NÃO é um número (numa linha de dado de verdade, sempre é).
function detectarCabecalho(linha: LinhaTabela): Colunas | null {
  const marca = encontrarColuna(linha, CANDIDATOS_MARCA)
  const qtd = encontrarColuna(linha, CANDIDATOS_QTD)
  if (marca === -1 || qtd === -1) return null
  if (parseNumero(linha[qtd] ?? '') !== null) return null

  return {
    marca,
    descricao: encontrarColuna(linha, CANDIDATOS_DESCRICAO),
    dimensoes: encontrarColuna(linha, CANDIDATOS_DIMENSOES),
    qtd,
    peso: encontrarColuna(linha, CANDIDATOS_PESO),
  }
}

function ehLinhaDeRodape(linha: LinhaTabela): boolean {
  return linha.some((c) => {
    const n = normalizarTexto(c)
    return n !== '' && MARCADORES_RODAPE.some((m) => n.includes(m))
  })
}

// Banner de seção (ex.: "CONJUNTOS AVULSOS") ou linha de título: só uma
// célula preenchida na linha inteira.
function ehBanner(linha: LinhaTabela): boolean {
  return linha.filter((c) => c !== '').length <= 1
}

const CANDIDATOS_ROTULO_OBRA = ['OBRA:', 'OBRA', 'FRENTE:', 'FRENTE']

// Cabeçalho de título das planilhas reais costuma ter uma linha
// "OBRA: | FS CAMPO NOVO-ARMAZÉM 01-70x282m" — vira sugestão pro nome da
// frente no modal de import (usuário confirma ou edita, nunca é automático).
function detectarSugestaoFrente(grid: LinhaTabela[]): string | null {
  const rotulosNorm = CANDIDATOS_ROTULO_OBRA.map(normalizarTexto)
  for (const linha of grid.slice(0, 15)) {
    const idxRotulo = linha.findIndex((c) => rotulosNorm.includes(normalizarTexto(c)))
    if (idxRotulo === -1) continue
    const valor = linha.slice(idxRotulo + 1).find((c) => c.trim() !== '')
    if (valor) return valor.trim()
  }
  return null
}

export async function parseListaMateriais(file: File): Promise<ResultadoParseLista> {
  const grid = await lerArquivoComoLinhas(file)
  if (grid.length === 0) {
    return { linhas: [], problemas: [{ linha: 0, descricao: 'Arquivo vazio ou ilegível.' }], sugestaoFrente: null }
  }

  const sugestaoFrente = detectarSugestaoFrente(grid)
  const linhas: LinhaImportada[] = []
  const problemas: Problema[] = []
  let colunas: Colunas | null = null

  for (let i = 0; i < grid.length; i++) {
    const linha = grid[i]!
    const numeroLinha = i + 1
    if (ehLinhaVazia(linha)) continue

    const possivelCabecalho = detectarCabecalho(linha)
    if (possivelCabecalho) {
      colunas = possivelCabecalho
      continue
    }

    if (!colunas) continue // ainda não achamos a tabela (linhas de título/cliente/obra)
    if (ehBanner(linha)) continue // título de seção (ex.: "CONJUNTOS AVULSOS")
    if (ehLinhaDeRodape(linha)) continue // subtotal/total da seção

    const marcaConjunto = linha[colunas.marca]?.trim() ?? ''
    const descricao = colunas.descricao !== -1 ? (linha[colunas.descricao]?.trim() ?? '') : ''
    const dimensoes = colunas.dimensoes !== -1 ? (linha[colunas.dimensoes]?.trim() ?? '') : ''
    const qtdTexto = linha[colunas.qtd]?.trim() ?? ''
    const pesoTexto = colunas.peso !== -1 ? (linha[colunas.peso]?.trim() ?? '') : ''

    if (!marcaConjunto) {
      problemas.push({ linha: numeroLinha, campo: 'Marca/Conjunto', descricao: 'Linha sem marca/conjunto — ignorada.' })
      continue
    }

    const qtdPlanejada = parseNumero(qtdTexto)
    if (qtdPlanejada === null) {
      problemas.push({ linha: numeroLinha, campo: 'Quantidade', descricao: `Quantidade inválida ("${qtdTexto}") — linha ignorada.` })
      continue
    }

    const pesoUnitarioKg = pesoTexto ? parseNumero(pesoTexto) : 0
    if (pesoUnitarioKg === null) {
      problemas.push({ linha: numeroLinha, campo: 'Peso unitário', descricao: `Peso inválido ("${pesoTexto}") — gravado como 0.` })
    }

    linhas.push({
      linha: numeroLinha,
      marcaConjunto,
      descricao,
      dimensoes,
      qtdPlanejada,
      pesoUnitarioKg: pesoUnitarioKg ?? 0,
    })
  }

  if (!colunas) {
    problemas.unshift({ linha: 1, descricao: 'Não encontrei o cabeçalho da tabela (colunas de Marca/Conjunto e Quantidade). Confira o arquivo.' })
  }

  return { linhas, problemas, sugestaoFrente }
}
