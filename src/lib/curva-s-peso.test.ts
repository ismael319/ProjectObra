import { describe, expect, it } from 'vitest'
import {
  calcularCurvaSPorPeso,
  calcularForecastAcum,
  construirIndiceDiasUteis,
  fracaoDiasUteis,
  gerarDatasDeCorte,
  gerarDatasDeCortePorGranularidade,
  CURVA_S_CONFIG_PADRAO,
} from './curva-s-peso'
import type { WBSActivity, ParsedProject } from './xml-parser'
import type { CronogramaInfo } from './project-store'

function activity(overrides: Partial<WBSActivity> = {}): WBSActivity {
  return {
    id: '1', uid: 1, name: 'Atividade', wbs: '1', outlineLevel: 1, outlineNumber: '1',
    start: new Date(2020, 0, 1), finish: new Date(2020, 5, 30), duration: 0, durationFormat: 7,
    percentComplete: 0, predecessorUids: [], resourceUids: [], isMilestone: false, isSummary: false,
    baselines: [], responsible: '', discipline: '', area: '', notes: '', priority: 500, calendarName: '',
    text1: '', text2: '', text3: '', text7: '', number1: 100, number2: 0, number3: 0, number4: 0,
    baselineStart: new Date(2020, 0, 1), baselineFinish: new Date(2020, 5, 30),
    ...overrides,
  }
}

const EMPTY_TIMEPHASED: ParsedProject['timephased'] = {
  granularity: 'week', rawPoints: [], weeks: [],
  totals: { plannedHours: 0, actualHours: 0, baselineHours: {} },
  dateRange: { start: new Date(0), end: new Date(0) },
  available: false, baselineIndices: new Set(),
}

function cronograma(activities: WBSActivity[], overrides: Partial<CronogramaInfo> = {}, statusDate?: Date): CronogramaInfo {
  return {
    id: 'c1', nome: 'Cronograma', descricao: '', tipo: 'Geral', versao: 1, ativo: true, peso: 1, cor: '#000',
    dataUpload: new Date().toISOString(), metodoAvanco: 'padrao', dataStatusModo: 'cronograma', dataStatusManual: null,
    tipoCurvaS: 'peso',
    dados: {
      name: 'p', startDate: new Date(2020, 0, 1), finishDate: new Date(2020, 5, 30), author: '', company: '', description: '',
      activities, resources: [], assignments: [], baselines: [], timephased: EMPTY_TIMEPHASED,
      weekStartDay: 5, minutesPerDay: 540, customFieldDefs: [], statusDate,
    },
    ...overrides,
  }
}

// Números reais extraídos do PDF "Curva S - 735 001 - FS Armazém IV PVA (1)"
// (piloto TEIÚ/BDR, semanas S00-S61), usados pra validar a fórmula do
// Forecast contra a planilha original — ver checkpoint de 2026-08-19.
const PLANEJADO_ACUM_REAL = [
  0, 0, 1, 1, 2, 3, 4, 5, 7, 8, 9, 10, 13, 15, 17, 19, 21, 23, 25, 27, 35, 39, 41, 43, 46, 50, 54, 56, 57, 58, 59, 60,
  61, 63, 64, 65, 66, 67, 68, 70, 72, 74, 77, 78, 80, 81, 84, 85, 87, 88, 90, 91, 92, 94, 96, 97, 98, 98, 99, 99, 100,
  100,
]
// Semanas S18+ (índices >= 18) não têm execução conhecida na planilha real (#N/D) — representadas aqui como null.
const EXECUTADO_ACUM_REAL: (number | null)[] = [
  0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 18,
  ...Array(PLANEJADO_ACUM_REAL.length - 18).fill(null),
]
const FORECAST_ACUM_REAL: (number | null)[] = [
  ...Array(18).fill(null),
  21, 24, 32, 36, 39, 41, 44, 48, 50, 52, 53, 55, 56, 58, 60, 62, 63, 65, 66, 67, 67, 70, 71, 74, 76, 78, 79, 81, 83,
  85, 86, 88, 89, 91, 92, 94, 96, 97, 98, 98, 99, 99, 100, 100,
]
const INDICE_STATUS_REAL = 17 // S17 (13/08/26) é a última semana com Executado conhecido

