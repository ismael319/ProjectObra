import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ParsedProject, MetodoAvanco } from '@/lib/xml-parser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { fetchWithOfflineCacheDetailed, type OfflineCacheResult } from '@/lib/offline-query'

// "dados" (o ParsedProject inteiro — atividades, recursos, timephased) é o
// campo pesado de um cronograma; um cronograma real facilmente passa de
// vários MB depois de descomprimido. Carregar isso de TODOS os cronogramas
// de TODOS os projetos assim que o usuário loga (antes até de escolher um
// projeto) era o maior peso na lentidão de carregamento inicial. Esse objeto
// serve de placeholder pras entradas da lista de projetos (usada só pra
// mostrar nome/cor/versão do cronograma na tela de seleção) — os dados de
// verdade só são buscados quando o projeto é de fato aberto (ver
// hydrateProjectDados/setCurrentProject).
const EMPTY_PARSED_PROJECT: ParsedProject = {
  name: '',
  startDate: new Date(0),
  finishDate: new Date(0),
  author: '',
  company: '',
  description: '',
  activities: [],
  resources: [],
  assignments: [],
  baselines: [],
  timephased: {
    granularity: 'week',
    rawPoints: [],
    weeks: [],
    totals: { plannedHours: 0, actualHours: 0, baselineHours: {} },
    dateRange: { start: new Date(0), end: new Date(0) },
    available: false,
    baselineIndices: new Set(),
  },
  weekStartDay: 5,
  minutesPerDay: 540,
  customFieldDefs: [],
}

export interface CronogramaInfo {
  id: string
  nome: string
  descricao: string
  tipo: 'Geral' | 'Frente' | 'Disciplina' | 'Contratado' | 'Outro'
  versao: number
  ativo: boolean
  peso: number
  cor: string
  dataUpload: string
  dados: ParsedProject
  /**
   * Como o avanço (% Concluído) das tarefas deste cronograma foi calculado:
   * 'padrao' lê direto o que o MS Project já gravou (PercentComplete/Work);
   * 'quantidade' recalcula pela fórmula Número4/Número2 (avanço por medição de
   * serviço) — ver applyMetodoAvanco em xml-parser.ts. Escolhido uma vez no
   * upload; pra mudar é preciso reenviar o arquivo. Ausente em cronogramas
   * salvos antes desse campo existir → tratar como 'padrao'.
   */
  metodoAvanco: MetodoAvanco
  /**
   * Origem da "data de status" usada pela Curva S por peso (ver
   * src/lib/curva-s-peso.ts): 'cronograma' usa o <StatusDate> do próprio XML
   * (dados.statusDate); 'manual' usa dataStatusManual em vez disso. Ausente em
   * cronogramas salvos antes desse campo existir → tratar como 'cronograma'.
   */
  dataStatusModo: 'cronograma' | 'manual'
  /** Data de status manual (ISO yyyy-mm-dd), só usada quando dataStatusModo === 'manual'. */
  dataStatusManual: string | null
  /**
   * Qual motor a tela de Curva S usa pra este cronograma: 'hh' (curve-utils.ts,
   * trabalho/HH do MS Project, comportamento de sempre) ou 'peso' (curva-s-peso.ts,
   * peso atribuído em R$ — Número1). Escolhido aqui, não na própria tela da
   * Curva S. Ausente em cronogramas salvos antes desse campo existir → 'hh'.
   */
  tipoCurvaS: 'hh' | 'peso'
}

export interface Project {
  id: string
  nome: string
  codigo: string
  descricao: string
  status: 'ativo' | 'inativo' | 'arquivado'
  gestor: string
  dataInicio: string
  dataFimPrevista: string
  empresa: string
  localizacao: string
  tipoProjeto: string
  orcamento: number
  disciplinas: string[]
  areas: string[]
  equipe: string[]
  observacoes: string
  criadoEm: string
  atualizadoEm: string
  cronogramas: CronogramaInfo[]
  percentualAvanco: number
  /** Avanço planejado (EVM, ponderado por custo) — fonte do KPI `avanco_planejado_pct`
   * do Dashboard Macro. Calculado junto com percentualAvanco, nunca separado. */
  percentualPlanejado: number
  /** Snapshot de percentualAvanco capturado antes da ÚLTIMA mudança de cronograma —
   * usado só pelo Mapa de Setores pra "Avanço do dia" (ver capturarAvancoAnterior). */
  avancoRealAnterior: number | null
  avancoCapturadoEm: string | null
  imagemCapa?: string
  cronogramaPadraoId?: string
  // Campos do Dashboard Macro/Portfólio (ver plano cheerful-tinkering-cosmos).
  latitude?: number
  longitude?: number
  cliente?: string
  tipoObra?: string
  statusGeral: 'planejamento' | 'em_andamento' | 'paralisado' | 'concluido'
}

export type ConsolidationMethod = 'soma' | 'media_ponderada' | 'critico'

