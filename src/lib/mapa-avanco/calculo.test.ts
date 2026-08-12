import { describe, it, expect } from 'vitest'
import {
  contarPorStatus,
  calcularAvanco,
  calcularAvancoGrupo,
  statusInicial,
  formatarPct,
  formatarQuantidade,
  calibrarPorExtremos,
  type MapaStatus,
  type MapaCelula,
} from './calculo'

// Catálogo do protótipo de piso: não iniciado -> concretado -> curado, mais a
// praça hachurada que não recebe piso.
const NAO_INICIADO: MapaStatus = { id: 'ni', chave: 'nao', label: 'Não iniciado', cor_hex: '#000', peso: 0, conta_no_calculo: true, ordem: 0 }
const CONCRETADO: MapaStatus = { id: 'co', chave: 'concretado', label: 'Concretado', cor_hex: '#8a97a3', peso: 0.5, conta_no_calculo: true, ordem: 1 }
const CURADO: MapaStatus = { id: 'cu', chave: 'curado', label: 'Curado', cor_hex: '#34d05c', peso: 1, conta_no_calculo: true, ordem: 2 }
const DESATIVADA: MapaStatus = { id: 'de', chave: 'desativada', label: 'Desativada', cor_hex: '#b43c3c', peso: 0, conta_no_calculo: false, ordem: 0 }

const PISO = [NAO_INICIADO, CONCRETADO, CURADO, DESATIVADA]

const SEG = 'seg-1'

function celulas(spec: [number, number, string][], segmento_id = SEG): MapaCelula[] {
  return spec.map(([linha, coluna, status_id]) => ({ segmento_id, linha, coluna, status_id }))
}

/** Grade de um segmento só — o caso mais comum (piso, telhado). */
function umSegmento(colunas: number, linhas: number, extra: Record<string, unknown> = {}) {
  return { segmentos: [{ id: SEG, colunas, linhas }], ...extra }
}

describe('statusInicial', () => {
  it('devolve o status de ordem 0', () => {
    expect(statusInicial(PISO)?.id).toBe('ni')
  })

  it('catálogo sem ordem 0 cai no de menor ordem, em vez de quebrar', () => {
    expect(statusInicial([CURADO, CONCRETADO])?.id).toBe('co')
  })

  it('catálogo vazio devolve null', () => {
    expect(statusInicial([])).toBeNull()
  })
})

describe('contarPorStatus', () => {
  it('células nunca clicadas entram no status inicial', () => {
    const c = contarPorStatus(umSegmento(4, 1), PISO, celulas([[0, 0, 'cu']]))
    expect(c.get('cu')).toBe(1)
    expect(c.get('ni')).toBe(3)
  })

  it('ignora célula fora dos limites (grade encolheu depois do apontamento)', () => {
    const c = contarPorStatus(umSegmento(2, 1), PISO, celulas([[0, 0, 'cu'], [0, 9, 'cu']]))
    expect(c.get('cu')).toBe(1)
    expect(c.get('ni')).toBe(1)
  })

  it('ignora célula apontando para status de outro catálogo', () => {
    const c = contarPorStatus(umSegmento(2, 1), PISO, celulas([[0, 0, 'fantasma']]))
    expect(c.get('ni')).toBe(2)
  })
})

