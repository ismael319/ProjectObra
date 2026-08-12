import { describe, it, expect } from 'vitest'
import {
  statusWeight,
  computeIndicators,
  computeIndicatorsCronograma,
  computeIndicatorsComprometido,
  computeIndicatorsDia,
  diaComprometidoPorAtividade,
  computeWeekAnalysisSummary,
  computeSegment,
  type ActivityLike,
  type ActivityStatus,
  type BaselineActivity,
} from './adherence'

let seq = 0
function ativ(over: Partial<ActivityLike> = {}): ActivityLike {
  seq += 1
  return {
    id: `a${seq}`,
    name: `Atividade ${seq}`,
    company: null,
    discipline: null,
    area: null,
    stage: null,
    foreman: null,
    planned_date: '2026-08-10',
    planned_pct: 100,
    status: 'pendente',
    is_extra: false,
    observation: null,
    ...over,
  } as ActivityLike
}

const planejada = (status: ActivityStatus) => ativ({ status, is_extra: false })
const extra = (status: ActivityStatus) => ativ({ status, is_extra: true })

describe('statusWeight', () => {
  it('concluída vale 1, parcial vale o peso configurado, o resto vale 0', () => {
    expect(statusWeight('concluida', 0.5)).toBe(1)
    expect(statusWeight('parcial', 0.5)).toBe(0.5)
    expect(statusWeight('pendente', 0.5)).toBe(0)
    expect(statusWeight('nao_concluida', 0.5)).toBe(0)
  })

  it('respeita um peso parcial diferente de 0,5', () => {
    expect(statusWeight('parcial', 0.3)).toBe(0.3)
  })
})

describe('computeIndicators — PPC nunca passa de 100%', () => {
  it('extra concluído não infla o numerador (bug: dava 150%)', () => {
    // 2 planejadas concluídas + 1 extra concluída. Denominador = 2 planejadas.
    // Contando as concluídas sobre o conjunto errado, o PPC dava 3/2 = 150%.
    const r = computeIndicators([planejada('concluida'), planejada('concluida'), extra('concluida')])
    expect(r.ppc).toBe(1)
    expect(r.aderencia).toBe(1)
  })

  it('mesmo com vários extras concluídos o PPC fica no teto', () => {
    const r = computeIndicators([
      planejada('concluida'),
      extra('concluida'),
      extra('concluida'),
      extra('concluida'),
    ])
    expect(r.ppc).toBeLessThanOrEqual(1)
    expect(r.ppc).toBe(1)
  })
})

describe('computeIndicators — contagens batem com a base exibida', () => {
  it('os cards contam o mesmo conjunto que o denominador', () => {
    // 1 concluída + 1 pendente planejadas, mais 2 extras concluídas.
    // A tela mostra "Base: 2 atividade(s) · 2 extra(s)" — as contagens têm que
    // descrever essas 2, não as 4.
    const r = computeIndicators([
      planejada('concluida'),
      planejada('pendente'),
      extra('concluida'),
      extra('concluida'),
    ])
    expect(r.total).toBe(4)
    expect(r.extras).toBe(2)
    expect(r.concluidas).toBe(1)
    expect(r.pendentes).toBe(1)
    expect(r.concluidas + r.parciais + r.naoConcluidas + r.pendentes).toBe(r.total - r.extras)
  })

  it('a soma das contagens sempre fecha com o denominador', () => {
    const r = computeIndicators([
      planejada('concluida'),
      planejada('parcial'),
      planejada('nao_concluida'),
      planejada('pendente'),
      extra('concluida'),
      ativ({ status: 'concluida', inativa: true }),
    ])
    expect(r.concluidas + r.parciais + r.naoConcluidas + r.pendentes).toBe(4)
  })
})