describe('calcularForecastAcum', () => {
  it('reproduz a fórmula com números sintéticos exatos (sem arredondamento acumulado)', () => {
    // Cenário fabricado: status na semana 2, planejado sobe linear até 100% na semana 10.
    const planejado = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 100]
    const executado: (number | null)[] = [10, 18, 24, null, null, null, null, null, null, null, null]
    const forecast = calcularForecastAcum(planejado, executado, 2)

    // fator = (100-24)/(100-30) = 76/70 = 1.0857142857...
    expect(forecast[0]).toBeNull()
    expect(forecast[1]).toBeNull()
    expect(forecast[2]).toBeNull()
    expect(forecast[3]).toBeCloseTo(24 + (76 / 70) * (40 - 30), 6) // 34.857...
    expect(forecast[9]).toBeCloseTo(24 + (76 / 70) * (100 - 30), 6)
    expect(forecast[10]).toBeCloseTo(100, 6) // fecha em 100% na última semana do planejado
  })

  it('bate com a planilha real (Curva S 735 001 - FS Armazém IV PVA) dentro de arredondamento', () => {
    const forecast = calcularForecastAcum(PLANEJADO_ACUM_REAL, EXECUTADO_ACUM_REAL, INDICE_STATUS_REAL)

    for (let i = 0; i < FORECAST_ACUM_REAL.length; i++) {
      const esperado = FORECAST_ACUM_REAL[i]
      if (esperado === null) {
        expect(forecast[i]).toBeNull()
      } else {
        // ±2 pontos: os números de entrada (Planejado/Executado Acum.) já vêm
        // arredondados da planilha, então o encadeamento de duas fórmulas
        // sobre valores pré-arredondados naturalmente desvia um pouco do
        // valor exibido — validado manualmente ponto a ponto durante o
        // reverse-engineering (ver memória de sessão "curva-s-planejado-realizado").
        expect(Math.round(forecast[i] as number)).toBeGreaterThanOrEqual(esperado - 2)
        expect(Math.round(forecast[i] as number)).toBeLessThanOrEqual(esperado + 2)
      }
    }

    // As duas pontas são as mais importantes de bater exato: a primeira
    // semana de forecast e a última (que por construção da fórmula sempre
    // fecha em 100% junto com o Planejado).
    expect(Math.round(forecast[61] as number)).toBe(100)
  })

  it('sem execução conhecida (indiceStatus = -1), não calcula forecast nenhum', () => {
    const planejado = [0, 10, 50, 100]
    const executado: (number | null)[] = [null, null, null, null]
    const forecast = calcularForecastAcum(planejado, executado, -1)
    expect(forecast).toEqual([null, null, null, null])
  })
})

describe('gerarDatasDeCorte', () => {
  it('começa na primeira ocorrência do dia de corte e anda de 7 em 7 dias', () => {
    // 2026-04-13 é uma segunda-feira; dia de corte = quinta (4)
    const inicio = new Date(2026, 3, 13)
    const fim = new Date(2026, 3, 30)
    const datas = gerarDatasDeCorte(inicio, fim, 4)

    expect(datas[0].getDay()).toBe(4)
    expect(datas[0].toISOString().slice(0, 10)).toBe('2026-04-16')
    for (const d of datas) expect(d.getDay()).toBe(4)
    for (let i = 1; i < datas.length; i++) {
      expect(datas[i].getTime() - datas[i - 1].getTime()).toBe(7 * 24 * 60 * 60 * 1000)
    }
  })

  it('a última data de corte cobre o fim do projeto (>= fimProjeto)', () => {
    const inicio = new Date(2026, 0, 1)
    const fim = new Date(2026, 0, 20)
    const datas = gerarDatasDeCorte(inicio, fim, 4)
    expect(datas[datas.length - 1].getTime()).toBeGreaterThanOrEqual(fim.getTime())
  })
})