interface ProjectContextType {
  projects: Project[]
  currentProject: Project | null
  isLoadingProjects: boolean
  // true enquanto os dados completos (atividades, recursos, timephased) do
  // projeto que está virando "atual" ainda estão sendo buscados/descomprimidos
  // — currentProject só é atualizado depois que isso termina, então nenhuma
  // tela chega a ver cronogramas com dados pela metade.
  isHydratingCurrentProject: boolean
  usingOfflineCache: boolean
  offlineDataUpdatedAt: number | null
  setCurrentProject: (project: Project | null, options?: { skipCronogramaHydration?: boolean }) => Promise<boolean>
  createProject: (data: Omit<Project, 'id' | 'criadoEm' | 'atualizadoEm' | 'cronogramas' | 'percentualAvanco' | 'percentualPlanejado' | 'avancoRealAnterior' | 'avancoCapturadoEm'>) => Project | null
  updateProject: (id: string, data: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => Promise<Project | null>
  archiveProject: (id: string) => void
  addCronograma: (projectId: string, cronograma: CronogramaInfo) => Promise<void>
  removeCronograma: (projectId: string, cronogramaId: string) => void
  updateCronograma: (projectId: string, cronogramaId: string, data: Partial<CronogramaInfo>) => void
  toggleCronograma: (projectId: string, cronogramaId: string) => void
  recalculateAllDates: (projectId: string) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

// Preferência local de "qual projeto eu estava vendo por último" — não é
// dado de negócio (isso já vive no Supabase, compartilhado pela empresa),
// é só uma lembrança de conveniência por navegador.
const CURRENT_PROJECT_ID_KEY = 'obracontrol_current_project_id'

const CRON_COLORS = ['#9933FF', '#0066CC', '#00AA00', '#FF9900', '#CC0000', '#FF00FF', '#00CCCC', '#FFCC00', '#333333', '#FF6600']

function loadCurrentProjectId(scope: string): string | null {
  try {
    return localStorage.getItem(`${CURRENT_PROJECT_ID_KEY}:${scope}`)
  } catch {
    return null
  }
}

function ensureProjectWriteOnline(readOnlyData = false) {
  if (navigator.onLine && !readOnlyData) return true
  toast.warning('Modo offline somente leitura.', { description: 'Reconecte-se antes de alterar projetos ou cronogramas.' })
  return false
}

function saveCurrentProjectId(scope: string | null, id: string | null) {
  if (!scope) return
  try {
    const key = `${CURRENT_PROJECT_ID_KEY}:${scope}`
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch { /* navegador sem localStorage disponível — só perde a conveniência */ }
}

// ============ Mapeamento entre o formato do Supabase (snake_case) e o
// formato usado pelo resto do app (camelCase, tipo `Project`/`CronogramaInfo`) ============

interface CronogramaRow {
  id: string
  nome: string
  descricao: string | null
  tipo: string
  versao: number
  ativo: boolean
  peso: number | string | null
  cor: string | null
  data_upload: string
  // Coluna nova (migration 20260818...) — pode não existir ainda em bancos que
  // não rodaram a migration; por isso mapCronogramaRow/mapCronogramaMetaRow
  // tratam null/undefined como 'padrao' em vez de assumir que sempre vem preenchida.
  metodo_avanco: string | null
  // Colunas novas (migration 20260819010000, Curva S) — mesmo tratamento de
  // ausência que metodo_avanco acima.
  data_status_modo: string | null
  data_status_manual: string | null
  // Coluna nova (migration 20260819020000, Curva S) — mesmo tratamento de ausência.
  tipo_curva_s: string | null
  dados: ParsedProject
}

// Mesmas colunas de CronogramaRow, sem "dados" — usada na lista de projetos
// (tela de seleção), que só mostra nome/cor/versão do cronograma.
type CronogramaMetaRow = Omit<CronogramaRow, 'dados'>

interface ProjetoRow<C = CronogramaRow> {
  id: string
  nome: string
  codigo: string | null
  descricao: string | null
  status: string | null
  gestor: string | null
  data_inicio: string | null
  data_fim_prevista: string | null
  empresa: string | null
  localizacao: string | null
  tipo_projeto: string | null
  orcamento: number | string | null
  disciplinas: string[] | null
  areas: string[] | null
  equipe: string[] | null
  observacoes: string | null
  percentual_avanco: number | string
  percentual_planejado: number | string | null
  avanco_real_anterior: number | string | null
  avanco_capturado_em: string | null
  imagem_capa: string | null
  cronograma_padrao_id: string | null
  criado_em: string
  atualizado_em: string
  latitude: number | string | null
  longitude: number | string | null
  cliente: string | null
  tipo_obra: string | null
  status_geral: string | null
  projeto_cronogramas: C[] | null
}

// JSON não tem tipo "Date" — depois que `dados` (o ParsedProject inteiro, com
// datas de atividades, baselines e timephased) vai pro Supabase e volta, todo
// campo que era `Date` no parser do XML volta como string ISO simples. Sem
// reviver isso aqui, qualquer tela que chama .getTime()/.toLocaleDateString()
// nesses campos quebra — mas só depois de recarregar a página (dados recém
// parseados na mesma sessão continuam sendo Date de verdade, por isso esse
// bug só aparece depois que o cronograma já foi salvo e lido de volta).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

function reviveDates(value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) return new Date(value)
  if (Array.isArray(value)) return value.map(reviveDates)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) result[k] = reviveDates(v)
    return result
  }
  return value
}

