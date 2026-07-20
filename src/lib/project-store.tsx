import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ParsedProject } from '@/lib/xml-parser'
import { idbGet, idbSet, idbDelete } from '@/lib/idb-kv'

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
  setCurrentProject: (project: Project | null) => void
  createProject: (data: Omit<Project, 'id' | 'criadoEm' | 'atualizadoEm' | 'cronogramas' | 'percentualAvanco'>) => Project
  updateProject: (id: string, data: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => Project
  archiveProject: (id: string) => void
  addCronograma: (projectId: string, cronograma: CronogramaInfo) => void
  removeCronograma: (projectId: string, cronogramaId: string) => void
  updateCronograma: (projectId: string, cronogramaId: string, data: Partial<CronogramaInfo>) => void
  toggleCronograma: (projectId: string, cronogramaId: string) => void
  recalculateAllDates: (projectId: string) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

// Chaves no IndexedDB (sem limite prático de ~5-10MB como o localStorage —
// cronogramas com dados timephased podem ser grandes demais para localStorage).
const IDB_PROJECTS_KEY = 'projects'
const IDB_CURRENT_PROJECT_KEY = 'currentProject'

// Chaves antigas em localStorage, mantidas só para migração automática de quem
// já tinha dados salvos antes desta mudança.
const LEGACY_STORAGE_KEY = 'obracontrol_projects'
const LEGACY_CURRENT_PROJECT_KEY = 'obracontrol_current_project'

const CRON_COLORS = ['#9933FF', '#0066CC', '#00AA00', '#FF9900', '#CC0000', '#FF00FF', '#00CCCC', '#FFCC00', '#333333', '#FF6600']

// Normaliza o formato antigo (um único `cronograma`) para o atual (`cronogramas[]`).
function normalizeLegacyProject(p: Project & { cronograma?: ParsedProject | null }): Project {
  if (p.cronogramas && p.cronogramas.length > 0) return p
  if (p.cronograma) {
    const c = p.cronograma as unknown as ParsedProject
    return {
      ...p,
      cronogramas: [{
        id: crypto.randomUUID(),
        nome: 'Cronograma Geral',
        descricao: '',
        tipo: 'Geral' as const,
        versao: 1,
        ativo: true,
        peso: 1,
        cor: CRON_COLORS[0],
        dataUpload: p.atualizadoEm || new Date().toISOString(),
        dados: c,
      }],
      cronograma: undefined,
    } as Project
  }
  return { ...p, cronogramas: p.cronogramas || [] }
}

// Carrega projetos + projeto atual do IndexedDB, migrando automaticamente de
// localStorage na primeira vez (e liberando o espaço de lá em seguida).
async function loadAll(): Promise<{ projects: Project[]; currentProject: Project | null }> {
  let projects = await idbGet<Project[]>(IDB_PROJECTS_KEY)
  if (projects === undefined) {
    projects = []
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy) as Array<Project & { cronograma?: ParsedProject | null }>
        projects = parsed.map(normalizeLegacyProject)
      }
    } catch { /* dados antigos corrompidos — segue com [] */ }
    await idbSet(IDB_PROJECTS_KEY, projects)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }

  let currentProject = await idbGet<Project | null>(IDB_CURRENT_PROJECT_KEY)
  if (currentProject === undefined) {
    currentProject = null
    try {
      const legacy = localStorage.getItem(LEGACY_CURRENT_PROJECT_KEY)
      if (legacy) {
        currentProject = normalizeLegacyProject(JSON.parse(legacy))
      }
    } catch { /* dados antigos corrompidos — segue sem projeto atual */ }
    if (currentProject) await idbSet(IDB_CURRENT_PROJECT_KEY, currentProject)
    localStorage.removeItem(LEGACY_CURRENT_PROJECT_KEY)
  }

  return { projects, currentProject }
}

async function saveProjects(projects: Project[]) {
  try {
    await idbSet(IDB_PROJECTS_KEY, projects)
  } catch {
    console.error('Falha ao salvar projetos no IndexedDB.')
    toast.error('Não foi possível salvar suas alterações.', {
      description: 'Verifique o espaço em disco disponível no dispositivo.',
      duration: 8000,
    })
  }
}

