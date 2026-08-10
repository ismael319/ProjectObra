import { describe, it, expect } from 'vitest'
import {
  computeValidacaoStatus,
  etapasPendentes,
  agruparPorRegistro,
  type ValidacaoEtapa,
  type ValidacaoDecisao,
} from './status'

function etapa(chave: string, ordem = 0): ValidacaoEtapa {
  return {
    id: `etapa-${chave}`,
    organizacao_id: 'org-1',
    entidade: 'carga_concreto',
    chave,
    nome: chave,
    descricao: null,
    ordem,
    escopo_area: false,
    escopo_proprio: false,
    ativo: true,
  }
}

function conf(etapa_chave: string, decisao: ValidacaoDecisao = 'confirmado') {
  return { etapa_chave, decisao }
}

describe('computeValidacaoStatus', () => {
  it('nenhuma confirmação -> pendente', () => {
    expect(computeValidacaoStatus([etapa('area'), etapa('qualidade')], [])).toBe('pendente')
  })

  it('uma das duas etapas confirmada -> parcial', () => {
    expect(
      computeValidacaoStatus([etapa('area'), etapa('qualidade')], [conf('area')]),
    ).toBe('parcial')
  })

  it('todas as etapas confirmadas -> aprovado', () => {
    expect(
      computeValidacaoStatus(
        [etapa('area'), etapa('qualidade')],
        [conf('area'), conf('qualidade')],
      ),
    ).toBe('aprovado')
  })

  it('qualquer rejeição -> rejeitado, mesmo com a outra etapa confirmada', () => {
    expect(
      computeValidacaoStatus(
        [etapa('area'), etapa('qualidade')],
        [conf('area'), conf('qualidade', 'rejeitado')],
      ),
    ).toBe('rejeitado')
  })

  it('sem etapas ativas -> pendente (não aprova por vacuidade)', () => {
    expect(computeValidacaoStatus([], [])).toBe('pendente')
  })

  it('confirmação de etapa inativa é ignorada (desativar etapa não aprova retroativamente)', () => {
    // 'qualidade' saiu da lista de ativas; a confirmação dela não conta.
    expect(computeValidacaoStatus([etapa('area')], [conf('qualidade')])).toBe('pendente')
  })

  it('rejeição de etapa inativa também é ignorada', () => {
    expect(
      computeValidacaoStatus([etapa('area')], [conf('area'), conf('qualidade', 'rejeitado')]),
    ).toBe('aprovado')
  })

  it('etapa única confirmada -> aprovado', () => {
    expect(computeValidacaoStatus([etapa('area')], [conf('area')])).toBe('aprovado')
  })
})

describe('etapasPendentes', () => {
  it('devolve só as etapas sem decisão, na ordem configurada', () => {
    const etapas = [etapa('qualidade', 2), etapa('area', 1), etapa('extra', 3)]
    const pendentes = etapasPendentes(etapas, [conf('area')])
    expect(pendentes.map((e) => e.chave)).toEqual(['qualidade', 'extra'])
  })

  it('etapa rejeitada conta como decidida (não fica pendente)', () => {
    const pendentes = etapasPendentes([etapa('area')], [conf('area', 'rejeitado')])
    expect(pendentes).toEqual([])
  })
})

describe('agruparPorRegistro', () => {
  it('agrupa as confirmações pelo registro de origem', () => {
    const mapa = agruparPorRegistro([
      { registro_id: 'a', etapa_chave: 'area' },
      { registro_id: 'b', etapa_chave: 'area' },
      { registro_id: 'a', etapa_chave: 'qualidade' },
    ])
    expect(mapa.get('a')).toHaveLength(2)
    expect(mapa.get('b')).toHaveLength(1)
    expect(mapa.get('inexistente')).toBeUndefined()
  })
})