describe('computeIndicators — pendentes e inativas', () => {
  it('pendente conta no denominador: tudo pendente é 0%, não indefinido', () => {
    const r = computeIndicators([planejada('pendente'), planejada('pendente')])
    expect(r.ppc).toBe(0)
    expect(r.aderencia).toBe(0)
  })

  it('inativa sai de tudo — nem a favor nem contra', () => {
    const semInativa = computeIndicators([planejada('concluida'), planejada('pendente')])
    const comInativa = computeIndicators([
      planejada('concluida'),
      planejada('pendente'),
      ativ({ status: 'nao_concluida', inativa: true }),
    ])
    expect(comInativa.aderencia).toBe(semInativa.aderencia)
    expect(comInativa.total).toBe(semInativa.total)
  })

  it('parcial vale meio crédito na aderência, mas não conta no PPC', () => {
    const r = computeIndicators([planejada('concluida'), planejada('parcial')])
    expect(r.aderencia).toBe(0.75) // (1 + 0,5) / 2
    expect(r.ppc).toBe(0.5) // só a concluída
  })

  it('sem nenhuma planejada devolve 0, sem dividir por zero', () => {
    const r = computeIndicators([extra('concluida')])
    expect(r.ppc).toBe(0)
    expect(r.aderencia).toBe(0)
    expect(Number.isNaN(r.aderencia)).toBe(false)
  })

  it('lista vazia devolve tudo zerado', () => {
    const r = computeIndicators([])
    expect(r.total).toBe(0)
    expect(r.ppc).toBe(0)
  })

  it('usa o peso parcial recebido, não 0,5 fixo', () => {
    const r = computeIndicators([planejada('parcial'), planejada('parcial')], 0.3)
    expect(r.aderencia).toBeCloseTo(0.3)
  })
})

describe('computeIndicatorsCronograma — mede o plano original', () => {
  it('item marcado Extra depois continua no denominador do plano original', () => {
    // Entrou como planejada (isExtraOriginal=false) e foi marcada Extra depois,
    // sem ser entregue: a Ajustada ignora, a do Cronograma cobra.
    const disfarcada = ativ({ status: 'nao_concluida', is_extra: true, isExtraOriginal: false })
    const atividades = [planejada('concluida'), disfarcada]

    expect(computeIndicators(atividades).aderencia).toBe(1) // "limpa"
    expect(computeIndicatorsCronograma(atividades).aderencia).toBe(0.5) // realidade
  })

  it('item inativado depois também continua contando no plano original', () => {
    const escondida = ativ({ status: 'nao_concluida', inativa: true, isExtraOriginal: false })
    const atividades = [planejada('concluida'), escondida]

    expect(computeIndicators(atividades).aderencia).toBe(1)
    expect(computeIndicatorsCronograma(atividades).aderencia).toBe(0.5)
  })

  it('sem isExtraOriginal (dado antigo) cai no is_extra atual', () => {
    const antiga = ativ({ status: 'concluida', is_extra: false, isExtraOriginal: undefined })
    expect(computeIndicatorsCronograma([antiga]).aderencia).toBe(1)
  })

  it('quando ninguém mexeu, as duas contas dão o mesmo número', () => {
    const atividades = [
      ativ({ status: 'concluida', is_extra: false, isExtraOriginal: false }),
      ativ({ status: 'pendente', is_extra: false, isExtraOriginal: false }),
    ]
    expect(computeIndicatorsCronograma(atividades).aderencia).toBe(
      computeIndicators(atividades).aderencia,
    )
  })
})