describe('segmentos — várias fileiras na mesma grade', () => {
  // O caso real: estacas no perímetro do galpão. Duas fileiras longas no eixo X
  // (48 cada) e duas laterais no eixo Y (8 cada) = 112 estacas, UM contador.
  const PERIMETRO = {
    segmentos: [
      { id: 'topo', colunas: 48, linhas: 1 },
      { id: 'base', colunas: 48, linhas: 1 },
      { id: 'esq', colunas: 1, linhas: 8 },
      { id: 'dir', colunas: 1, linhas: 8 },
    ],
  }

  it('o total é a soma dos segmentos, não de um só', () => {
    const a = calcularAvanco(PERIMETRO, PISO, [])
    expect(a.totalCelulas).toBe(112)
    expect(a.totalAtivo).toBe(112)
  })

  it('pintar em fileiras diferentes soma no MESMO percentual', () => {
    const marcadas: MapaCelula[] = [
      ...celulas([[0, 0, 'cu'], [0, 1, 'cu']], 'topo'),
      ...celulas([[0, 0, 'cu']], 'base'),
      ...celulas([[0, 0, 'cu'], [1, 0, 'cu']], 'esq'),
      ...celulas([[0, 0, 'cu']], 'dir'),
    ]
    const a = calcularAvanco(PERIMETRO, PISO, marcadas)
    expect(a.etapas[1].concluidas).toBe(6)
    expect(a.etapas[1].pct).toBeCloseTo((6 / 112) * 100)
  })

  it('linha 0 / coluna 0 existe em cada fileira sem se confundir', () => {
    // Mesma coordenada em dois segmentos = duas estacas distintas.
    const marcadas: MapaCelula[] = [
      ...celulas([[0, 0, 'cu']], 'topo'),
      ...celulas([[0, 0, 'cu']], 'base'),
    ]
    const c = contarPorStatus(PERIMETRO, PISO, marcadas)
    expect(c.get('cu')).toBe(2)
  })

  it('célula de fileira excluída é ignorada, sem estourar a contagem', () => {
    const marcadas = celulas([[0, 0, 'cu'], [0, 1, 'cu']], 'fileira-que-nao-existe-mais')
    const a = calcularAvanco(PERIMETRO, PISO, marcadas)
    expect(a.etapas[1].concluidas).toBe(0)
    expect(a.totalCelulas).toBe(112)
  })

  it('a quantidade total vale para a grade inteira, não por fileira', () => {
    // 112 estacas = 112 un; 28 concluídas = 25% = 28 un
    const marcadas = celulas(
      Array.from({ length: 28 }, (_, i) => [0, i, 'cu'] as [number, number, string]),
      'topo',
    )
    const a = calcularAvanco(
      { ...PERIMETRO, quantidadeTotal: 112, unidade: 'un' },
      PISO,
      marcadas,
    )
    expect(a.etapas[1].pct).toBeCloseTo(25)
    expect(a.etapas[1].quantidade).toBeCloseTo(28)
  })
})

describe('calcularAvanco — escada acumulativa', () => {
  it('reproduz a legenda do protótipo: curado conta nas duas etapas', () => {
    // 10 células: 3 curadas, 2 concretadas, 5 intocadas
    const spec: [number, number, string][] = [
      [0, 0, 'cu'], [0, 1, 'cu'], [0, 2, 'cu'],
      [0, 3, 'co'], [0, 4, 'co'],
    ]
    const a = calcularAvanco(umSegmento(10, 1), PISO, celulas(spec))

    expect(a.etapas).toHaveLength(2)
    // Etapa 1 "lançado" = concretado + curado = 5/10
    expect(a.etapas[0].concluidas).toBe(5)
    expect(a.etapas[0].pct).toBe(50)
    // Etapa 2 "liberado" = só curado = 3/10
    expect(a.etapas[1].concluidas).toBe(3)
    expect(a.etapas[1].pct).toBe(30)
  })

  it('etapas saem ordenadas da mais inicial para a mais avançada', () => {
    const a = calcularAvanco(umSegmento(1, 1), [CURADO, NAO_INICIADO, CONCRETADO], [])
    expect(a.etapas.map((e) => e.ordem)).toEqual([1, 2])
  })

  it('ordens repetidas viram uma etapa só (não duplica o mesmo percentual)', () => {
    const gemeo: MapaStatus = { ...CURADO, id: 'cu2', chave: 'curado2', label: 'Curado B' }
    const a = calcularAvanco(umSegmento(4, 1), [NAO_INICIADO, CURADO, gemeo], [])
    expect(a.etapas).toHaveLength(1)
  })
})

describe('calcularAvanco — desativadas saem do denominador', () => {
  it('praça que não recebe piso não entra na conta', () => {
    // 10 células: 2 desativadas -> denominador 8; 4 curadas -> 50%
    const spec: [number, number, string][] = [
      [0, 0, 'de'], [0, 1, 'de'],
      [0, 2, 'cu'], [0, 3, 'cu'], [0, 4, 'cu'], [0, 5, 'cu'],
    ]
    const a = calcularAvanco(umSegmento(10, 1), PISO, celulas(spec))

    expect(a.totalCelulas).toBe(10)
    expect(a.desativadas).toBe(2)
    expect(a.totalAtivo).toBe(8)
    expect(a.etapas[1].pct).toBe(50)
  })

  it('grade inteiramente desativada devolve 0 em vez de dividir por zero', () => {
    const spec: [number, number, string][] = [[0, 0, 'de'], [0, 1, 'de']]
    const a = calcularAvanco(umSegmento(2, 1), PISO, celulas(spec))
    expect(a.totalAtivo).toBe(0)
    expect(a.pctPonderado).toBe(0)
    expect(a.etapas[0].pct).toBe(0)
  })
})

