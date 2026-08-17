import type { CronogramaInfo, Project } from '@/lib/project-store'
import type { WBSActivity } from '@/lib/xml-parser'
import type { EngenheiroArea } from '@/lib/programacao-db'
import { round2 } from '@/lib/curve-utils'
import { buildAreaPathResolver, getAreaNivel2 } from '@/lib/week-activities'

// Cada um dos 4 campos do card (início/término/avanço prev/avanço concl) tem fonte
// própria e independente: uma atividade do cronograma (folha OU resumo — o MS Project já
// consolida datas/HH de tarefas-resumo sozinho, então o mesmo código serve pros dois) ou
// uma coluna personalizada dessa atividade. Um marcador aponta pra UM cronograma só.

export type CampoCard = 'inicio' | 'termino' | 'avanco_prev' | 'avanco_concl'
export type FonteTipo = 'atividade' | 'coluna_personalizada'

export interface VinculoCampo {
  campo: CampoCard
  fonteTipo: FonteTipo
  activityUid: number
  customFieldId: string | null
}

export type ValorCampo =
  | { tipo: 'data'; data: Date }
  | { tipo: 'percentual'; pct: number }
  | { tipo: 'texto'; texto: string }

export const CAMPO_LABEL: Record<CampoCard, string> = {
  inicio: 'Início',
  termino: 'Término',
  avanco_prev: 'Av. Prev',
  avanco_concl: 'Av. Concl',
}

/** Atividade referenciada por um vínculo — `null` se o cronograma não existir mais
 * (removido/desativado) ou o activity_uid não for encontrado (órfão: o MS Project não
 * garante uid estável entre reimportações do XML). */
export function atividadeDoVinculo(cronograma: CronogramaInfo | undefined, activityUid: number): WBSActivity | null {
  if (!cronograma) return null
  return cronograma.dados.activities.find((a) => a.uid === activityUid) ?? null
}

export function vinculoOrfao(cronograma: CronogramaInfo | undefined, vinculo: VinculoCampo): boolean {
  return atividadeDoVinculo(cronograma, vinculo.activityUid) === null
}

function fracaoDecorrida(inicio: Date, fim: Date, agora: Date): number {
  const ini = inicio.getTime()
  const fimMs = fim.getTime()
  const total = fimMs - ini
  if (total <= 0) return agora.getTime() >= fimMs ? 100 : 0
  const decorrido = Math.min(Math.max(agora.getTime() - ini, 0), total)
  return (decorrido / total) * 100
}

/** "Avanço previsto" de UMA atividade (folha ou resumo): fração decorrida do prazo até
 * hoje — baseline (BL0) quando disponível, senão as datas atuais do cronograma. Não pesa
 * por custo/HH porque aqui não há soma de várias atividades (isso ficou no motor da Curva
 * S, pra quando o card precisar agregar — este cálculo é sempre de uma atividade só). */
function avancoPrevistoDaAtividade(a: WBSActivity, agora: Date): number {
  const inicio = a.baselineStart ?? a.start
  const fim = a.baselineFinish ?? a.finish
  return round2(fracaoDecorrida(inicio, fim, agora))
}

/** "Avanço concluído" de UMA atividade — prioriza actualWork/work (mais preciso que
 * PercentComplete quando o trabalho não é uniforme ao longo da atividade, mesma
 * preferência já usada em week-activities.ts), com fallback pro percentComplete bruto do
 * XML quando não há HH cadastrado. */
function avancoConcluidoDaAtividade(a: WBSActivity): number {
  if (a.work && a.work > 0) return round2(((a.actualWork ?? 0) / a.work) * 100)
  return round2(a.percentComplete ?? 0)
}

export function resolverValorCampo(cronograma: CronogramaInfo | undefined, vinculo: VinculoCampo, agora?: Date): ValorCampo | null {
  const atividade = atividadeDoVinculo(cronograma, vinculo.activityUid)
  if (!atividade) return null

  if (vinculo.fonteTipo === 'coluna_personalizada') {
    const bruto = vinculo.customFieldId ? atividade.customFields?.[vinculo.customFieldId] : undefined
    if (bruto == null || bruto.trim() === '') return null
    if (vinculo.campo === 'inicio' || vinculo.campo === 'termino') {
      const data = new Date(bruto)
      if (!Number.isNaN(data.getTime())) return { tipo: 'data', data }
      return { tipo: 'texto', texto: bruto }
    }
    const num = Number(bruto.replace(',', '.').replace('%', '').trim())
    if (!Number.isNaN(num)) return { tipo: 'percentual', pct: num }
    return { tipo: 'texto', texto: bruto }
  }

  switch (vinculo.campo) {
    case 'inicio':
      return { tipo: 'data', data: atividade.start }
    case 'termino':
      return { tipo: 'data', data: atividade.finish }
    case 'avanco_prev':
      return { tipo: 'percentual', pct: avancoPrevistoDaAtividade(atividade, agora ?? new Date()) }
    case 'avanco_concl':
      return { tipo: 'percentual', pct: avancoConcluidoDaAtividade(atividade) }
  }
}

export function resolverCamposDoMarcador(
  cronograma: CronogramaInfo | undefined,
  vinculos: VinculoCampo[],
  agora?: Date,
): Partial<Record<CampoCard, ValorCampo>> {
  const out: Partial<Record<CampoCard, ValorCampo>> = {}
  for (const v of vinculos) {
    const valor = resolverValorCampo(cronograma, v, agora)
    if (valor) out[v.campo] = valor
  }
  return out
}