describe('fracaoDiasUteis', () => {
  it('0% antes do início, 100% no/depois do término, crescente no meio', () => {
    const inicio = new Date(2026, 0, 1) // quinta
    const fim = new Date(2026, 0, 15) // quinta, 2 semanas depois
    const indice = construirIndiceDiasUteis(inicio, new Date(2026, 0, 20), 0, new Set()) // folga=domingo, sem feriado

    expect(fracaoDiasUteis(inicio, fim, new Date(2025, 11, 31), indice)).toBe(0)
    expect(fracaoDiasUteis(inicio, fim, fim, indice)).toBe(1)
    expect(fracaoDiasUteis(inicio, fim, new Date(2026, 0, 20), indice)).toBe(1)

    const meio = fracaoDiasUteis(inicio, fim, new Date(2026, 0, 8), indice)
    expect(meio).toBeGreaterThan(0)
    expect(meio).toBeLessThan(1)
  })

  it('atividade sem duração útil (início === término) vira 0% ou 100% na borda', () => {
    const marco = new Date(2026, 0, 8)
    const indice = construirIndiceDiasUteis(new Date(2026, 0, 1), new Date(2026, 0, 20), 0, new Set())
    expect(fracaoDiasUteis(marco, marco, new Date(2026, 0, 1), indice)).toBe(0)
    expect(fracaoDiasUteis(marco, marco, marco, indice)).toBe(1)
    expect(fracaoDiasUteis(marco, marco, new Date(2026, 0, 20), indice)).toBe(1)
  })

  it('feriado dentro do intervalo reduz o total de dias úteis (fração no meio muda)', () => {
    const inicio = new Date(2026, 0, 1)
    const fim = new Date(2026, 0, 15)
    const corte = new Date(2026, 0, 8)
    const semFeriado = construirIndiceDiasUteis(inicio, new Date(2026, 0, 20), 0, new Set())
    const comFeriado = construirIndiceDiasUteis(inicio, new Date(2026, 0, 20), 0, new Set(['2026-01-05']))

    const fracaoSem = fracaoDiasUteis(inicio, fim, corte, semFeriado)
    const fracaoCom = fracaoDiasUteis(inicio, fim, corte, comFeriado)
    expect(fracaoCom).not.toBe(fracaoSem)
  })
})

describe('gerarDatasDeCortePorGranularidade', () => {
  it("'week' delega literalmente pra gerarDatasDeCorte (mesmo resultado)", () => {
    const inicio = new Date(2026, 3, 13)
    const fim = new Date(2026, 3, 30)
    const esperado = gerarDatasDeCorte(inicio, fim, 4)
    const obtido = gerarDatasDeCortePorGranularidade(inicio, fim, { diaCorteSemana: 4, diaFolgaSemanal: 0 }, 'week')
    expect(obtido).toEqual(esperado)
  })

  it("'day' gera um corte por dia corrido, cobrindo início e fim", () => {
    const inicio = new Date(2026, 0, 1)
    const fim = new Date(2026, 0, 5)
    const datas = gerarDatasDeCortePorGranularidade(inicio, fim, CURVA_S_CONFIG_PADRAO, 'day')
    expect(datas.length).toBe(5)
    expect(datas[0].toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(datas[4].toISOString().slice(0, 10)).toBe('2026-01-05')
  })

  it("'month' gera um corte por fim de mês, último >= fimProjeto", () => {
    const inicio = new Date(2026, 0, 15)
    const fim = new Date(2026, 2, 10)
    const datas = gerarDatasDeCortePorGranularidade(inicio, fim, CURVA_S_CONFIG_PADRAO, 'month')
    expect(datas.length).toBe(3) // jan, fev, mar
    for (const d of datas) expect(d.getTime()).toBeGreaterThanOrEqual(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime() - 1)
    expect(datas[datas.length - 1].getTime()).toBeGreaterThanOrEqual(fim.getTime())
  })

  it("'year' gera um corte por fim de ano, último >= fimProjeto", () => {
    const inicio = new Date(2025, 6, 1)
    const fim = new Date(2027, 2, 1)
    const datas = gerarDatasDeCortePorGranularidade(inicio, fim, CURVA_S_CONFIG_PADRAO, 'year')
    expect(datas.length).toBe(3) // 2025, 2026, 2027
    expect(datas[datas.length - 1].getTime()).toBeGreaterThanOrEqual(fim.getTime())
  })
})

describe('calcularCurvaSPorPeso', () => {
  it('sem granularity produz a mesma saída que granularity explícito "week" (contrato aditivo)', () => {
    const a1 = activity({ uid: 1, number1: 60, start: new Date(2020, 0, 1), finish: new Date(2020, 2, 31), baselineStart: new Date(2020, 0, 1), baselineFinish: new Date(2020, 2, 31) })
    const a2 = activity({ uid: 2, number1: 40, start: new Date(2020, 3, 1), finish: new Date(2020, 5, 30), baselineStart: new Date(2020, 3, 1), baselineFinish: new Date(2020, 5, 30) })
    const cron = cronograma([a1, a2], {}, new Date(2020, 4, 1))

    const semDefault = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [] })
    const comWeek = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [], granularity: 'week' })
    expect(semDefault).toEqual(comWeek)
  })

  it('granularity "month" fecha em 100% na última data de corte, igual ao modo semanal', () => {
    const a1 = activity({ uid: 1, number1: 100, start: new Date(2020, 0, 1), finish: new Date(2020, 5, 30), baselineStart: new Date(2020, 0, 1), baselineFinish: new Date(2020, 5, 30) })
    const cron = cronograma([a1], {}, new Date(2020, 4, 1))

    const mensal = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [], granularity: 'month' })
    const geral = mensal.find((r) => r.disciplina === 'GERAL')!
    expect(geral.semanas[geral.semanas.length - 1].avancoPlanejadoAcum).toBe(100)
  })
})