describe('calcularAvanco — ponderado', () => {
  it('concretado vale meio passo, curado vale um', () => {
    // 4 células: 1 curada (1.0) + 1 concretada (0.5) + 2 intocadas (0) = 1.5/4
    const spec: [number, number, string][] = [[0, 0, 'cu'], [0, 1, 'co']]
    const a = calcularAvanco(umSegmento(4, 1), PISO, celulas(spec))
    expect(a.pctPonderado).toBeCloseTo(37.5)
  })

  it('grade toda concluída dá 100%', () => {
    const spec: [number, number, string][] = [[0, 0, 'cu'], [0, 1, 'cu']]
    const a = calcularAvanco(umSegmento(2, 1), PISO, celulas(spec))
    expect(a.pctPonderado).toBe(100)
    expect(a.etapas[1].pct).toBe(100)
  })

  it('grade intocada dá 0%', () => {
    const a = calcularAvanco(umSegmento(5, 5), PISO, [])
    expect(a.pctPonderado).toBe(0)
    expect(a.totalAtivo).toBe(25)
  })
})

describe('calcularAvancoGrupo', () => {
  it('pondera pelo tamanho: grade pequena não mascara o atraso da grande', () => {
    const grande = calcularAvanco(umSegmento(100, 1), PISO, [])           // 0%, 100 células
    const pequena = calcularAvanco(                                                 // 100%, 10 células
      umSegmento(10, 1),
      PISO,
      celulas(Array.from({ length: 10 }, (_, i) => [0, i, 'cu'] as [number, number, string])),
    )
    const grupo = calcularAvancoGrupo([grande, pequena])

    expect(grupo.totalAtivo).toBe(110)
    // Média simples daria 50%. Ponderada dá ~9%, que é a realidade da obra.
    expect(grupo.pctPonderado).toBeCloseTo(9.09, 1)
  })

  it('grupo vazio devolve 0 em vez de NaN', () => {
    expect(calcularAvancoGrupo([]).pctPonderado).toBe(0)
  })

  it('desativadas de cada grade saem do peso dela no grupo', () => {
    const spec: [number, number, string][] = [[0, 0, 'de'], [0, 1, 'de'], [0, 2, 'de']]
    const quaseToda = calcularAvanco(umSegmento(4, 1), PISO, celulas(spec))
    expect(quaseToda.totalAtivo).toBe(1)

    const outra = calcularAvanco(umSegmento(9, 1), PISO, [])
    expect(calcularAvancoGrupo([quaseToda, outra]).totalAtivo).toBe(10)
  })
})

describe('quantidade real (m², un…)', () => {
  it('converte o percentual da etapa na medida informada', () => {
    // Telhado dividido em 100 quadrados que valem 150 m²; 30 concluídos = 45 m²
    const spec = Array.from({ length: 30 }, (_, i) => [0, i, 'cu'] as [number, number, string])
    const a = calcularAvanco(
      umSegmento(100, 1, { quantidadeTotal: 150, unidade: 'm²' }),
      PISO,
      celulas(spec),
    )
    expect(a.etapas[1].pct).toBe(30)
    expect(a.etapas[1].quantidade).toBeCloseTo(45)
    expect(a.unidade).toBe('m²')
  })

  it('a medida vale para as células que contam, não para a grade inteira', () => {
    // 100 células, 50 desativadas -> os 150 m² são das 50 restantes.
    // 25 curadas de 50 ativas = 50% = 75 m²
    const spec: [number, number, string][] = [
      ...Array.from({ length: 50 }, (_, i) => [0, i, 'de'] as [number, number, string]),
      ...Array.from({ length: 25 }, (_, i) => [0, 50 + i, 'cu'] as [number, number, string]),
    ]
    const a = calcularAvanco(
      umSegmento(100, 1, { quantidadeTotal: 150, unidade: 'm²' }),
      PISO,
      celulas(spec),
    )
    expect(a.totalAtivo).toBe(50)
    expect(a.etapas[1].pct).toBe(50)
    expect(a.etapas[1].quantidade).toBeCloseTo(75)
  })

  it('grade sem medida devolve quantidade null, sem quebrar', () => {
    const a = calcularAvanco(umSegmento(10, 1), PISO, [])
    expect(a.quantidadeTotal).toBeNull()
    expect(a.etapas[0].quantidade).toBeNull()
    expect(a.quantidadePonderada).toBeNull()
  })

  it('o ponderado também vira medida', () => {
    // 4 células = 100 m²: 1 curada (1.0) + 1 concretada (0.5) = 37.5% = 37.5 m²
    const spec: [number, number, string][] = [[0, 0, 'cu'], [0, 1, 'co']]
    const a = calcularAvanco(
      umSegmento(4, 1, { quantidadeTotal: 100, unidade: 'm²' }),
      PISO,
      celulas(spec),
    )
    expect(a.quantidadePonderada).toBeCloseTo(37.5)
  })
})

