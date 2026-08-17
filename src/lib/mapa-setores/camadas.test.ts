import { describe, expect, it } from 'vitest'
import { legendaDaCamada, resolverProgramacaoHoje, resultadoDaCamada, type SetorComCamada } from './camadas'

const setor: SetorComCamada = {
  id: 'setor-1', nome: 'Bloco A', engenheiro: 'Ana', corEngenheiro: '#7c3aed', status: 'em_dia', orfao: false,
  previsto: 55, concluido: 60, desvio: 5, inicio: '—', termino: '—', atualizadoEm: '', programacaoHoje: 'programada',
}

describe('camadas do mapa', () => {
  it('usa uma escala sequencial para avanço físico', () => {
    expect(resultadoDaCamada('avanco', setor)).toEqual({ cor: '#38bdf8', valor: '60% realizado' })
  })

  it('usa uma escala divergente para desvio', () => {
    expect(resultadoDaCamada('desvio', { ...setor, desvio: -6 })).toEqual({ cor: '#dc2626', valor: '-6.0 p.p.' })
    expect(resultadoDaCamada('desvio', { ...setor, desvio: 3 })).toEqual({ cor: '#16a34a', valor: '+3.0 p.p.' })
  })

  it('resume as atividades vinculadas da programação do dia', () => {
    expect(resolverProgramacaoHoje(['42'], [{ taskUid: '42', status: 'parcial' }])).toBe('em_execucao')
    expect(resolverProgramacaoHoje(['42'], [{ taskUid: '42', status: 'nao_concluida' }])).toBe('nao_concluida')
    expect(resolverProgramacaoHoje(['42'], [])).toBe('nao_programado')
  })

  it('gera legenda dinâmica para responsáveis', () => {
    expect(legendaDaCamada('responsavel', [setor]).map((item) => item.label)).toEqual(['Ana', 'Sem responsável'])
  })
})