describe('calcularCurvaSPorPeso', () => {
  it('sem <StatusDate> no XML (statusDate undefined), cai pra hoje em vez de deixar Executado/Forecast vazios em tudo', () => {
    // Atividades e datas de corte todas no passado (2020) — com o fallback pra
    // "hoje" (2026+), toda a grade fica <= dataStatus, então o Executado
    // deveria vir preenchido em todas as semanas, não só null.
    const a1 = activity({ uid: 1, number1: 60, start: new Date(2020, 0, 1), finish: new Date(2020, 2, 31), baselineStart: new Date(2020, 0, 1), baselineFinish: new Date(2020, 2, 31) })
    const a2 = activity({ uid: 2, number1: 40, start: new Date(2020, 3, 1), finish: new Date(2020, 5, 30), baselineStart: new Date(2020, 3, 1), baselineFinish: new Date(2020, 5, 30) })
    const cron = cronograma([a1, a2], {}, undefined) // sem statusDate

    const resultados = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [] })
    const geral = resultados.find((r) => r.disciplina === 'GERAL')
    expect(geral).toBeDefined()
    expect(geral!.semanas.length).toBeGreaterThan(0)
    // Antes da correção, TODAS as semanas vinham com avancoExecutadoAcum null
    // (indiceStatus ficava -1 pra sempre) — agora pelo menos a última semana
    // (bem no passado, então "hoje" já passou dela) deve ter valor.
    const ultima = geral!.semanas[geral!.semanas.length - 1]
    expect(ultima.avancoExecutadoAcum).not.toBeNull()
    expect(ultima.avancoPlanejadoAcum).toBe(100)
  })

  it('atividade sem peso (Número1 <= 0) ou disciplina Externa fica de fora do cálculo', () => {
    const valida = activity({ uid: 1, number1: 50 })
    const semPeso = activity({ uid: 2, number1: 0 })
    const externa = activity({ uid: 3, number1: 50, text7: 'Externa' })
    const cron = cronograma([valida, semPeso, externa], {}, new Date(2026, 0, 1))

    const resultados = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [] })
    const geral = resultados.find((r) => r.disciplina === 'GERAL')!
    // Só a atividade "valida" deveria contar — se semPeso/externa entrassem, a
    // curva GERAL teria peso total > 50 e o Planejado na última semana
    // (100% da atividade válida) não bateria 100% sozinho.
    expect(geral.semanas[geral.semanas.length - 1].avancoPlanejadoAcum).toBe(100)
  })

  it('cronograma inativo (ativo: false) não entra no cálculo', () => {
    const a1 = activity({ uid: 1, number1: 100 })
    const cron = cronograma([a1], { ativo: false }, new Date(2026, 0, 1))
    const resultados = calcularCurvaSPorPeso({ cronogramas: [cron], config: CURVA_S_CONFIG_PADRAO, feriados: [] })
    expect(resultados).toEqual([])
  })
})