async function saveCurrentProject(project: Project | null) {
  try {
    if (project) {
      await idbSet(IDB_CURRENT_PROJECT_KEY, project)
    } else {
      await idbDelete(IDB_CURRENT_PROJECT_KEY)
    }
  } catch {
    console.error('Falha ao salvar o projeto atual no IndexedDB.')
    toast.error('Não foi possível salvar o projeto atual.', {
      description: 'Verifique o espaço em disco disponível no dispositivo.',
      duration: 8000,
    })
  }
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
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAll().then(({ projects, currentProject }) => {
      if (cancelled) return
      setProjects(projects)
      setCurrentProjectState(currentProject)
      setIsLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    saveProjects(projects)
  }, [projects, isLoaded])

  const setCurrentProject = (project: Project | null) => {
    setCurrentProjectState(project)
    saveCurrentProject(project)
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
    return newProject
  }

  const updateProject = (id: string, data: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...data, atualizadoEm: new Date().toISOString() } : p))
    )
    if (currentProject?.id === id) {
      setCurrentProjectState((prev) => prev ? { ...prev, ...data, atualizadoEm: new Date().toISOString() } : null)
    }
  }

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (currentProject?.id === id) {
      setCurrentProject(null)
    }
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
    return duplicate
  }

  const archiveProject = (id: string) => {
    updateProject(id, { status: 'arquivado' })
  }

  const addCronograma = (projectId: string, cronograma: CronogramaInfo) => {
    const updatePartial: Partial<Project> = { cronogramas: [] }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const existing = p.cronogramas || []
        const nextVersion = existing.filter((c) => c.nome === cronograma.nome).length + 1
        const newC = { ...cronograma, versao: nextVersion }
        const updated = [
          ...existing.map((c) => (c.nome === cronograma.nome ? { ...c, ativo: false } : c)),
          newC,
        ]
        const avanco = calcAvancoFromCronogramas(updated)
        const dates = calcDatesFromCronogramas(updated)
        updatePartial.cronogramas = updated
        updatePartial.percentualAvanco = avanco
        return { ...p, cronogramas: updated, percentualAvanco: avanco, ...dates, atualizadoEm: new Date().toISOString() }
      })
    )
    if (currentProject?.id === projectId) {
      setCurrentProjectState((prev) => {
        if (!prev) return null
        const existing = prev.cronogramas || []
        const nextVersion = existing.filter((c) => c.nome === cronograma.nome).length + 1
        const newC = { ...cronograma, versao: nextVersion }
        const updated = [
          ...existing.map((c) => (c.nome === cronograma.nome ? { ...c, ativo: false } : c)),
          newC,
        ]
        const dates = calcDatesFromCronogramas(updated)
        return { ...prev, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    }
  }

  const removeCronograma = (projectId: string, cronogramaId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const updated = p.cronogramas.filter((c) => c.id !== cronogramaId)
        const dates = calcDatesFromCronogramas(updated)
        return { ...p, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    )
    if (currentProject?.id === projectId) {
      setCurrentProjectState((prev) => {
        if (!prev) return null
        const updated = prev.cronogramas.filter((c) => c.id !== cronogramaId)
        const dates = calcDatesFromCronogramas(updated)
        return { ...prev, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    }
  }

  const updateCronograma = (projectId: string, cronogramaId: string, data: Partial<CronogramaInfo>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const updated = p.cronogramas.map((c) => c.id === cronogramaId ? { ...c, ...data } : c)
        const dates = calcDatesFromCronogramas(updated)
        return { ...p, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    )
    if (currentProject?.id === projectId) {
      setCurrentProjectState((prev) => {
        if (!prev) return null
        const updated = prev.cronogramas.map((c) => c.id === cronogramaId ? { ...c, ...data } : c)
        const dates = calcDatesFromCronogramas(updated)
        return { ...prev, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    }
  }

  const recalculateAllDates = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const dates = calcDatesFromCronogramas(p.cronogramas)
        return { ...p, percentualAvanco: calcAvancoFromCronogramas(p.cronogramas), ...dates, atualizadoEm: new Date().toISOString() }
      })
    )
    if (currentProject?.id === projectId) {
      setCurrentProjectState((prev) => {
        if (!prev) return null
        const dates = calcDatesFromCronogramas(prev.cronogramas)
        return { ...prev, percentualAvanco: calcAvancoFromCronogramas(prev.cronogramas), ...dates, atualizadoEm: new Date().toISOString() }
      })
    }
  }

  const toggleCronograma = (projectId: string, cronogramaId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const updated = p.cronogramas.map((c) => c.id === cronogramaId ? { ...c, ativo: !c.ativo } : c)
        const dates = calcDatesFromCronogramas(updated)
        return { ...p, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    )
    if (currentProject?.id === projectId) {
      setCurrentProjectState((prev) => {
        if (!prev) return null
        const updated = prev.cronogramas.map((c) => c.id === cronogramaId ? { ...c, ativo: !c.ativo } : c)
        const dates = calcDatesFromCronogramas(updated)
        return { ...prev, cronogramas: updated, percentualAvanco: calcAvancoFromCronogramas(updated), ...dates, atualizadoEm: new Date().toISOString() }
      })
    }
  }

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
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
