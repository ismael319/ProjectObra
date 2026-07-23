import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ParsedProject, WBSActivity, WBSResource, WBSAssignment } from '@/lib/xml-parser'
import { calculateIndices, calculatePPC, type ProjectIndices } from '@/lib/project-calculations'
import { sampleProject } from '@/lib/sample-data'
import { toDate } from '@/lib/utils'
import type { OccurrenceCategory, OccurrenceSeverity } from '@/lib/occurrence-types'

export interface Occurrence {
  id: string
  date: Date
  type: OccurrenceCategory
  severity: OccurrenceSeverity
  description: string
  impactDays: number
  activityUid?: number
}

interface LaborEntry {
  id: string
  date: Date
  activityUid: number
  resourceUid: number
  hours: number
  description: string
}

interface ProjectStore {
  // Projeto carregado
  project: ParsedProject | null
  setProject: (project: ParsedProject) => void
  setMultipleProjects: (projects: ParsedProject[]) => void

  // Atividades (com dados editados)
  activities: WBSActivity[]
  updateActivity: (uid: number, updates: Partial<WBSActivity>) => void

  // Recursos
  resources: WBSResource[]
  assignments: WBSAssignment[]

  // Ocorrências
  occurrences: Occurrence[]
  addOccurrence: (occ: Omit<Occurrence, 'id'>) => void
  removeOccurrence: (id: string) => void

  // Apontamento de mão de obra
  laborEntries: LaborEntry[]
  addLaborEntry: (entry: Omit<LaborEntry, 'id'>) => void
  removeLaborEntry: (id: string) => void

  // Índices calculados
  indices: ProjectIndices | null
  recalculateIndices: () => void

  // Programação diária
  getDailyActivities: (date: Date) => WBSActivity[]
}

function normalizeActivities(activities: WBSActivity[]): WBSActivity[] {
  return activities.map((a) => ({
    ...a,
    start: toDate(a.start),
    finish: toDate(a.finish),
    actualStart: a.actualStart ? toDate(a.actualStart) : undefined,
    actualFinish: a.actualFinish ? toDate(a.actualFinish) : undefined,
    baselineStart: a.baselineStart ? toDate(a.baselineStart) : undefined,
    baselineFinish: a.baselineFinish ? toDate(a.baselineFinish) : undefined,
  }))
}

const ProjectContext = createContext<ProjectStore | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<ParsedProject | null>(sampleProject)
  const [activities, setActivities] = useState<WBSActivity[]>(sampleProject.activities)
  const [resources, setResources] = useState<WBSResource[]>(sampleProject.resources)
  const [assignments, setAssignments] = useState<WBSAssignment[]>(sampleProject.assignments)
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([])
  const [indices, setIndices] = useState<ProjectIndices | null>(null)

  const setProject = (proj: ParsedProject) => {
    setProjectState(proj)
    setActivities(normalizeActivities(proj.activities))
    setResources(proj.resources)
    setAssignments(proj.assignments)
    recalculateIndices()
  }

  const setMultipleProjects = (projs: ParsedProject[]) => {
    if (projs.length === 0) return
    const merged = projs[0]
    if (projs.length === 1) {
      setProject(merged)
      return
    }

    const allActivities: WBSActivity[] = []
    const allResources: WBSResource[] = []
    const allAssignments: WBSAssignment[] = []
    const resourceUids = new Set<number>()

    for (const p of projs) {
      // Loop em vez de push(...array): cronogramas grandes podem ter milhares de
      // atividades/alocações e estourar a pilha de chamadas do JS com spread.
      for (const a of p.activities) allActivities.push(a)
      for (const r of p.resources) {
        if (!resourceUids.has(r.uid)) {
          allResources.push(r)
          resourceUids.add(r.uid)
        }
      }
      for (const a of p.assignments) allAssignments.push(a)
    }

    setProjectState(merged)
    setActivities(normalizeActivities(allActivities))
    setResources(allResources)
    setAssignments(allAssignments)

    setTimeout(() => recalculateIndices(), 0)
  }

  const updateActivity = (uid: number, updates: Partial<WBSActivity>) => {
    setActivities((prev) =>
      prev.map((a) => (a.uid === uid ? { ...a, ...updates } : a))
    )
  }

  const addOccurrence = (occ: Omit<Occurrence, 'id'>) => {
    const newOcc: Occurrence = {
      ...occ,
      id: crypto.randomUUID(),
    }
    setOccurrences((prev) => [...prev, newOcc])
  }

  const removeOccurrence = (id: string) => {
    setOccurrences((prev) => prev.filter((o) => o.id !== id))
  }

  const addLaborEntry = (entry: Omit<LaborEntry, 'id'>) => {
    const newEntry: LaborEntry = {
      ...entry,
      id: crypto.randomUUID(),
    }
    setLaborEntries((prev) => [...prev, newEntry])
  }

  const removeLaborEntry = (id: string) => {
    setLaborEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const recalculateIndices = () => {
    if (activities.length === 0) {
      setIndices(null)
      return
    }

    const now = new Date()
    const totalCost = activities.reduce((sum, a) => sum + (a.cost || 0), 0)
    const totalActualCost = activities.reduce((sum, a) => sum + (a.actualCost || 0), 0)

    // Calcular PV (valor planejado até agora)
    const plannedValuePerPeriod = activities.map((a) => {
      const totalDuration = toDate(a.finish).getTime() - toDate(a.start).getTime()
      const elapsed = Math.min(now.getTime() - toDate(a.start).getTime(), totalDuration)
      const progress = totalDuration > 0 ? Math.max(0, elapsed / totalDuration) : 0
      return (a.cost || 0) * progress
    })

    // Calcular EV (valor ganho)
    const earnedValuePerPeriod = activities.map((a) => {
      return (a.cost || 0) * (a.percentComplete / 100)
    })

    // AC (custo real)
    const actualCostPerPeriod = activities.map((a) => {
      return a.actualCost || (a.cost || 0) * (a.percentComplete / 100) * 0.95
    })

    const calcIndices = calculateIndices(plannedValuePerPeriod, earnedValuePerPeriod, actualCostPerPeriod, totalCost)

    // Calcular PPC
    const scheduledTasks = activities.filter((a) => a.start <= now && !a.isSummary)
    const completedTasks = scheduledTasks.filter((a) => a.percentComplete === 100)
    calcIndices.PPC = calculatePPC(completedTasks.length, scheduledTasks.length)

    setIndices(calcIndices)
  }

  const getDailyActivities = (date: Date): WBSActivity[] => {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    return activities.filter((a) => {
      if (a.isSummary || a.isMilestone) return false
      const activityStart = new Date(a.start)
      const activityFinish = new Date(a.finish)
      return activityStart <= dayEnd && activityFinish >= dayStart
    })
  }

  return (
    <ProjectContext.Provider
      value={{
        project,
        setProject,
        setMultipleProjects,
        activities,
        updateActivity,
        resources,
        assignments,
        occurrences,
        addOccurrence,
        removeOccurrence,
        laborEntries,
        addLaborEntry,
        removeLaborEntry,
        indices,
        recalculateIndices,
        getDailyActivities,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
