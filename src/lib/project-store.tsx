import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ParsedProject } from '@/lib/xml-parser'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

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
  imagemCapa?: string
  cronogramaPadraoId?: string
}

export type ConsolidationMethod = 'soma' | 'media_ponderada' | 'critico'

interface ProjectContextType {
  projects: Project[]
  currentProject: Project | null
  isLoadingProjects: boolean
  setCurrentProject: (project: Project | null) => void
  createProject: (data: Omit<Project, 'id' | 'criadoEm' | 'atualizadoEm' | 'cronogramas' | 'percentualAvanco'>) => Project
  updateProject: (id: string, data: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => Project
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

function loadCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_ID_KEY)
  } catch {
    return null
  }
}

function saveCurrentProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_PROJECT_ID_KEY, id)
    else localStorage.removeItem(CURRENT_PROJECT_ID_KEY)
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
  dados: ParsedProject
}

interface ProjetoRow {
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
  imagem_capa: string | null
  cronograma_padrao_id: string | null
  criado_em: string
  atualizado_em: string
  projeto_cronogramas: CronogramaRow[] | null
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
    dados: await decompressDados(row.dados),
  }
}

async function mapProjetoRow(row: ProjetoRow): Promise<Project> {
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
    cronogramas: await Promise.all((row.projeto_cronogramas ?? []).map(mapCronogramaRow)),
    percentualAvanco: Number(row.percentual_avanco ?? 0),
    imagemCapa: row.imagem_capa ?? undefined,
    cronogramaPadraoId: row.cronograma_padrao_id ?? undefined,
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
    imagem_capa: project.imagemCapa ?? null,
    cronograma_padrao_id: project.cronogramaPadraoId ?? null,
    atualizado_em: project.atualizadoEm,
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

async function loadProjectsRemote(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projetos')
    .select('*, projeto_cronogramas(*)')
    .order('criado_em', { ascending: true })

  if (error) {
    console.error('Falha ao carregar projetos do Supabase.', error)
    toast.error('Não foi possível carregar seus projetos.', { description: mensagemDeErro(error), duration: 20000 })
    return []
  }
  return Promise.all((data as ProjetoRow[]).map(mapProjetoRow))
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
  const { user, userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? null

  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)

  useEffect(() => {
    if (!user) {
      setProjects([])
      setCurrentProjectState(null)
      setIsLoadingProjects(false)
      return
    }

    let cancelled = false
    setIsLoadingProjects(true)
    loadProjectsRemote().then((loaded) => {
      if (cancelled) return
      setProjects(loaded)
      const savedId = loadCurrentProjectId()
      setCurrentProjectState(savedId ? loaded.find((p) => p.id === savedId) ?? null : null)
      setIsLoadingProjects(false)
    })
    return () => { cancelled = true }
  }, [user?.id])

  const setCurrentProject = (project: Project | null) => {
    setCurrentProjectState(project)
    saveCurrentProjectId(project?.id ?? null)
  }

  const createProject = (data: Omit<Project, 'id' | 'criadoEm' | 'atualizadoEm' | 'cronogramas' | 'percentualAvanco'>): Project => {
    const newProject: Project = {
      ...data,
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      cronogramas: [],
      percentualAvanco: 0,
    }
    setProjects((prev) => [...prev, newProject])
    if (organizacaoId) {
      insertProjectRemote(newProject, organizacaoId, user?.id)
    } else {
      toast.error('Não foi possível identificar sua empresa — o projeto não foi salvo na nuvem.')
    }
    return newProject
  }

  const updateProject = (id: string, data: Partial<Project>) => {
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
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (currentProject?.id === id) {
      setCurrentProject(null)
    }
    deleteProjectRemote(id)
  }

  const duplicateProject = (id: string): Project => {
    const original = projects.find((p) => p.id === id)
    if (!original) throw new Error('Projeto não encontrado')
    const duplicate: Project = {
      ...original,
      id: crypto.randomUUID(),
      nome: `${original.nome} (Cópia)`,
      codigo: `${original.codigo}-COPIA`,
      status: 'inativo',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      cronogramas: original.cronogramas.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
        nome: `${c.nome} (Cópia)`,
      })),
    }
    setProjects((prev) => [...prev, duplicate])
    if (organizacaoId) {
      insertProjectRemote(duplicate, organizacaoId, user?.id).then(() => syncCronogramasRemote(duplicate.id, duplicate.cronogramas))
    }
    return duplicate
  }

  const archiveProject = (id: string) => {
    updateProject(id, { status: 'arquivado' })
  }

  const addCronograma = async (projectId: string, cronograma: CronogramaInfo) => {
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
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
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
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.filter((c) => c.id !== cronogramaId)
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
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
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.map((c) => (c.id === cronogramaId ? { ...c, ...data } : c))
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
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
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const dates = calcDatesFromCronogramas(p.cronogramas)
        updated = { ...p, percentualAvanco: calcAvancoFromCronogramas(p.cronogramas), ...dates, atualizadoEm: new Date().toISOString() }
        return updated
      })
    )
    if (currentProject?.id === projectId && updated) {
      setCurrentProjectState(updated)
    }
    if (updated) syncProjectRemote(updated)
  }

  const toggleCronograma = (projectId: string, cronogramaId: string) => {
    let updated: Project | null = null
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const novosCronogramas = p.cronogramas.map((c) => (c.id === cronogramaId ? { ...c, ativo: !c.ativo } : c))
        const dates = calcDatesFromCronogramas(novosCronogramas)
        updated = {
          ...p,
          cronogramas: novosCronogramas,
          percentualAvanco: calcAvancoFromCronogramas(novosCronogramas),
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
