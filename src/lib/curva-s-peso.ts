// Curva S por peso atribuído (2ª forma de visualizar a Curva S, ao lado da
// curva por trabalho/HH já existente em curve-utils.ts). Reproduz a lógica da
// planilha "Curva S - 735 001 - FS Armazém IV PVA.xlsb" (piloto TEIÚ / BDR):
// avanço medido pelo peso atribuído (R$, campo Número1 do cronograma) de cada
// atividade, não por trabalho/HH.
//
// Segue o mesmo padrão do Mapa de Setores: não normaliza atividades em
// tabela — lê direto de WBSActivity (Número1 = peso, Texto7 = disciplina,
// baselineStart/Finish = planejado, start/finish = real), que já vêm do jsonb
// `projeto_cronogramas.dados`. O resultado semanal calculado aqui é o que vai
// pra tabela materializada `curva_s_semanas` (ver migration
// 20260819010000_curva-s-peso-fundacao-migration.sql).

import { addMonths, addYears, endOfMonth, endOfYear, startOfMonth, startOfYear } from 'date-fns'
import type { WBSActivity } from './xml-parser'
import type { CronogramaInfo } from './project-store'
import type { CurveGranularity } from './curve-utils'

export interface CurvaSConfig {
  /** Dia da semana do corte, convenção Date.getDay() (0=domingo..6=sábado). Padrão do piloto: quinta (4). */
  diaCorteSemana: number
  /** Dia sem expediente, excluído da contagem de dias úteis. Padrão do piloto: domingo (0) — a obra roda sábado. */
  diaFolgaSemanal: number
}

export const CURVA_S_CONFIG_PADRAO: CurvaSConfig = { diaCorteSemana: 4, diaFolgaSemanal: 0 }

/** Rótulos dos dias da semana pros seletores de dia de corte/folga (index = Date.getDay()). */
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Nome do grupo que consolida todas as disciplinas (equivalente à aba "GERAL" da planilha). */
export const CURVA_S_DISCIPLINA_GERAL = 'GERAL'

// Disciplina sempre excluída do cálculo, comparação sem diferenciar maiúsculas/minúsculas.
const DISCIPLINA_EXCLUIDA = 'externa'

export interface CurvaSSemana {
  semanaIndice: number
  dataCorte: Date
  avancoPlanejadoSemana: number
  avancoPlanejadoAcum: number
  /** null = ainda não há execução conhecida nesta semana (equivalente ao #N/D da planilha). */
  avancoExecutadoSemana: number | null
  avancoExecutadoAcum: number | null
  /** null = semana ainda dentro do período com execução conhecida (Forecast só projeta o futuro). */
  forecastAcum: number | null
  desvioSemana: number | null
  desvioAcum: number | null
  /** Percentual acumulado das linhas de base adicionais (BL1..BL10) que tiverem
   * dados no cronograma — chave 'BL1'..'BL10'. A linha de base 0 já está em
   * avancoPlanejadoAcum, não se repete aqui. */
  baselinesAcum: Record<string, number>
}

/** Uma linha de base adicional (BL1..BL10) disponível no cronograma, pra plotar
 * ao lado do Planejado (que é sempre BL0). */
export interface CurvaSBaselineInfo {
  id: string
  index: number
  label: string
}