// ============ Compressão do payload de "dados" ============
// O maior peso de um cronograma não são as atividades, é o `timephased`
// (distribuição de trabalho período a período de cada recurso alocado) — pra
// um cronograma real isso facilmente passa de várias dezenas de milhares de
// pontos. Sem compressão, o upsert desse JSON estourava algum limite de
// tamanho/timeout do lado do Supabase e a requisição falhava sem nem voltar
// resposta ("TypeError: Failed to fetch"). Comprime com gzip (nativo do
// navegador) antes de enviar, e descomprime ao ler de volta.
const DADOS_GZIP_KEY = '__gzip'

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function compressDados(dados: ParsedProject): Promise<{ __gzip: string }> {
  const bytes = new TextEncoder().encode(JSON.stringify(dados))
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer())
  return { [DADOS_GZIP_KEY]: uint8ToBase64(compressed) }
}

async function decompressDados(raw: unknown): Promise<ParsedProject> {
  if (raw && typeof raw === 'object' && DADOS_GZIP_KEY in raw) {
    const base64 = (raw as Record<string, unknown>)[DADOS_GZIP_KEY]
    if (typeof base64 === 'string') {
      const ds = new DecompressionStream('gzip')
      const writer = ds.writable.getWriter()
      writer.write(base64ToUint8(base64) as BufferSource)
      writer.close()
      const decompressed = new Uint8Array(await new Response(ds.readable).arrayBuffer())
      const parsed = JSON.parse(new TextDecoder().decode(decompressed))
      return reviveDates(parsed) as ParsedProject
    }
  }
  // Compatibilidade com linhas antigas salvas sem compressão (JSON puro).
  return reviveDates(raw) as ParsedProject
}

async function mapCronogramaRow(row: CronogramaRow): Promise<CronogramaInfo> {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? '',
    tipo: row.tipo as CronogramaInfo['tipo'],
    versao: row.versao,
    ativo: row.ativo,
    peso: Number(row.peso ?? 0),
    cor: row.cor ?? CRON_COLORS[0],
    dataUpload: row.data_upload,
    metodoAvanco: (row.metodo_avanco as MetodoAvanco) ?? 'padrao',
    dataStatusModo: (row.data_status_modo as CronogramaInfo['dataStatusModo']) ?? 'cronograma',
    dataStatusManual: row.data_status_manual ?? null,
    tipoCurvaS: (row.tipo_curva_s as CronogramaInfo['tipoCurvaS']) ?? 'hh',
    dados: await decompressDados(row.dados),
  }
}

// Igual a mapCronogramaRow, mas sem "dados" (não veio da consulta) — usa o
// placeholder, hidratado depois sob demanda.
async function mapCronogramaMetaRow(row: CronogramaMetaRow): Promise<CronogramaInfo> {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? '',
    tipo: row.tipo as CronogramaInfo['tipo'],
    versao: row.versao,
    ativo: row.ativo,
    peso: Number(row.peso ?? 0),
    cor: row.cor ?? CRON_COLORS[0],
    dataUpload: row.data_upload,
    metodoAvanco: (row.metodo_avanco as MetodoAvanco) ?? 'padrao',
    dataStatusModo: (row.data_status_modo as CronogramaInfo['dataStatusModo']) ?? 'cronograma',
    dataStatusManual: row.data_status_manual ?? null,
    tipoCurvaS: (row.tipo_curva_s as CronogramaInfo['tipoCurvaS']) ?? 'hh',
    dados: EMPTY_PARSED_PROJECT,
  }
}

async function mapProjetoRow<C>(row: ProjetoRow<C>, mapCronograma: (c: C) => Promise<CronogramaInfo>): Promise<Project> {
  return {
    id: row.id,
    nome: row.nome,
    codigo: row.codigo ?? '',
    descricao: row.descricao ?? '',
    status: (row.status as Project['status']) ?? 'ativo',
    gestor: row.gestor ?? '',
    dataInicio: row.data_inicio ?? '',
    dataFimPrevista: row.data_fim_prevista ?? '',
    empresa: row.empresa ?? '',
    localizacao: row.localizacao ?? '',
    tipoProjeto: row.tipo_projeto ?? '',
    orcamento: Number(row.orcamento ?? 0),
    disciplinas: row.disciplinas ?? [],
    areas: row.areas ?? [],
    equipe: row.equipe ?? [],
    observacoes: row.observacoes ?? '',
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    cronogramas: await Promise.all((row.projeto_cronogramas ?? []).map(mapCronograma)),
    percentualAvanco: Number(row.percentual_avanco ?? 0),
    percentualPlanejado: Number(row.percentual_planejado ?? 0),
    avancoRealAnterior: row.avanco_real_anterior != null ? Number(row.avanco_real_anterior) : null,
    avancoCapturadoEm: row.avanco_capturado_em ?? null,
    imagemCapa: row.imagem_capa ?? undefined,
    cronogramaPadraoId: row.cronograma_padrao_id ?? undefined,
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    cliente: row.cliente ?? undefined,
    tipoObra: row.tipo_obra ?? undefined,
    statusGeral: (row.status_geral as Project['statusGeral']) ?? 'em_andamento',
  }
}

