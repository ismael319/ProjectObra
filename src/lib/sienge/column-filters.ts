import type { ColunaConfig } from './report-config'
import type { ItemComClassificacao } from './types'
import { paraData } from './classify'

export interface FiltroValor {
  texto?: string
  selecionados?: string[]
  de?: string
  ate?: string
  faixa?: '7' | '15' | '30'
}

export function valorColuna(item: ItemComClassificacao, key: ColunaConfig['key']): string {
  if (key === 'dias') return String(item.classificacao.dias)
  const bruto = item[key as Exclude<ColunaConfig['key'], 'dias'>]
  if (typeof bruto === 'boolean') return bruto ? 'Sim' : 'Não'
  return String(bruto ?? '')
}

export function opcoesUnicas(itens: ItemComClassificacao[], key: ColunaConfig['key']): string[] {
  const set = new Set<string>()
  for (const item of itens) {
    const v = valorColuna(item, key)
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export type FiltroRapido =
  | 'sinalizado'
  | 'lembrete'
  | 'resolvido'
  | 'critico'
  | 'nao_autorizado'

/** Busca global por texto em todos os campos livres relevantes do item. */
export function aplicarBusca(itens: ItemComClassificacao[], busca: string): ItemComClassificacao[] {
  const termo = busca.trim().toLowerCase()
  if (!termo) return itens
  return itens.filter((item) =>
    [
      item.insumo,
      item.obra,
      item.solicitante,
      item.solicitacao,
      item.fornecedor,
      item.numeroPedido,
      item.contrato,
      item.objeto,
      item.empresa,
      item.obras,
    ].some((v) => v.toLowerCase().includes(termo))
  )
}

/** Filtros rápidos por anotação/classificação (sinalizados, lembretes, etc.). Todos os ativos precisam casar. */
export function aplicarFiltrosRapidos(itens: ItemComClassificacao[], ativos: ReadonlySet<FiltroRapido>): ItemComClassificacao[] {
  if (ativos.size === 0) return itens
  const hojeISO = new Date().toISOString().slice(0, 10)
  return itens.filter((item) => {
    const a = item.anotacao
    const condicao: Record<FiltroRapido, boolean> = {
      sinalizado: a.sinalizado,
      lembrete: Boolean(a.lembreteData && a.lembreteData <= hojeISO),
      resolvido: a.status === 'resolvido',
      critico: item.classificacao.classe === 'critical',
      nao_autorizado: item.autorizado === false,
    }
    return [...ativos].every((k) => condicao[k])
  })
}

export function aplicarFiltrosColuna(
  itens: ItemComClassificacao[],
  colunas: ColunaConfig[],
  filtros: Record<string, FiltroValor>
): ItemComClassificacao[] {
  const colunasComFiltro = colunas.filter((c) => c.filtro && filtros[c.key])
  if (colunasComFiltro.length === 0) return itens

  return itens.filter((item) =>
    colunasComFiltro.every((col) => {
      const filtro = filtros[col.key]!
      const filtroTipo = col.filtro!

      if (filtroTipo.kind === 'texto') {
        if (!filtro.texto) return true
        return valorColuna(item, col.key).toLowerCase().includes(filtro.texto.toLowerCase())
      }

      if (filtroTipo.kind === 'dropdown' || filtroTipo.kind === 'chips') {
        if (!filtro.selecionados || filtro.selecionados.length === 0) return true
        return filtro.selecionados.includes(valorColuna(item, col.key))
      }

      if (filtroTipo.kind === 'dias-faixa') {
        if (!filtro.faixa) return true
        const dias = item.classificacao.dias
        if (filtro.faixa === '7') return dias > 7
        if (filtro.faixa === '15') return dias > 15
        return dias >= 30
      }

      if (filtroTipo.kind === 'data') {
        if (!filtro.de && !filtro.ate) return true
        const data = paraData(valorColuna(item, col.key))
        if (!data) return true
        if (filtro.de && data < new Date(filtro.de)) return false
        if (filtro.ate && data > new Date(filtro.ate)) return false
        return true
      }

      return true
    })
  )
}