export function formatarValorCampo(valor: ValorCampo | undefined): string {
  if (!valor) return '—'
  if (valor.tipo === 'data') return valor.data.toLocaleDateString('pt-BR')
  if (valor.tipo === 'percentual') return `${valor.pct.toFixed(0)}%`
  return valor.texto
}

export interface AtividadeSelecionavel {
  activityUid: number
  nome: string
  wbs: string
  isSummary: boolean
  isMilestone: boolean
}

/** Todas as atividades de UM cronograma (folha e resumo — a UI distingue pelo `isSummary`,
 * já que os dois usam o mesmo mecanismo de leitura de campo). */
export function listarAtividadesSelecionaveis(cronograma: CronogramaInfo | undefined): AtividadeSelecionavel[] {
  if (!cronograma) return []
  return [...cronograma.dados.activities]
    .map((a) => ({ activityUid: a.uid, nome: a.name, wbs: a.wbs, isSummary: a.isSummary, isMilestone: a.isMilestone }))
    .sort((x, y) => x.wbs.localeCompare(y.wbs, undefined, { numeric: true }))
}

export interface ColunaPersonalizada {
  fieldId: string
  nome: string
}

export function listarColunasPersonalizadas(cronograma: CronogramaInfo | undefined): ColunaPersonalizada[] {
  return cronograma?.dados.customFieldDefs.map((d) => ({ fieldId: d.fieldId, nome: d.name })) ?? []
}

/** Cor determinística por nome (mesmo nome → sempre a mesma cor), já que não existe
 * cadastro de cor por engenheiro — só o texto livre de programacao_engenheiros_area.
 * Usa distribuição angular em HSL para suportar任意 quantidade de engenheiros sem repetição. */
function corPorNome(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsl(${hue}, 65%, 45%)`
}

export interface EngenheiroDoSetor {
  nome: string | null
  cor: string
}

// Se mais de um campo estiver configurado, usa a atividade do primeiro campo desta
// ordem que resolver — avanço é o sinal mais forte de "de qual atividade este setor
// trata", datas são o fallback.
const PRIORIDADE_CAMPOS: CampoCard[] = ['avanco_concl', 'avanco_prev', 'inicio', 'termino']

/** Responsável do card = engenheiro já cadastrado em "Engenheiros por Área" (Programação)
 * pra área (EDT nível 2) da atividade de maior prioridade entre os campos configurados —
 * nunca digitado no cadastro do setor. Sem cadastro na Programação, o card fica sem
 * responsável (não é um campo obrigatório do Mapa de Setores). */
export function resolverEngenheiroDoMarcador(
  cronograma: CronogramaInfo | undefined,
  vinculos: VinculoCampo[],
  engenheirosArea: EngenheiroArea[],
): EngenheiroDoSetor {
  const porCampo = new Map(vinculos.map((v) => [v.campo, v]))
  for (const campo of PRIORIDADE_CAMPOS) {
    const v = porCampo.get(campo)
    if (!v) continue
    const atividade = atividadeDoVinculo(cronograma, v.activityUid)
    if (!atividade || !cronograma) continue
    const areaNivel2 = getAreaNivel2(buildAreaPathResolver(cronograma.dados.activities)(atividade.wbs))
    if (!areaNivel2) continue
    const linha = engenheirosArea.find((e) => e.area_nome === areaNivel2 && e.engenheiro)
    if (linha?.engenheiro) return { nome: linha.engenheiro, cor: corPorNome(linha.engenheiro) }
  }
  return { nome: null, cor: '#64748b' }
}

export interface ResumoGeral {
  /** Previsão da obra — projeto.percentualPlanejado (PV ponderado por custo), já
   * calculado e persistido pelo módulo de cronogramas (project-store.tsx). */
  previsao: number
  /** Avanço concluído total — projeto.percentualAvanco. */
  avancoTotal: number
  desvio: number
  /** Ritmo médio necessário por dia até dataFimPrevista pra fechar em 100%. `null` sem
   * data de término definida ou com o prazo já vencido. */
  metaDiaria: number | null
  /** avancoTotal de hoje − avanco_real_anterior (capturado no navegador antes da última
   * mudança de cronograma, ver project-store.tsx). `null` na primeira captura. */
  avancoDoDia: number | null
}

export function calcularResumoGeral(project: Project): ResumoGeral {
  const previsao = project.percentualPlanejado
  const avancoTotal = project.percentualAvanco
  const desvio = round2(avancoTotal - previsao)

  let metaDiaria: number | null = null
  if (project.dataFimPrevista) {
    const fim = new Date(project.dataFimPrevista).getTime()
    const diasRestantes = Math.ceil((fim - Date.now()) / 86400000)
    if (diasRestantes > 0) metaDiaria = round2(Math.max(0, 100 - avancoTotal) / diasRestantes)
  }

  const avancoDoDia = project.avancoRealAnterior != null ? round2(avancoTotal - project.avancoRealAnterior) : null

  return { previsao, avancoTotal, desvio, metaDiaria, avancoDoDia }
}

export interface MarcadorComAvanco {
  id: string
  nome: string
  avancoConcluido: number | null
}

/** Setor com pior Av. Concl entre os que já têm o campo configurado — usado no painel de
 * Destaques. `null` se nenhum marcador tem esse campo configurado ainda. */
export function setorComMenorAvanco(marcadores: MarcadorComAvanco[]): (MarcadorComAvanco & { avancoConcluido: number }) | null {
  const validos = marcadores.filter((m): m is MarcadorComAvanco & { avancoConcluido: number } => m.avancoConcluido != null)
  if (validos.length === 0) return null
  return validos.reduce((pior, m) => (m.avancoConcluido < pior.avancoConcluido ? m : pior))
}