function projectToRow(project: Project) {
  return {
    nome: project.nome,
    codigo: project.codigo,
    descricao: project.descricao,
    status: project.status,
    gestor: project.gestor,
    data_inicio: project.dataInicio || null,
    data_fim_prevista: project.dataFimPrevista || null,
    empresa: project.empresa,
    localizacao: project.localizacao,
    tipo_projeto: project.tipoProjeto,
    orcamento: project.orcamento,
    disciplinas: project.disciplinas,
    areas: project.areas,
    equipe: project.equipe,
    observacoes: project.observacoes,
    percentual_avanco: project.percentualAvanco,
    percentual_planejado: project.percentualPlanejado,
    avanco_real_anterior: project.avancoRealAnterior ?? null,
    avanco_capturado_em: project.avancoCapturadoEm ?? null,
    imagem_capa: project.imagemCapa ?? null,
    cronograma_padrao_id: project.cronogramaPadraoId ?? null,
    atualizado_em: project.atualizadoEm,
    latitude: project.latitude ?? null,
    longitude: project.longitude ?? null,
    cliente: project.cliente ?? null,
    tipo_obra: project.tipoObra ?? null,
    status_geral: project.statusGeral,
  }
}

async function cronogramaToRow(projetoId: string, c: CronogramaInfo) {
  return {
    id: c.id,
    projeto_id: projetoId,
    nome: c.nome,
    descricao: c.descricao,
    tipo: c.tipo,
    versao: c.versao,
    ativo: c.ativo,
    peso: c.peso,
    cor: c.cor,
    data_upload: c.dataUpload,
    metodo_avanco: c.metodoAvanco,
    data_status_modo: c.dataStatusModo,
    data_status_manual: c.dataStatusManual,
    tipo_curva_s: c.tipoCurvaS,
    dados: await compressDados(c.dados),
  }
}

// ============ Funções que conversam com o Supabase (banco de dados na nuvem) ============
// Todas rodam "em segundo plano" (fire-and-forget): o estado local já foi
// atualizado antes de chamá-las, então a tela nunca fica esperando a rede.

// Erros do PostgREST (Supabase) não são instâncias de Error — são objetos
// { message, details, hint, code }. Extrai algo legível pra mostrar direto
// no toast, sem depender do usuário abrir o DevTools pra ver a causa real.
function mensagemDeErro(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    const partes = [e.message, e.details, e.hint].filter(Boolean)
    if (partes.length > 0) return `${partes.join(' — ')}${e.code ? ` (${e.code})` : ''}`
  }
  return String(error)
}

// Lista "leve" — sem a coluna "dados" de cada cronograma (o blob comprimido
// pesado). É o que alimenta a tela de seleção de projetos, que só mostra
// nome/cor/versão do cronograma, nunca as atividades. Buscar tudo de uma vez
// (dados incluídos) pra todos os projetos era o maior peso no carregamento
// inicial — agora os dados completos só são buscados quando um projeto
// específico é aberto (ver loadCronogramasDadosRemote/hydrateProjectDados).
async function loadProjectsRemote(organizacaoId: string | null, cacheScope: string): Promise<OfflineCacheResult<Project[]>> {
  return fetchWithOfflineCacheDetailed(`projects:v1:${cacheScope}`, async () => {
    let query = supabase
    .from('projetos')
    .select('*, projeto_cronogramas(id, nome, descricao, tipo, versao, ativo, peso, cor, data_upload, metodo_avanco, data_status_modo, data_status_manual, tipo_curva_s)')
    .order('criado_em', { ascending: true })

    if (organizacaoId) query = query.eq('organizacao_id', organizacaoId)
    const { data, error, status } = await query

    if (error) return { data: null, error, status }
    const projects = await Promise.all((data as ProjetoRow<CronogramaMetaRow>[]).map((row) => mapProjetoRow(row, mapCronogramaMetaRow)))
    return { data: projects, error: null, status }
  })
}

// Busca os "dados" completos (descomprimidos) de cada cronograma de UM
// projeto — chamada só quando o projeto é de fato aberto (setCurrentProject).
async function loadCronogramasDadosRemote(projetoId: string, cacheScope: string): Promise<OfflineCacheResult<Map<string, ParsedProject>>> {
  const result = await fetchWithOfflineCacheDetailed(`project-data:v1:${cacheScope}:${projetoId}`, async () => {
    const { data, error, status } = await supabase
      .from('projeto_cronogramas')
      .select('id, dados')
      .eq('projeto_id', projetoId)

    return { data: error ? null : data as { id: string; dados: unknown }[], error, status }
  })
  const entries = await Promise.all(result.data.map(async (row) => [row.id, await decompressDados(row.dados)] as const))
  return { ...result, data: new Map(entries) }
}