describe('computeSegment', () => {
  it('agrupa pelo campo e ordena por volume', () => {
    const linhas = computeSegment(
      [
        ativ({ foreman: 'Ana', status: 'concluida' }),
        ativ({ foreman: 'Ana', status: 'pendente' }),
        ativ({ foreman: 'Beto', status: 'concluida' }),
      ],
      'foreman',
    )
    expect(linhas.map((l) => l.name)).toEqual(['Ana', 'Beto'])
    expect(linhas[0].pct).toBe(0.5)
    expect(linhas[1].pct).toBe(1)
  })

  it('sem valor no campo cai em "(sem valor)", inclusive string vazia', () => {
    const linhas = computeSegment(
      [ativ({ foreman: null }), ativ({ foreman: '   ' })],
      'foreman',
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0].name).toBe('(sem valor)')
    expect(linhas[0].count).toBe(2)
  })

  it('grupo só de extras não divide por zero', () => {
    const linhas = computeSegment([extra('concluida')], 'foreman')
    expect(linhas[0].pct).toBe(0)
    expect(Number.isNaN(linhas[0].pct)).toBe(false)
  })

  it('inativa sai do agrupamento', () => {
    const linhas = computeSegment(
      [ativ({ foreman: 'Ana' }), ativ({ foreman: 'Ana', inativa: true })],
      'foreman',
    )
    expect(linhas[0].count).toBe(1)
  })

  it('área de item importado vem do nível 2 da EDT, não do campo area', () => {
    const importada = ativ({ is_extra: false, area: null, areaPath: 'Bloco B / Laje 3' })
    const linhas = computeSegment([importada], 'area')
    expect(linhas[0].name).toBe('Bloco B')
  })
})

// ============ Fase 2: plano comprometido ============

/** Espelha o que comprometerSemana grava: o conjunto, com status ainda pendente. */
function baselineDe(atividades: ActivityLike[]): BaselineActivity[] {
  return atividades
    .filter((a) => !a.foraDoPlano)
    .map((a) => ({
      activity_id: a.id,
      name: a.name,
      planned_date: a.planned_date,
      status: 'pendente' as ActivityStatus,
      is_extra: a.is_extra,
      inativa: false,
      is_extra_original: a.is_extra,
    }))
}

describe('foraDoPlano sai de todas as contas', () => {
  it('não entra no denominador da aderência atual', () => {
    const r = computeIndicators([
      planejada('concluida'),
      ativ({ status: 'nao_concluida', foraDoPlano: true }),
    ])
    expect(r.aderencia).toBe(1)
    expect(r.total).toBe(1)
  })

  it('também não entra na aderência do cronograma', () => {
    const r = computeIndicatorsCronograma([
      planejada('concluida'),
      ativ({ status: 'nao_concluida', foraDoPlano: true, isExtraOriginal: false }),
    ])
    expect(r.aderencia).toBe(1)
  })

  it('sai do agrupamento por segmento', () => {
    const linhas = computeSegment(
      [ativ({ foreman: 'Ana' }), ativ({ foreman: 'Ana', foraDoPlano: true })],
      'foreman',
    )
    expect(linhas[0].count).toBe(1)
  })
})