describe('quantidade no grupo', () => {
  const cheia = (colunas: number, qtd: number | null, unidade: string | null) =>
    calcularAvanco(
      umSegmento(colunas, 1, { quantidadeTotal: qtd, unidade }),
      PISO,
      celulas(Array.from({ length: colunas }, (_, i) => [0, i, 'cu'] as [number, number, string])),
    )

  it('soma as medidas quando a unidade é a mesma', () => {
    const g = calcularAvancoGrupo([cheia(10, 150, 'm²'), cheia(10, 50, 'm²')])
    expect(g.quantidadeTotal).toBe(200)
    expect(g.quantidadeConcluida).toBeCloseTo(200) // ambas 100%
    expect(g.unidade).toBe('m²')
  })

  it('unidades diferentes não somam — viraria um número sem significado', () => {
    const g = calcularAvancoGrupo([cheia(10, 150, 'm²'), cheia(10, 20, 'un')])
    expect(g.quantidadeTotal).toBeNull()
    expect(g.unidade).toBeNull()
    expect(g.pctPonderado).toBe(100) // o percentual continua válido
  })

  it('se uma grade do grupo não tem medida, o total seria parcial — devolve null', () => {
    const g = calcularAvancoGrupo([cheia(10, 150, 'm²'), cheia(10, null, null)])
    expect(g.quantidadeTotal).toBeNull()
  })
})

describe('formatarQuantidade', () => {
  it('formata em pt-BR com a unidade', () => {
    expect(formatarQuantidade(45.25, 'm²')).toBe('45,3 m²')
    expect(formatarQuantidade(1500, 'm²')).toBe('1.500 m²')
  })

  it('sem valor ou sem unidade devolve null', () => {
    expect(formatarQuantidade(null, 'm²')).toBeNull()
    expect(formatarQuantidade(10, null)).toBeNull()
  })
})

describe('calibrarPorExtremos', () => {
  const tamanho = { largura: 10, altura: 10 }
  const passoAtual = { x: 99, y: 99 }

  it('10 estacas de 100 a 1000 dão passo 100 — divide por 9 vãos, não por 10', () => {
    const c = calibrarPorExtremos({ x: 100, y: 50 }, { x: 1000, y: 50 }, 10, 1, tamanho, passoAtual)
    expect(c.passo_x).toBeCloseTo(100)
  })

  it('offset recua meio elemento: o clique marca o centro, a malha começa no canto', () => {
    const c = calibrarPorExtremos({ x: 100, y: 200 }, { x: 500, y: 600 }, 5, 5, tamanho, passoAtual)
    expect(c.offset_x).toBeCloseTo(95) // 100 - 10/2
    expect(c.offset_y).toBeCloseTo(195)
  })

  it('funciona clicando do fim para o começo', () => {
    const normal = calibrarPorExtremos({ x: 100, y: 100 }, { x: 500, y: 500 }, 5, 5, tamanho, passoAtual)
    const invertido = calibrarPorExtremos({ x: 500, y: 500 }, { x: 100, y: 100 }, 5, 5, tamanho, passoAtual)
    expect(invertido).toEqual(normal)
  })

  it('uma coluna só não define passo — mantém o atual em vez de dividir por zero', () => {
    const c = calibrarPorExtremos({ x: 100, y: 100 }, { x: 100, y: 500 }, 1, 5, tamanho, passoAtual)
    expect(c.passo_x).toBe(99)
    expect(Number.isFinite(c.passo_y)).toBe(true)
    expect(c.passo_y).toBeCloseTo(100)
  })

  it('grade de uma célula só mantém os dois passos', () => {
    const c = calibrarPorExtremos({ x: 10, y: 10 }, { x: 10, y: 10 }, 1, 1, tamanho, passoAtual)
    expect(c.passo_x).toBe(99)
    expect(c.passo_y).toBe(99)
  })

  it('malha contígua: passo igual ao tamanho quando os elementos se encostam', () => {
    // 5 praças de 30px coladas: centros de 15 a 135, passo 30
    const c = calibrarPorExtremos(
      { x: 15, y: 15 },
      { x: 135, y: 15 },
      5,
      1,
      { largura: 30, altura: 30 },
      passoAtual,
    )
    expect(c.passo_x).toBeCloseTo(30)
    expect(c.offset_x).toBeCloseTo(0)
  })
})

describe('formatarPct', () => {
  it('esconde a casa decimal quando redonda', () => {
    expect(formatarPct(29)).toBe('29%')
  })

  it('mostra uma casa quando há resto', () => {
    expect(formatarPct(76.4)).toBe('76.4%')
    expect(formatarPct(28.95)).toBe('28.9%') // toFixed(1) arredonda pra baixo: 28.95 em float é 28.9499…
  })

  it('arredonda para inteiro quando a casa decimal zera', () => {
    expect(formatarPct(29.04)).toBe('29%')
    expect(formatarPct(100)).toBe('100%')
  })
})