async function insertProjectRemote(project: Project, organizacaoId: string, userId?: string) {
  try {
    const { error } = await supabase.from('projetos').insert({
      id: project.id,
      organizacao_id: organizacaoId,
      criado_por: userId,
      criado_em: project.criadoEm,
      ...projectToRow(project),
    })
    if (error) throw error
  } catch (error) {
    console.error('Falha ao criar projeto no Supabase.', error)
    toast.error('Não foi possível salvar o projeto na nuvem.', { description: mensagemDeErro(error), duration: 20000 })
  }
}

async function updateProjectRemote(project: Project) {
  try {
    const { error } = await supabase.from('projetos').update(projectToRow(project)).eq('id', project.id)
    if (error) throw error
  } catch (error) {
    console.error('Falha ao atualizar projeto no Supabase.', error)
    toast.error('Não foi possível salvar as alterações do projeto.', { description: mensagemDeErro(error), duration: 20000 })
  }
}

async function deleteProjectRemote(id: string) {
  try {
    const { error } = await supabase.from('projetos').delete().eq('id', id)
    if (error) throw error
  } catch (error) {
    console.error('Falha ao remover projeto no Supabase.', error)
    toast.error('Não foi possível remover o projeto.', { description: mensagemDeErro(error), duration: 20000 })
  }
}

// Envolve tudo em try/catch de propósito: erros de rede (timeout, payload
// grande demais, conexão caindo) lançam exceção em vez de retornar
// `{ error }` estruturado — sem isso, essas falhas ficavam silenciosas
// (promise rejeitada sem handler) e o cronograma "sumia" sem nenhum aviso.
//
// Cada cronograma vai em uma requisição própria (não um upsert em lote de
// todos de uma vez): um cronograma grande demais estourando algum limite do
// gateway do Supabase não pode derrubar o salvamento dos outros junto.
async function syncCronogramasRemote(projetoId: string, cronogramas: CronogramaInfo[]) {
  const falhas: string[] = []

  for (const c of cronogramas) {
    try {
      const row = await cronogramaToRow(projetoId, c)
      const { error } = await supabase.from('projeto_cronogramas').upsert(row)
      if (error) throw error
    } catch (error) {
      console.error(`Falha ao salvar o cronograma "${c.nome}" no Supabase.`, error)
      falhas.push(`"${c.nome}": ${mensagemDeErro(error)}`)
    }
  }

  try {
    const idsAtuais = cronogramas.map((c) => c.id)
    const deleteQuery = supabase.from('projeto_cronogramas').delete().eq('projeto_id', projetoId)
    const { error: erroDelete } = idsAtuais.length > 0
      ? await deleteQuery.not('id', 'in', `(${idsAtuais.join(',')})`)
      : await deleteQuery
    if (erroDelete) throw erroDelete
  } catch (error) {
    console.error('Falha ao remover cronogramas antigos no Supabase.', error)
    falhas.push(`limpeza de cronogramas antigos: ${mensagemDeErro(error)}`)
  }

  if (falhas.length > 0) {
    toast.error('Não foi possível salvar 1 ou mais cronogramas na nuvem — a versão local pode se perder ao recarregar.', {
      description: falhas.join('\n'),
      duration: 30000,
    })
  }
}

// Salva o projeto inteiro (dados do projeto + cronogramas) depois de qualquer
// mudança — chamada "em segundo plano" pelas funções abaixo.
async function syncProjectRemote(project: Project) {
  await updateProjectRemote(project)
  await syncCronogramasRemote(project.id, project.cronogramas)
}

function calcAvancoFromCronogramas(cronogramas: CronogramaInfo[]): number {
  const active = cronogramas.filter((c) => c.ativo)
  if (active.length === 0) return 0
  const allNonSummary = active.flatMap((c) => c.dados.activities.filter((a) => !a.isSummary))
  if (allNonSummary.length === 0) return 0
  return Math.round(allNonSummary.reduce((sum, a) => sum + a.percentComplete, 0) / allNonSummary.length)
}

// Avanço FÍSICO (acima) é a média simples de percentComplete — não pondera por
// custo, então não dá pra comparar direto com "quanto já deveria ter sido feito
// hoje" (o avanço PLANEJADO precisa ponderar por custo/duração, senão uma tarefa
// de 2 dias e outra de 2 meses pesam igual). Mesma fórmula de Valor Planejado já
// usada em EVMIndicators.tsx (PV = custo × fração decorrida do prazo de cada
// atividade, até hoje) — reaproveitada aqui só pra ter o % agregado, sem os
// outros índices (SPI/CPI/EAC) que esse card mostra.
//
// Persistido em projetos.percentual_planejado (Fase C do Dashboard Macro) pelo
// mesmo motivo de percentual_avanco: o servidor não tem como recalcular isso a
// partir do `dados` comprimido de cada cronograma — o valor precisa nascer no
// navegador e ser gravado como um número simples.
// Cronogramas com metodoAvanco === 'quantidade' já trazem, por tarefa, o avanço
// planejado calculado pela fórmula por quantidade (a.percentPlanejadoQuantidade
// — ver applyMetodoAvanco em xml-parser.ts); os demais usam a fração de tempo
// decorrida (mesma lógica de sempre). Os dois são combinados aqui, ponderados
// por custo, pra dar um único percentual agregado — igual já acontecia entre
// tarefas de cronogramas 'padrao' diferentes.
function calcPlanejadoFromCronogramas(cronogramas: CronogramaInfo[]): number {
  const active = cronogramas.filter((c) => c.ativo)
  if (active.length === 0) return 0
  const now = new Date().getTime()
  let bac = 0
  let pv = 0
  for (const c of active) {
    for (const a of c.dados.activities) {
      if (a.isSummary) continue
      const cost = a.cost || 0
      bac += cost
      if (c.metodoAvanco === 'quantidade') {
        pv += cost * ((a.percentPlanejadoQuantidade ?? 0) / 100)
        continue
      }
      const start = new Date(a.start).getTime()
      const finish = new Date(a.finish).getTime()
      const totalDuration = finish - start
      const elapsed = Math.min(now - start, totalDuration)
      const progress = totalDuration > 0 ? Math.max(0, elapsed / totalDuration) : 0
      pv += cost * progress
    }
  }
  if (bac <= 0) return 0
  return Math.round((pv / bac) * 100)
}

