import { describe, expect, it } from 'vitest'
import type { ItemComClassificacao } from './types'
import {
  consolidadoEmAberto,
  distribuicaoPorCampo,
  emAbertoPorTipo,
  itensPorMes,
  somaMoeda,
  valorPorCategoria,
} from './stats'

function item(overrides: Partial<ItemComClassificacao>): ItemComClassificacao {
  return {
    chave: 'k',
    insumo: '',
    obra: '',
    data: '',
    solicitante: '',
    solicitacao: '',
    autorizado: true,
    dtAut: '',
    qtPendente: '',
    unidade: '',
    qtAtendida: '',
    sd: '',
    dtPrevisao: '',
    dtAtend: '',
    fornecedor: '',
    numeroPedido: '',
    precoUnitario: '',
    totalItem: '',
    contrato: '',
    objeto: '',
    empresa: '',
    obras: '',
    situacao: '',
    saldo: '',
    total: '',
    classificacao: { classe: 'good', label: 'Em dia', dias: 0 },
    anotacao: { status: 'pendente', nota: '', lembreteData: null, sinalizado: false, atualizadoEm: '' },
    ...overrides,
  }
}

describe('somaMoeda', () => {
  it('soma valores em formato pt-BR', () => {
    const itens = [
      item({ total: '1.234,56' }),
      item({ total: '765,44' }),
      item({ total: '' }),
    ]
    expect(somaMoeda(itens, 'total')).toBeCloseTo(2000)
  })
})

describe('valorPorCategoria', () => {
  it('agrupa por fornecedor somando total, ordenado decrescente', () => {
    const itens = [
      item({ fornecedor: 'A', total: '100' }),
      item({ fornecedor: 'B', total: '300' }),
      item({ fornecedor: 'A', total: '50' }),
    ]
    expect(valorPorCategoria(itens, 'fornecedor', 'total')).toEqual([
      { nome: 'B', valor: 300 },
      { nome: 'A', valor: 150 },
    ])
  })

  it('ignora linhas sem fornecedor e respeita topN', () => {
    const itens = [
      item({ fornecedor: '', total: '999' }),
      item({ fornecedor: 'X', total: '10' }),
      item({ fornecedor: 'Y', total: '20' }),
    ]
    expect(valorPorCategoria(itens, 'fornecedor', 'total', 1)).toEqual([{ nome: 'Y', valor: 20 }])
  })
})

describe('distribuicaoPorCampo', () => {
  it('conta por situação', () => {
    const itens = [
      item({ sd: 'Pendente' }),
      item({ sd: 'Pendente' }),
      item({ sd: 'Cancelado' }),
      item({ sd: '' }),
    ]
    expect(distribuicaoPorCampo(itens, 'sd')).toEqual([
      { nome: 'Pendente', total: 2 },
      { nome: 'Cancelado', total: 1 },
      { nome: '(vazio)', total: 1 },
    ])
  })

  it('normaliza autorizado para rótulo', () => {
    const itens = [item({ autorizado: true }), item({ autorizado: false })]
    expect(distribuicaoPorCampo(itens, 'autorizado')).toEqual([
      { nome: 'Autorizado', total: 1 },
      { nome: 'Não autorizado', total: 1 },
    ])
  })
})

describe('itensPorMes', () => {
  it('agrupa por mês em ordem cronológica', () => {
    const itens = [
      item({ data: '01/03/2026' }),
      item({ data: '15/02/2026' }),
      item({ data: '20/03/2026' }),
      item({ data: 'invalida' }),
    ]
    const resultado = itensPorMes(itens)
    expect(resultado.map((r) => r.total)).toEqual([1, 2])
  })
})

describe('emAbertoPorTipo e consolidadoEmAberto', () => {
  it('contratos resolvidos saem do cálculo de saldo em aberto', () => {
    const contratos = [
      item({ sd: 'Concluído', saldo: '500' }),
      item({ sd: 'Pendente', saldo: '300' }),
      item({ sd: '', saldo: '200' }),
    ]
    const pedidos = [
      item({ sd: 'Pendente', total: '100', classificacao: { classe: 'warning', label: 'Atenção', dias: 10 } }),
      item({ sd: 'Totalmente entregue', total: '400', classificacao: { classe: 'good', label: 'Resolvido', dias: 0 } }),
    ]
    expect(emAbertoPorTipo(contratos, 'contratos')).toHaveLength(2)
    const cons = consolidadoEmAberto(pedidos, contratos)
    expect(cons.pedidos).toBe(100)
    expect(cons.contratos).toBe(500)
    expect(cons.total).toBe(600)
  })
})