describe('computeIndicatorsComprometido — o baseline é o conjunto, o status é o atual', () => {
  it('baseline todo pendente + entregas atuais dá o PPC real', () => {
    // É o caso normal desde a Fase 2: o snapshot é do início da semana, então
    // todo status nele é "pendente". Ler o status congelado daria 0% sempre.
    const atividades = [planejada('concluida'), planejada('concluida'), planejada('nao_concluida')]
    const base = baselineDe(atividades)

    const r = computeIndicatorsComprometido(base, atividades)
    expect(r.ppc).toBeCloseTo(2 / 3)
    expect(r.concluidas).toBe(2)
    expect(r.naoConcluidas).toBe(1)
  })

  it('atividade do baseline EXCLUÍDA conta como não concluída', () => {
    // Sem isto, apagar a linha seria a forma mais fácil de subir o indicador —
    // e finalizarAtividade já apaga linhas dos dias seguintes.
    const a1 = planejada('concluida')
    const a2 = planejada('nao_concluida')
    const base = baselineDe([a1, a2])

    const semA2 = computeIndicatorsComprometido(base, [a1])
    expect(semA2.ppc).toBe(0.5) // denominador continua 2
    expect(semA2.naoConcluidas).toBe(1)
    expect(semA2.pendentes).toBe(0) // "não concluída", não "ainda em aberto"
  })

  it('inativar depois de comprometer NÃO tira do denominador', () => {
    // Diferente de computeIndicators: o item já fazia parte do plano assumido.
    const feita = planejada('concluida')
    const travada = ativ({ status: 'nao_concluida', inativa: true })
    const base = baselineDe([feita, travada])

    expect(computeIndicators([feita, travada]).aderencia).toBe(1) // atual "limpa"
    expect(computeIndicatorsComprometido(base, [feita, travada]).ppc).toBe(0.5) // compromisso cobra
  })

  it('marcar Extra depois também não tira do denominador', () => {
    const feita = planejada('concluida')
    const disfarcada = planejada('nao_concluida')
    const base = baselineDe([feita, disfarcada])

    // Depois de comprometida, alguém marca a não concluída como Extra.
    const agora = [feita, { ...disfarcada, is_extra: true }]
    expect(computeIndicators(agora).aderencia).toBe(1)
    expect(computeIndicatorsComprometido(base, agora).ppc).toBe(0.5)
  })

  it('extra criado depois não entra no denominador nem infla o PPC', () => {
    const planejadaFeita = planejada('concluida')
    const base = baselineDe([planejadaFeita])
    const r = computeIndicatorsComprometido(base, [planejadaFeita, extra('concluida')])
    expect(r.ppc).toBe(1)
    expect(r.ppc).toBeLessThanOrEqual(1)
  })

  it('atividade marcada fora do plano nunca chega ao baseline', () => {
    const dentro = planejada('concluida')
    const fora = ativ({ status: 'nao_concluida', foraDoPlano: true })
    const base = baselineDe([dentro, fora])

    expect(base).toHaveLength(1)
    expect(computeIndicatorsComprometido(base, [dentro, fora]).ppc).toBe(1)
  })

  it('baseline vazio não divide por zero', () => {
    const r = computeIndicatorsComprometido([], [planejada('concluida')])
    expect(r.ppc).toBe(0)
    expect(Number.isNaN(r.aderencia)).toBe(false)
  })

  it('respeita o peso parcial recebido', () => {
    const parcial = planejada('parcial')
    const base = baselineDe([parcial])
    expect(computeIndicatorsComprometido(base, [parcial], 0.3).aderencia).toBeCloseTo(0.3)
  })
})

describe('computeIndicatorsDia — taxa de acerto do dia, imune ao arrasto', () => {
  const SEG = '2026-08-10'
  const TER = '2026-08-11'

  it('conta só o que foi comprometido PRA aquele dia', () => {
    const a = ativ({ planned_date: SEG, status: 'concluida' })
    const b = ativ({ planned_date: SEG, status: 'nao_concluida' })
    const c = ativ({ planned_date: TER, status: 'concluida' })
    const base = baselineDe([a, b, c])

    expect(computeIndicatorsDia(base, [a, b, c], SEG)!.ppc).toBe(0.5)
    expect(computeIndicatorsDia(base, [a, b, c], TER)!.ppc).toBe(1)
  })

  it('arrastar a pendência de segunda pra terça NÃO sobe o acerto de segunda', () => {
    // Este é o motivo de a conta usar o baseline: "Não realizadas" chama
    // moverAtividadesParaDia, que troca planned_date — a linha some de segunda.
    // Olhando só a programação atual, segunda ficaria com 100%.
    const feita = ativ({ planned_date: SEG, status: 'concluida' })
    const pendente = ativ({ planned_date: SEG, status: 'nao_concluida' })
    const base = baselineDe([feita, pendente])

    const depoisDoArrasto = [feita, { ...pendente, planned_date: TER }]

    expect(computeIndicatorsDia(base, depoisDoArrasto, SEG)!.ppc).toBe(0.5)
    // E a prova de que a ingenuidade seria enganosa:
    expect(computeIndicators(depoisDoArrasto.filter((x) => x.planned_date === SEG)).ppc).toBe(1)
  })

  it('a atividade arrastada não entra no denominador do dia que a recebeu', () => {
    const deSegunda = ativ({ planned_date: SEG, status: 'nao_concluida' })
    const deTerca = ativ({ planned_date: TER, status: 'concluida' })
    const base = baselineDe([deSegunda, deTerca])

    const agora = [{ ...deSegunda, planned_date: TER }, deTerca]
    const terca = computeIndicatorsDia(base, agora, TER)!
    expect(terca.total - terca.extras).toBe(1) // só o que terça prometeu
    expect(terca.ppc).toBe(1)
  })

  it('concluir depois de arrastada credita o dia que prometeu, não o que recebeu', () => {
    const prometidaSeg = ativ({ planned_date: SEG, status: 'nao_concluida' })
    const base = baselineDe([prometidaSeg])

    // Arrastada pra terça e concluída lá.
    const agora = [{ ...prometidaSeg, planned_date: TER, status: 'concluida' as ActivityStatus }]
    expect(computeIndicatorsDia(base, agora, SEG)!.ppc).toBe(1)
    expect(computeIndicatorsDia(base, agora, TER)).toBeNull() // terça não prometeu nada
  })

  it('dia sem nada comprometido devolve null, não 0%', () => {
    const a = ativ({ planned_date: SEG, status: 'concluida' })
    expect(computeIndicatorsDia(baselineDe([a]), [a], TER)).toBeNull()
  })

  it('semana em montagem (baseline vazio) devolve null pra todo dia', () => {
    expect(computeIndicatorsDia([], [ativ({ planned_date: SEG })], SEG)).toBeNull()
  })

  it('atividade comprometida e depois apagada conta contra o dia dela', () => {
    const some = ativ({ planned_date: SEG, status: 'pendente' })
    const fica = ativ({ planned_date: SEG, status: 'concluida' })
    const base = baselineDe([some, fica])
    expect(computeIndicatorsDia(base, [fica], SEG)!.ppc).toBe(0.5)
  })
})

