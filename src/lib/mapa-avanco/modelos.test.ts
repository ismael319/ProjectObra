import { describe, it, expect } from 'vitest'
import { MODELOS, modeloEhValido, type ModeloGrade } from './modelos'
import { calcularAvanco } from './calculo'

const entradas = Object.entries(MODELOS)

describe('modelos de mapeamento', () => {
  it.each(entradas)('%s é utilizável (tem estado inicial, etapa de avanço e chaves únicas)', (_k, modelo) => {
    expect(modeloEhValido(modelo)).toBe(true)
  })

  it.each(entradas)('%s tem pesos entre 0 e 1 — o CHECK do banco recusa fora disso', (_k, modelo) => {
    for (const s of modelo.status) {
      expect(s.peso).toBeGreaterThanOrEqual(0)
      expect(s.peso).toBeLessThanOrEqual(1)
    }
  })

  it.each(entradas)('%s: a última etapa vale 1, senão nunca chegaria a 100%%', (_k, modelo) => {
    const etapas = modelo.status.filter((s) => s.conta_no_calculo && s.ordem >= 1)
    const ultima = etapas.sort((a, b) => a.ordem - b.ordem).at(-1)
    expect(ultima?.peso).toBe(1)
  })

  it.each(entradas)('%s: peso cresce junto com a ordem', (_k, modelo) => {
    const etapas = modelo.status
      .filter((s) => s.conta_no_calculo && s.ordem >= 1)
      .sort((a, b) => a.ordem - b.ordem)
    for (let i = 1; i < etapas.length; i++) {
      expect(etapas[i].peso).toBeGreaterThan(etapas[i - 1].peso)
    }
  })

  it.each(entradas)('%s: ordens são sequenciais a partir de 1, sem buraco', (_k, modelo) => {
    const ordens = [...new Set(modelo.status.filter((s) => s.ordem >= 1).map((s) => s.ordem))].sort(
      (a, b) => a - b,
    )
    expect(ordens).toEqual(Array.from({ length: ordens.length }, (_, i) => i + 1))
  })

  it('cobre os serviços que a obra pediu', () => {
    expect(Object.keys(MODELOS)).toEqual(
      expect.arrayContaining(['estacas', 'blocos', 'alvenaria', 'premoldados', 'piso', 'telhas']),
    )
  })

  it('estaca é círculo; o resto é retângulo', () => {
    expect(MODELOS.estacas.forma).toBe('circulo')
    expect(MODELOS.blocos.forma).toBe('retangulo')
    expect(MODELOS.piso.forma).toBe('retangulo')
  })

  it('serviços medidos por área sugerem m²; os contáveis, unidade', () => {
    expect(MODELOS.piso.unidade).toBe('m²')
    expect(MODELOS.telhas.unidade).toBe('m²')
    expect(MODELOS.alvenaria.unidade).toBe('m²')
    expect(MODELOS.estacas.unidade).toBe('un')
    expect(MODELOS.blocos.unidade).toBe('un')
  })
})

describe('modeloEhValido', () => {
  const base: ModeloGrade = MODELOS.estacas

  it('recusa modelo sem estado inicial', () => {
    const semInicial = { ...base, status: base.status.filter((s) => s.ordem >= 1) }
    expect(modeloEhValido(semInicial)).toBe(false)
  })

  it('recusa modelo sem nenhuma etapa de avanço', () => {
    const semAvanco = { ...base, status: base.status.filter((s) => s.ordem === 0) }
    expect(modeloEhValido(semAvanco)).toBe(false)
  })

  it('recusa chave repetida — o UNIQUE (grade_id, chave) do banco quebraria', () => {
    const repetido = {
      ...base,
      status: [...base.status, { ...base.status[1] }],
    }
    expect(modeloEhValido(repetido)).toBe(false)
  })
})

describe('modelos rodando no cálculo de verdade', () => {
  const seg = { segmentos: [{ id: 's', colunas: 10, linhas: 1 }] }

  it('blocos: marcar tudo como concretado dá 100% nas três etapas', () => {
    const m = MODELOS.blocos
    const concretado = m.status.find((s) => s.chave === 'concretado')!
    const celulas = Array.from({ length: 10 }, (_, i) => ({
      segmento_id: 's',
      linha: 0,
      coluna: i,
      status_id: concretado.chave,
    }))
    const status = m.status.map((s) => ({ ...s, id: s.chave }))
    const a = calcularAvanco(seg, status, celulas)

    expect(a.etapas).toHaveLength(3)
    expect(a.etapas.every((e) => e.pct === 100)).toBe(true)
    expect(a.pctPonderado).toBe(100)
  })

  it('estacas: metade escavada dá 50% na etapa 1 e 0% na 2', () => {
    const m = MODELOS.estacas
    const status = m.status.map((s) => ({ ...s, id: s.chave }))
    const celulas = Array.from({ length: 5 }, (_, i) => ({
      segmento_id: 's',
      linha: 0,
      coluna: i,
      status_id: 'escavada',
    }))
    const a = calcularAvanco(seg, status, celulas)

    expect(a.etapas[0].pct).toBe(50) // escavadas ou além
    expect(a.etapas[1].pct).toBe(0) // nenhuma concretada
    expect(a.pctPonderado).toBeCloseTo(30) // 5 × 0,6 / 10
  })

  it('telhas: uma etapa só, sem escada intermediária', () => {
    const status = MODELOS.telhas.status.map((s) => ({ ...s, id: s.chave }))
    const a = calcularAvanco(seg, status, [])
    expect(a.etapas).toHaveLength(1)
  })
})