export interface CurvaSResultado {
  /** CURVA_S_DISCIPLINA_GERAL para a curva consolidada, ou o valor de Texto7 para a curva de uma disciplina. */
  disciplina: string
  semanas: CurvaSSemana[]
  /** Linhas de base além da BL0 (Planejado) que tiverem dados no cronograma. */
  baselinesExtras: CurvaSBaselineInfo[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function apenasData(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function normalizarDisciplina(texto7: string): string {
  return texto7.trim()
}

/** Resolve a data de status efetiva de um cronograma: manual (se configurada) ou a do próprio XML. */
export function resolveDataStatus(c: CronogramaInfo): Date | undefined {
  if (c.dataStatusModo === 'manual' && c.dataStatusManual) {
    const d = new Date(`${c.dataStatusManual}T00:00:00`)
    return isNaN(d.getTime()) ? undefined : d
  }
  return c.dados.statusDate
}

function ehAtividadeValida(a: WBSActivity): boolean {
  if (a.isSummary) return false
  if (!(a.number1 > 0)) return false
  return normalizarDisciplina(a.text7).toLowerCase() !== DISCIPLINA_EXCLUIDA
}

/**
 * Gera as datas de corte semanais (S00, S01, ...) do dia de corte configurado,
 * de 7 em 7 dias, começando na primeira ocorrência desse dia da semana a partir
 * de `inicioProjeto` e indo até cobrir `fimProjeto` (a última data sempre é
 * >= fimProjeto, senão nenhuma atividade chegaria a 100% na grade).
 */
export function gerarDatasDeCorte(inicioProjeto: Date, fimProjeto: Date, diaCorteSemana: number): Date[] {
  const datas: Date[] = []
  const cursor = apenasData(inicioProjeto)
  while (cursor.getDay() !== diaCorteSemana) cursor.setDate(cursor.getDate() + 1)
  const fim = apenasData(fimProjeto)
  while (true) {
    datas.push(new Date(cursor))
    if (cursor >= fim) break
    cursor.setDate(cursor.getDate() + 7)
  }
  return datas
}

/**
 * Gera as datas de corte pra qualquer granularidade (dia/semana/mês/ano), com o
 * mesmo contrato de `gerarDatasDeCorte` (última data sempre >= fimProjeto). Pra
 * `'week'`, delega literalmente pra `gerarDatasDeCorte` — mesma referência de
 * comportamento, sem alterar o caminho já validado. As demais granularidades
 * usam o fim de cada dia/mês/ano como corte (não dependem de `diaCorteSemana`,
 * que é um conceito só semanal).
 */
export function gerarDatasDeCortePorGranularidade(
  inicioProjeto: Date,
  fimProjeto: Date,
  config: CurvaSConfig,
  granularity: CurveGranularity,
): Date[] {
  if (granularity === 'week') return gerarDatasDeCorte(inicioProjeto, fimProjeto, config.diaCorteSemana)

  const fim = apenasData(fimProjeto)
  const datas: Date[] = []

  if (granularity === 'day') {
    const cursor = apenasData(inicioProjeto)
    while (true) {
      datas.push(new Date(cursor))
      if (cursor >= fim) break
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  }

  // Avança sempre a partir do INÍCIO do mês/ano (startOf), nunca do fim (dia 31 + 1
  // mês vira dia 3 do mês seguinte em JS — rollover que pularia fevereiro inteiro
  // se somasse a partir de endOfMonth).
  const inicioDoPeriodo = granularity === 'month' ? startOfMonth : startOfYear
  const fimDoPeriodo = granularity === 'month' ? endOfMonth : endOfYear
  const passo = granularity === 'month' ? (d: Date) => addMonths(d, 1) : (d: Date) => addYears(d, 1)

  let cursorInicio = inicioDoPeriodo(inicioProjeto)
  while (true) {
    const corte = apenasData(fimDoPeriodo(cursorInicio))
    datas.push(corte)
    if (corte >= fim) break
    cursorInicio = passo(cursorInicio)
  }
  return datas
}

function ehDiaUtil(d: Date, diaFolga: number, feriados: Set<string>): boolean {
  if (d.getDay() === diaFolga) return false
  return !feriados.has(toDateKey(d))
}

/**
 * Índice de dias úteis acumulados: indice.get(chave do dia) = quantidade de
 * dias úteis entre `inicio` e aquele dia, inclusive. Construído uma vez para
 * toda a faixa do projeto — cada atividade só faz duas consultas O(1) nele
 * (início e corte), em vez de recontar dias úteis a cada semana.
 */
export function construirIndiceDiasUteis(inicio: Date, fim: Date, diaFolga: number, feriados: Set<string>): Map<string, number> {
  const indice = new Map<string, number>()
  let acumulado = 0
  const cursor = apenasData(inicio)
  const limite = apenasData(fim)
  while (cursor <= limite) {
    if (ehDiaUtil(cursor, diaFolga, feriados)) acumulado++
    indice.set(toDateKey(cursor), acumulado)
    cursor.setDate(cursor.getDate() + 1)
  }
  return indice
}

function diasUteisIndice(indice: Map<string, number>, d: Date): number {
  return indice.get(toDateKey(apenasData(d))) ?? 0
}

/**
 * Fração de dias úteis decorridos entre `inicio` e `fim` até a data de corte
 * (aproximação de ProjDateDiff/Duração da fórmula original do MS Project —
 * não replica o motor de calendário do Project, só conta dias úteis simples).
 * Tarefa sem duração útil (marco, ou início=fim) vira 0%/100% na borda.
 */
export function fracaoDiasUteis(inicio: Date | undefined, fim: Date | undefined, corte: Date, indice: Map<string, number>): number {
  if (!inicio || !fim) return 0
  if (corte < inicio) return 0
  const total = diasUteisIndice(indice, fim) - diasUteisIndice(indice, inicio)
  if (total <= 0) return 1
  const fimEfetivo = corte < fim ? corte : fim
  const elapsed = diasUteisIndice(indice, fimEfetivo) - diasUteisIndice(indice, inicio)
  return Math.max(0, Math.min(1, elapsed / total))
}

/**
 * Fórmula do Forecast (Acumulado): reprojeta o saldo do Planejado
 * mantendo o formato original da curva planejada, ancorado no Executado real
 * na data de status, fechando em 100% na mesma semana final do Planejado.
 * Validada em 2026-08-19 contra a planilha real do piloto (Curva S - 735 001
 * - FS Armazém IV PVA), ponto a ponto.
 *
 *   fator = (100 − E_status) / (100 − P_status)
 *   Forecast(semana) = E_status + fator × (P_semana − P_status)   [só semana > status]
 *
 * `indiceStatus` é o índice (em planejadoAcum/executadoAcum) da última semana
 * com execução conhecida — semanas até ali (inclusive) não têm forecast
 * (equivalente ao #N/D da planilha), só semanas futuras.
 */
export function calcularForecastAcum(planejadoAcum: number[], executadoAcum: (number | null)[], indiceStatus: number): (number | null)[] {
  if (indiceStatus < 0 || indiceStatus >= planejadoAcum.length) return planejadoAcum.map(() => null)
  const pStatus = planejadoAcum[indiceStatus]
  const eStatus = executadoAcum[indiceStatus] ?? 0
  const fator = pStatus < 100 ? (100 - eStatus) / (100 - pStatus) : 1
  return planejadoAcum.map((pSemana, i) => {
    if (i <= indiceStatus) return null
    return Math.max(0, Math.min(100, eStatus + fator * (pSemana - pStatus)))
  })
}

function ultimoIndiceComCorteAteData(dataCortes: Date[], dataStatus: Date | undefined): number {
  if (!dataStatus) return -1
  for (let i = dataCortes.length - 1; i >= 0; i--) {
    if (dataCortes[i] <= dataStatus) return i
  }
  return -1
}

function calcularSemanasParaGrupo(
  atividades: WBSActivity[],
  dataCortes: Date[],
  indiceDiasUteis: Map<string, number>,
  dataStatus: Date | undefined,
  baselinesExtras: CurvaSBaselineInfo[],
): CurvaSSemana[] {
  const pesoTotal = atividades.reduce((soma, a) => soma + a.number1, 0)
  if (pesoTotal <= 0) return []

  const indiceStatus = ultimoIndiceComCorteAteData(dataCortes, dataStatus)

  const acumularPorDatas = (getInicio: (a: WBSActivity) => Date | undefined, getFim: (a: WBSActivity) => Date | undefined): number[] =>
    dataCortes.map((corte) => {
      const soma = atividades.reduce((s, a) => s + a.number1 * fracaoDiasUteis(getInicio(a), getFim(a), corte, indiceDiasUteis), 0)
      return (soma / pesoTotal) * 100
    })

  const planejadoAcum = acumularPorDatas((a) => a.baselineStart, (a) => a.baselineFinish)

  const executadoAcum = dataCortes.map((corte, i) => {
    if (i > indiceStatus) return null
    const soma = atividades.reduce((s, a) => s + a.number1 * fracaoDiasUteis(a.start, a.finish, corte, indiceDiasUteis), 0)
    return (soma / pesoTotal) * 100
  })

  const forecastAcum = calcularForecastAcum(planejadoAcum, executadoAcum, indiceStatus)

  const extrasAcum = baselinesExtras.map((bl) => ({
    id: bl.id,
    valores: acumularPorDatas((a) => a.baselines[bl.index]?.start, (a) => a.baselines[bl.index]?.finish),
  }))

  return dataCortes.map((corte, i) => {
    const pAcum = planejadoAcum[i]
    const eAcum = executadoAcum[i]
    const pAcumAnterior = i > 0 ? planejadoAcum[i - 1] : 0
    const eAcumAnterior = i > 0 ? executadoAcum[i - 1] : 0

    const baselinesAcum: Record<string, number> = {}
    for (const extra of extrasAcum) baselinesAcum[extra.id] = round1(extra.valores[i])

    return {
      semanaIndice: i,
      dataCorte: corte,
      avancoPlanejadoAcum: round1(pAcum),
      avancoPlanejadoSemana: round1(pAcum - pAcumAnterior),
      avancoExecutadoAcum: eAcum === null ? null : round1(eAcum),
      avancoExecutadoSemana: eAcum === null || eAcumAnterior === null ? null : round1(eAcum - eAcumAnterior),
      forecastAcum: forecastAcum[i] === null ? null : round1(forecastAcum[i] as number),
      desvioAcum: eAcum === null ? null : round1(eAcum - pAcum),
      desvioSemana: eAcum === null || eAcumAnterior === null ? null : round1((eAcum - eAcumAnterior) - (pAcum - pAcumAnterior)),
      baselinesAcum,
    }
  })
}

export interface CurvaSInput {
  /** Só cronogramas ativos (c.ativo) entram no cálculo — os demais são ignorados. */
  cronogramas: CronogramaInfo[]
  config: CurvaSConfig
  feriados: Date[]
  /** Granularidade dos pontos de corte. Padrão 'week' — omitir mantém o comportamento de sempre. */
  granularity?: CurveGranularity
}

/**
 * Calcula a Curva S por peso atribuído: uma curva "GERAL" (todas as
 * disciplinas juntas) mais uma curva por disciplina (Texto7) que aparecer nas
 * atividades válidas. Atividades-resumo, sem peso (Número1 <= 0) e da
 * disciplina "Externa" ficam sempre fora.
 *
 * A data de status usada como "hoje" (que trava o Executado e ancora o
 * Forecast) é a MAIS ANTIGA entre as datas de status dos cronogramas ativos
 * — escolha conservadora quando há mais de um cronograma ativo ao mesmo
 * tempo: não assume executado além do que o cronograma mais atrasado já
 * confirmou. Se NENHUM cronograma ativo tiver data de status (comum — o
 * <StatusDate> do MS Project é um campo opcional, nem todo export tem), cai
 * pra data atual do navegador — sem esse fallback, indiceStatus fica -1 e
 * Executado/Forecast saem vazios em TODAS as semanas (bug corrigido em
 * 2026-08-19, reportado como "curva errada, forecast também").
 */
export function calcularCurvaSPorPeso(input: CurvaSInput): CurvaSResultado[] {
  const feriadosSet = new Set(input.feriados.map(toDateKey))
  const ativos = input.cronogramas.filter((c) => c.ativo)

  const atividadesValidas: WBSActivity[] = []
  let dataStatus: Date | undefined
  for (const c of ativos) {
    const ds = resolveDataStatus(c)
    if (ds && (!dataStatus || ds < dataStatus)) dataStatus = ds
    for (const a of c.dados.activities) {
      if (ehAtividadeValida(a)) atividadesValidas.push(a)
    }
  }
  if (!dataStatus) dataStatus = new Date()
  if (atividadesValidas.length === 0) return []

  let inicioProjeto: Date | undefined
  let fimProjeto: Date | undefined
  for (const a of atividadesValidas) {
    if (a.baselineStart && (!inicioProjeto || a.baselineStart < inicioProjeto)) inicioProjeto = a.baselineStart
    if (a.baselineFinish && (!fimProjeto || a.baselineFinish > fimProjeto)) fimProjeto = a.baselineFinish
  }
  if (!inicioProjeto || !fimProjeto) return []

  const dataCortes = gerarDatasDeCortePorGranularidade(inicioProjeto, fimProjeto, input.config, input.granularity ?? 'week')
  const indiceDiasUteis = construirIndiceDiasUteis(inicioProjeto, dataCortes[dataCortes.length - 1], input.config.diaFolgaSemanal, feriadosSet)

  const disciplinas = new Set<string>()
  for (const a of atividadesValidas) {
    const d = normalizarDisciplina(a.text7)
    if (d) disciplinas.add(d)
  }

  const grupos: { chave: string; atividades: WBSActivity[] }[] = [{ chave: CURVA_S_DISCIPLINA_GERAL, atividades: atividadesValidas }]
  for (const d of disciplinas) {
    grupos.push({ chave: d, atividades: atividadesValidas.filter((a) => normalizarDisciplina(a.text7) === d) })
  }

  // Linhas de base além da BL0 (Planejado): uma baseline i (1-10) só entra se
  // pelo menos uma atividade válida tiver início e término salvos nela — a maioria
  // dos cronogramas usa só a BL0, então isso evita mostrar 10 linhas vazias.
  const baselinesExtras: CurvaSBaselineInfo[] = []
  for (let i = 1; i <= 10; i++) {
    const disponivel = atividadesValidas.some((a) => a.baselines[i]?.start && a.baselines[i]?.finish)
    if (disponivel) baselinesExtras.push({ id: `BL${i}`, index: i, label: `Linha de base ${i}` })
  }

  return grupos.map(({ chave, atividades }) => ({
    disciplina: chave,
    semanas: calcularSemanasParaGrupo(atividades, dataCortes, indiceDiasUteis, dataStatus, baselinesExtras),
    baselinesExtras,
  }))
}
