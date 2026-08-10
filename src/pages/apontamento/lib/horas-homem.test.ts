import { describe, it, expect } from 'vitest'
import {
  agregarHorasHomem,
  calcularHhPorItem,
  HORAS_DIA_PADRAO,
  type ApontamentoValidado,
  type CronogramaItem,
} from './horas-homem'

function apt(over: Partial<ApontamentoValidado> = {}): ApontamentoValidado {
  return { atividade_id: 'ativ-1', atividade_nome: 'Alvenaria', total: 10, data: '2026-08-10', ...over }
}

function item(over: Partial<CronogramaItem> & { id: string }): CronogramaItem {
  return { nome: over.id, atividade_id: null, pai_id: null, ...over }
}

describe('agregarHorasHomem', () => {
  it('multiplica pessoas pela jornada do dia', () => {
    const { porAtivId } = agregarHorasHomem([apt({ total: 10 })], new Map([['2026-08-10', 9]]))
    expect(porAtivId.get('ativ-1')).toBe(90)
  })

  it('sem jornada cadastrada usa a jornada padrão', () => {
    const { porAtivId } = agregarHorasHomem([apt({ total: 10 })], new Map())
    expect(porAtivId.get('ativ-1')).toBe(10 * HORAS_DIA_PADRAO)
  })

  it('soma apontamentos da mesma atividade em dias com jornadas diferentes', () => {
    const horas = new Map([
      ['2026-08-10', 8],
      ['2026-08-11', 4],
    ])
    const { porAtivId } = agregarHorasHomem(
      [apt({ total: 10, data: '2026-08-10' }), apt({ total: 10, data: '2026-08-11' })],
      horas,
    )
    expect(porAtivId.get('ativ-1')).toBe(80 + 40)
  })

  it('agrega por nome mesmo quando não há atividade_id (itens vindos de XML)', () => {
    const { porAtivId, porNome } = agregarHorasHomem(
      [apt({ atividade_id: null, atividade_nome: 'Forma', total: 5 })],
      new Map([['2026-08-10', 8]]),
    )
    expect(porAtivId.size).toBe(0)
    expect(porNome.get('Forma')).toBe(40)
  })
})

describe('calcularHhPorItem', () => {
  const agregado = (porAtivId: [string, number][] = [], porNome: [string, number][] = []) => ({
    porAtivId: new Map(porAtivId),
    porNome: new Map(porNome),
  })

  it('folha recebe as horas da própria atividade', () => {
    const hh = calcularHhPorItem([item({ id: 'a', atividade_id: 'ativ-1' })], agregado([['ativ-1', 80]]))
    expect(hh.get('a')).toBe(80)
  })

  it('pai soma os filhos', () => {
    const itens = [
      item({ id: 'pai' }),
      item({ id: 'f1', pai_id: 'pai', atividade_id: 'ativ-1' }),
      item({ id: 'f2', pai_id: 'pai', atividade_id: 'ativ-2' }),
    ]
    const hh = calcularHhPorItem(itens, agregado([['ativ-1', 30], ['ativ-2', 20]]))
    expect(hh.get('pai')).toBe(50)
    expect(hh.get('f1')).toBe(30)
  })

  it('soma acumula em três níveis', () => {
    const itens = [
      item({ id: 'raiz' }),
      item({ id: 'meio', pai_id: 'raiz' }),
      item({ id: 'folha', pai_id: 'meio', atividade_id: 'ativ-1' }),
    ]
    const hh = calcularHhPorItem(itens, agregado([['ativ-1', 15]]))
    expect(hh.get('raiz')).toBe(15)
  })

  it('folha sem atividade_id casa pelo nome', () => {
    const hh = calcularHhPorItem([item({ id: 'a', nome: 'Forma' })], agregado([], [['Forma', 40]]))
    expect(hh.get('a')).toBe(40)
  })

  it('item inativo é ignorado e não entra na soma do pai', () => {
    const itens = [
      item({ id: 'pai' }),
      item({ id: 'f1', pai_id: 'pai', atividade_id: 'ativ-1' }),
      item({ id: 'f2', pai_id: 'pai', atividade_id: 'ativ-2', ativo: false }),
    ]
    const hh = calcularHhPorItem(itens, agregado([['ativ-1', 30], ['ativ-2', 20]]))
    expect(hh.get('pai')).toBe(30)
    expect(hh.has('f2')).toBe(false)
  })

  it('atividade sem apontamento vira zero, não undefined', () => {
    const hh = calcularHhPorItem([item({ id: 'a', atividade_id: 'ativ-9' })], agregado())
    expect(hh.get('a')).toBe(0)
  })

  it('ciclo em pai_id não trava a recursão', () => {
    // Dado corrompido: dois itens apontando um pro outro. Sem proteção isso
    // estouraria a pilha.
    const itens = [item({ id: 'a', pai_id: 'b' }), item({ id: 'b', pai_id: 'a' })]
    expect(() => calcularHhPorItem(itens, agregado())).not.toThrow()
  })
})
