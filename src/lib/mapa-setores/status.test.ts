import { describe, expect, it } from 'vitest'
import {
  calcularDesvioSetor,
  classificarStatusSetor,
  filtrarSetores,
  ordenarSetores,
  type FiltrosSetores,
  type SetorFiltravel,
  type SetorVisual,
} from './status'

describe('classificarStatusSetor', () => {
  it('prioriza concluído quando o realizado chega a 100%', () => {
    expect(classificarStatusSetor(95, 100)).toBe('concluido')
  })

  it('mantém o setor em dia quando realizado é igual ou maior que previsto', () => {
    expect(classificarStatusSetor(60, 60)).toBe('em_dia')
    expect(classificarStatusSetor(60, 71)).toBe('em_dia')
  })

  it('usa atenção até cinco pontos percentuais de atraso', () => {
    expect(classificarStatusSetor(60, 55)).toBe('atencao')
  })

  it('marca atraso abaixo da tolerância de cinco pontos', () => {
    expect(classificarStatusSetor(60, 54.99)).toBe('atrasado')
  })

  it('marca sem dados quando previsto ou realizado não existem', () => {
    expect(classificarStatusSetor(null, 10)).toBe('sem_dados')
    expect(classificarStatusSetor(10, null)).toBe('sem_dados')
  })
})

describe('ordenarSetores', () => {
  const setores: SetorVisual[] = [
    { id: '1', nome: 'Concluído', engenheiro: 'Ana', status: 'concluido', orfao: false, previsto: 100, concluido: 100, desvio: 0, inicio: '—', termino: '—', corEngenheiro: '#000', atualizadoEm: '' },
    { id: '2', nome: 'Atrasado maior', engenheiro: 'Bruno', status: 'atrasado', orfao: false, previsto: 80, concluido: 50, desvio: -30, inicio: '—', termino: '—', corEngenheiro: '#000', atualizadoEm: '' },
    { id: '3', nome: 'Atenção', engenheiro: 'Carlos', status: 'atencao', orfao: false, previsto: 80, concluido: 77, desvio: -3, inicio: '—', termino: '—', corEngenheiro: '#000', atualizadoEm: '' },
  ]

  it('prioriza atraso e preserva a lista original', () => {
    const ordenados = ordenarSetores(setores, 'criticidade')
    expect(ordenados.map((setor) => setor.id)).toEqual(['2', '3', '1'])
    expect(setores.map((setor) => setor.id)).toEqual(['1', '2', '3'])
  })

  it('ordena por realizado sem colocar dados ausentes no topo', () => {
    expect(ordenarSetores(setores, 'concluido').map((setor) => setor.id)).toEqual(['1', '3', '2'])
  })
})

describe('calcularDesvioSetor', () => {
  it('calcula em pontos percentuais e preserva ausência de dados', () => {
    expect(calcularDesvioSetor(68, 61.25)).toBe(-6.75)
    expect(calcularDesvioSetor(null, 61.25)).toBeNull()
  })
})

describe('filtrarSetores', () => {
  const setores: SetorFiltravel[] = [
    { id: '1', nome: 'Casa de Máquinas', engenheiro: 'João Silva', status: 'atrasado', orfao: false },
    { id: '2', nome: 'Bloco A', engenheiro: 'Maria Souza', status: 'em_dia', orfao: true },
    { id: '3', nome: 'Cobertura', engenheiro: null, status: 'sem_dados', orfao: false },
  ]

  const base: FiltrosSetores = { busca: '', status: 'todos', engenheiro: 'todos', somenteOrfaos: false }

  it('combina busca sem acento, status, responsável e vínculo órfão', () => {
    expect(filtrarSetores(setores, { ...base, busca: 'maquinas' })).toHaveLength(1)
    expect(filtrarSetores(setores, { ...base, status: 'em_dia' })).toEqual([setores[1]])
    expect(filtrarSetores(setores, { ...base, engenheiro: 'João Silva' })).toEqual([setores[0]])
    expect(filtrarSetores(setores, { ...base, somenteOrfaos: true })).toEqual([setores[1]])
  })
})