// Captura, ANTES de recalcular percentualAvanco, o valor que ele tinha até agora —
// usado só pelo Mapa de Setores pra "Avanço do dia" (avancoTotal de hoje menos este
// valor). Sem tabela de snapshot: o servidor não decodifica o `dados` comprimido do
// cronograma, então esse número (como percentualAvanco/percentualPlanejado) só pode
// nascer aqui, no navegador, no instante em que o valor antigo ainda está disponível em
// `p` (o estado ANTES desta mutação).
function capturarAvancoAnterior(p: Project): { avancoRealAnterior: number; avancoCapturadoEm: string } {
  return { avancoRealAnterior: p.percentualAvanco, avancoCapturadoEm: new Date().toISOString() }
}

/** Calcula a data de início mais antiga e a data de término mais distante entre todos os cronogramas que possuem dados. */
function calcDatesFromCronogramas(cronogramas: CronogramaInfo[]): { dataInicio: string; dataFimPrevista: string } | null {
  const withDates = cronogramas
    .filter((c) => c.dados?.startDate && c.dados?.finishDate)
    .map((c) => ({
      start: new Date(c.dados.startDate).getTime(),
      finish: new Date(c.dados.finishDate).getTime(),
    }))
  if (withDates.length === 0) return null
  const earliest = Math.min(...withDates.map((d) => d.start))
  const latest = Math.max(...withDates.map((d) => d.finish))
  return {
    dataInicio: new Date(earliest).toISOString(),
    dataFimPrevista: new Date(latest).toISOString(),
  }
}

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const { user, userProfile, isLoadingProfile } = useAuth()
  const userId = user?.id ?? null
  const organizacaoId = userProfile?.organizacao_id ?? null
  const isInsercaoPontual = userProfile?.papel === 'insercao_pontual'
  const cacheScope = userId ? `${organizacaoId ?? 'all'}:${userId}` : null

  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isHydratingCurrentProject, setIsHydratingCurrentProject] = useState(false)
  const [usingOfflineCache, setUsingOfflineCache] = useState(false)
  const [offlineDataUpdatedAt, setOfflineDataUpdatedAt] = useState<number | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  // IDs de projeto cujos cronogramas já têm os "dados" completos carregados
  // (não é state — não precisa re-render, só evita rebuscar o mesmo projeto
  // duas vezes na mesma sessão).
  const hydratedProjectIds = useRef<Set<string>>(new Set())
  const loadGeneration = useRef(0)

  const recordOfflineResult = useCallback((result: Pick<OfflineCacheResult<unknown>, 'source' | 'cachedAt'>) => {
    if (result.source !== 'cache') return
    setUsingOfflineCache(true)
    setOfflineDataUpdatedAt((current) => current ? Math.min(current, result.cachedAt) : result.cachedAt)
  }, [])

  // Busca os dados completos dos cronogramas de um projeto (se ainda não
  // buscados nesta sessão) e devolve o projeto já "hidratado" — usado tanto
  // ao abrir um projeto quanto antes de duplicá-lo (pra não copiar
  // cronogramas com dados vazios).
  const hydrateProject = useCallback(async (project: Project, generation = loadGeneration.current): Promise<Project> => {
    if (hydratedProjectIds.current.has(project.id) || project.cronogramas.length === 0) {
      if (generation === loadGeneration.current) hydratedProjectIds.current.add(project.id)
      return project
    }
    if (!cacheScope) throw new Error('Sessão indisponível para carregar o projeto')
    const result = await loadCronogramasDadosRemote(project.id, cacheScope)
    const dadosPorCronograma = result.data
    const missingCronogramas = project.cronogramas.filter((cronograma) => !dadosPorCronograma.has(cronograma.id))
    if (missingCronogramas.length > 0) {
      throw new Error('Os dados salvos deste projeto estão incompletos. Conecte-se para atualizá-los.')
    }
    const hydrated: Project = {
      ...project,
      cronogramas: project.cronogramas.map((c) =>
        dadosPorCronograma.has(c.id) ? { ...c, dados: dadosPorCronograma.get(c.id)! } : c
      ),
    }
    if (generation === loadGeneration.current) {
      recordOfflineResult(result)
      hydratedProjectIds.current.add(project.id)
      setProjects((prev) => prev.map((p) => (p.id === hydrated.id ? hydrated : p)))
    }
    return hydrated
  }, [cacheScope, recordOfflineResult])

  useEffect(() => {
    const reloadWhenOnline = () => setReloadVersion((current) => current + 1)
    window.addEventListener('online', reloadWhenOnline)
    return () => window.removeEventListener('online', reloadWhenOnline)
  }, [])

  useEffect(() => {
    if (!userId) {
      loadGeneration.current += 1
      setProjects([])
      setCurrentProjectState(null)
      setIsLoadingProjects(false)
      setIsHydratingCurrentProject(false)
      setUsingOfflineCache(false)
      setOfflineDataUpdatedAt(null)
      hydratedProjectIds.current.clear()
      return
    }
    if (isLoadingProfile || !cacheScope) {
      setIsLoadingProjects(true)
      return
    }

    let cancelled = false
    const generation = ++loadGeneration.current
    setIsLoadingProjects(true)
    setUsingOfflineCache(false)
    setOfflineDataUpdatedAt(null)
    hydratedProjectIds.current.clear()

    const loadProjects = async () => {
      try {
        const result = await loadProjectsRemote(organizacaoId, cacheScope)
        if (cancelled || generation !== loadGeneration.current) return
        recordOfflineResult(result)
        const loaded = result.data
        setProjects(loaded)

        // Apontadores só precisam do id da obra para consultar os catálogos e
        // lançar efetivo. Com uma única obra vinculada, seleciona-a sem baixar
        // os dados pesados dos cronogramas.
        if (isInsercaoPontual) {
          const onlyProject = loaded.length === 1 ? loaded[0] : null
          saveCurrentProjectId(cacheScope, onlyProject?.id ?? null)
          setCurrentProjectState(onlyProject)
          return
        }

        const savedId = loadCurrentProjectId(cacheScope)
        const saved = savedId ? loaded.find((project) => project.id === savedId) ?? null : null
        if (!saved) {
          if (generation === loadGeneration.current) setCurrentProjectState(null)
          return
        }
        setIsHydratingCurrentProject(true)
        const hydrated = await hydrateProject(saved, generation)
        if (!cancelled && generation === loadGeneration.current) setCurrentProjectState(hydrated)
      } catch (error) {
        if (cancelled || generation !== loadGeneration.current) return
        console.error('Falha ao carregar projetos.', error)
        toast.error('Não foi possível carregar seus projetos.', { description: mensagemDeErro(error), duration: 20000 })
      } finally {
        if (!cancelled && generation === loadGeneration.current) {
          setIsLoadingProjects(false)
          setIsHydratingCurrentProject(false)
        }
      }
    }

    void loadProjects()
    return () => {
      cancelled = true
      if (loadGeneration.current === generation) loadGeneration.current += 1
    }
  }, [userId, organizacaoId, isInsercaoPontual, isLoadingProfile, reloadVersion, cacheScope, hydrateProject, recordOfflineResult])

  const setCurrentProject = async (project: Project | null, options?: { skipCronogramaHydration?: boolean }) => {
    const generation = ++loadGeneration.current
    setIsLoadingProjects(false)
    saveCurrentProjectId(cacheScope, project?.id ?? null)
    if (!project) {
      setCurrentProjectState(null)
      setIsHydratingCurrentProject(false)
      return true
    }
    if (options?.skipCronogramaHydration) {
      setCurrentProjectState(project)
      setIsHydratingCurrentProject(false)
      return true
    }
    if (hydratedProjectIds.current.has(project.id)) {
      setCurrentProjectState(project)
      setIsHydratingCurrentProject(false)
      return true
    }
    setIsHydratingCurrentProject(true)
    try {
      const hydrated = await hydrateProject(project, generation)
      if (generation !== loadGeneration.current) return false
      setCurrentProjectState(hydrated)
      return true
    } finally {
      if (generation === loadGeneration.current) setIsHydratingCurrentProject(false)
    }
  }

  const createProject = (data: Omit<Project, 'id' | 'criadoEm' | 'atualizadoEm' | 'cronogramas' | 'percentualAvanco' | 'percentualPlanejado' | 'avancoRealAnterior' | 'avancoCapturadoEm'>): Project | null => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return null
    const newProject: Project = {
      ...data,
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      cronogramas: [],
      percentualAvanco: 0,
      percentualPlanejado: 0,
      avancoRealAnterior: null,
      avancoCapturadoEm: null,
    }
    setProjects((prev) => [...prev, newProject])
    if (organizacaoId) {
      insertProjectRemote(newProject, organizacaoId, userId ?? undefined)
    } else {
      toast.error('Não foi possível identificar sua empresa — o projeto não foi salvo na nuvem.')
    }
    return newProject
  }

  const updateProject = (id: string, data: Partial<Project>) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        updated = { ...p, ...data, atualizadoEm: new Date().toISOString() }
        return updated
      })
    )
    if (currentProject?.id === id) {
      setCurrentProjectState((prev) => (prev ? { ...prev, ...data, atualizadoEm: new Date().toISOString() } : null))
    }
    if (updated) syncProjectRemote(updated)
  }

  const deleteProject = (id: string) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (currentProject?.id === id) {
      setCurrentProject(null)
    }
    deleteProjectRemote(id)
  }

  const duplicateProject = async (id: string): Promise<Project | null> => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return null
    const original = projects.find((p) => p.id === id)
    if (!original) throw new Error('Projeto não encontrado')
    // A entrada em `projects` pode só ter os metadados dos cronogramas (lista
    // carrega tudo "leve" — ver loadProjectsRemote) — hidrata antes de copiar,
    // senão a duplicata sai com os cronogramas sem atividades/recursos.
    const generation = loadGeneration.current
    const hydratedOriginal = await hydrateProject(original, generation)
    if (generation !== loadGeneration.current) return null
    const duplicate: Project = {
      ...hydratedOriginal,
      id: crypto.randomUUID(),
      nome: `${hydratedOriginal.nome} (Cópia)`,
      codigo: `${hydratedOriginal.codigo}-COPIA`,
      status: 'inativo',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      cronogramas: hydratedOriginal.cronogramas.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
        nome: `${c.nome} (Cópia)`,
      })),
    }
    hydratedProjectIds.current.add(duplicate.id)
    setProjects((prev) => [...prev, duplicate])
    if (organizacaoId) {
      insertProjectRemote(duplicate, organizacaoId, userId ?? undefined).then(() => syncCronogramasRemote(duplicate.id, duplicate.cronogramas))
    }
    return duplicate
  }

  const archiveProject = (id: string) => {
    updateProject(id, { status: 'arquivado' })
  }

  const addCronograma = async (projectId: string, cronograma: CronogramaInfo) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const existing = p.cronogramas || []
        const nextVersion = existing.filter((c) => c.nome === cronograma.nome).length + 1
        const newC = { ...cronograma, versao: nextVersion }
        const novosCronogramas = [
          ...existing.map((c) => (c.nome === cronograma.nome ? { ...c, ativo: false } : c)),
          newC,
        ]
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          ...capturarAvancoAnterior(p),
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
          percentualPlanejado: calcPlanejadoFromCronogramas(novosCronogramas),
          ...dates,
          atualizadoEm: new Date().toISOString(),
        }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    // Diferente das outras ações (fire-and-forget): aqui o chamador (o modal de
    // upload) precisa aguardar o envio pra nuvem terminar antes de fechar a
    // tela — senão o usuário acha que salvou e o cronograma pode ter falhado.
    if (updated) await syncProjectRemote(updated)
  }

  const removeCronograma = (projectId: string, cronogramaId: string) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.filter((c) => c.id !== cronogramaId)
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          ...capturarAvancoAnterior(p),
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
          percentualPlanejado: calcPlanejadoFromCronogramas(novosCronogramas),
          ...dates,
          atualizadoEm: new Date().toISOString(),
        }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    if (updated) syncProjectRemote(updated)
  }

  const updateCronograma = (projectId: string, cronogramaId: string, data: Partial<CronogramaInfo>) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.map((c) => (c.id === cronogramaId ? { ...c, ...data } : c))
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          ...capturarAvancoAnterior(p),
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
          percentualPlanejado: calcPlanejadoFromCronogramas(novosCronogramas),
          ...dates,
          atualizadoEm: new Date().toISOString(),
        }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    if (updated) syncProjectRemote(updated)
  }

  const recalculateAllDates = (projectId: string) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const dates = calcDatesFromCronogramas(p.cronogramas)
        updated = { ...p, ...capturarAvancoAnterior(p), percentualAvanco: calcAvancoFromCronogramas(p.cronogramas), percentualPlanejado: calcPlanejadoFromCronogramas(p.cronogramas), ...dates, atualizadoEm: new Date().toISOString() }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    if (updated) syncProjectRemote(updated)
  }

  const toggleCronograma = (projectId: string, cronogramaId: string) => {
    if (!ensureProjectWriteOnline(usingOfflineCache || isLoadingProjects)) return
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.map((c) => (c.id === cronogramaId ? { ...c, ativo: !c.ativo } : c))
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          ...capturarAvancoAnterior(p),
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
          percentualPlanejado: calcPlanejadoFromCronogramas(novosCronogramas),
          ...dates,
          atualizadoEm: new Date().toISOString(),
        }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    if (updated) syncProjectRemote(updated)
  }

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        isLoadingProjects,
        isHydratingCurrentProject,
        usingOfflineCache,
        offlineDataUpdatedAt,
        setCurrentProject,
        createProject,
        updateProject,
        deleteProject,
        duplicateProject,
        archiveProject,
        addCronograma,
        removeCronograma,
        updateCronograma,
        toggleCronograma,
        recalculateAllDates,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjects() {
  const context = useContext(ProjectContext)
  if (!context) throw new Error('useProjects must be used within ProjectProvider')
  return context
}

export const CRON_COLORS_CONST = CRON_COLORS