describe('diaComprometidoPorAtividade', () => {
  it('mapeia activity_id para o dia congelado no baseline', () => {
    const a = ativ({ planned_date: '2026-08-10' })
    const mapa = diaComprometidoPorAtividade(baselineDe([a]))
    expect(mapa.get(a.id)).toBe('2026-08-10')
  })

  it('atividade que entrou depois de comprometer não está no mapa', () => {
    const a = ativ({ planned_date: '2026-08-10' })
    const nova = ativ({ planned_date: '2026-08-11' })
    const mapa = diaComprometidoPorAtividade(baselineDe([a]))
    expect(mapa.has(nova.id)).toBe(false)
  })
})

describe('computeWeekAnalysisSummary — o delta finalmente diz alguma coisa', () => {
  it('semana honesta: delta zero', () => {
    const atividades = [planejada('concluida'), planejada('nao_concluida')]
    const r = computeWeekAnalysisSummary(baselineDe(atividades), atividades)
    expect(r.delta).toBe(0)
    expect(r.concluidasNoBaseline).toBe(1)
  })

  it('inativar o que não foi entregue abre delta positivo — o sinal de maquiagem', () => {
    const feita = planejada('concluida')
    const escondida = planejada('nao_concluida')
    const base = baselineDe([feita, escondida])

    const agora = [feita, { ...escondida, inativa: true }]
    const r = computeWeekAnalysisSummary(base, agora)
    expect(r.aderenciaBaseline).toBe(0.5)
    expect(r.aderenciaAtual).toBe(1)
    expect(r.delta).toBe(0.5)
  })

  it('conta removidos como não concluídos, não como sumidos', () => {
    const feita = planejada('concluida')
    const apagada = planejada('pendente')
    const base = baselineDe([feita, apagada])

    const r = computeWeekAnalysisSummary(base, [feita])
    expect(r.removidos).toBe(1)
    expect(r.naoConcluidas).toBe(1)
  })

  it('reprograma dentro da semana: conta como reprogramada, não como removida', () => {
    const a = ativ({ status: 'concluida', planned_date: '2026-08-10' })
    const base = baselineDe([a])
    const r = computeWeekAnalysisSummary(base, [{ ...a, planned_date: '2026-08-12' }])
    expect(r.reprogramadas).toBe(1)
    expect(r.removidos).toBe(0)
  })

  it('extras criados depois aparecem como extras adicionados', () => {
    const a = planejada('concluida')
    const r = computeWeekAnalysisSummary(baselineDe([a]), [a, extra('concluida')])
    expect(r.extrasAdicionados).toBe(1)
  })
})
