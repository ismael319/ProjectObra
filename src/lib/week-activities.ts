import type { CronogramaInfo } from '@/lib/project-store'
import type { BaselineData } from '@/lib/xml-parser'

export interface WeekActivity {
  cronogramaId: string
  cronogramaNome: string
  cronogramaCor: string
  taskUid: number
  taskName: string
  wbs: string
  work: number
  start: Date
  finish: Date
  percentComplete: number
  discipline: string
  area: string
  // Nome dos níveis 2 e 3 da EDT (ex.: "GALPÃO DE BIOMASSA / COBERTURA") — usado como
  // rótulo de "área" na janela de importação, distinto do campo `area` (texto livre
  // do MS Project, normalmente vazio).
  areaPath: string
  responsible: string
  // Índice 0=BL0, 1=BL1, ... 10=BL10 — a linha de base a considerar é escolhida na
  // janela de importação (afeta o cálculo de atraso), não na busca em si.
  baselines: BaselineData[]
}

export function findActivitiesWithWorkInWeek(
  cronogramas: CronogramaInfo[],
  weekStart: Date,
  weekEnd: Date,
): WeekActivity[] {
  const results: WeekActivity[] = []

  for (const c of cronogramas) {
    if (!c.ativo || !c.dados) continue

    const activities = c.dados.activities
    const weekStartMs = weekStart.getTime()
    const weekEndMs = weekEnd.getTime()

    // WBS → nome, pra resolver os ancestrais de nível 2/3 de cada tarefa (a EDT em si
    // já identifica os ancestrais pelo prefixo — "1.2.13.3" tem nível 2 = "1.2" e
    // nível 3 = "1.2.13").
    const wbsToName = new Map<string, string>()
    for (const a of activities) wbsToName.set(a.wbs, a.name)

    const getAreaPath = (wbs: string): string => {
      const parts = wbs.split('.')
      const level2 = parts.length >= 2 ? wbsToName.get(parts.slice(0, 2).join('.')) : undefined
      const level3 = parts.length >= 3 ? wbsToName.get(parts.slice(0, 3).join('.')) : undefined
      return [level2, level3].filter(Boolean).join(' / ')
    }

    for (const act of activities) {
      if (act.isSummary || act.isMilestone) continue

      const work = act.work ?? 0
      if (work <= 0) continue

      const actStartMs = act.start.getTime()
      const actFinishMs = act.finish.getTime()

      const overlaps = actStartMs <= weekEndMs && actFinishMs >= weekStartMs
      if (!overlaps) continue

      // Avanço = % de TRABALHO concluído (actualWork/work), não a duração decorrida —
      // act.percentComplete no MSPDI pode vir de <PercentComplete> (baseado em
      // duração), que diverge do avanço real quando o trabalho não é uniforme ao
      // longo da atividade.
      const percentComplete = (act.actualWork ?? 0) / work * 100

      results.push({
        cronogramaId: c.id,
        cronogramaNome: c.nome,
        cronogramaCor: c.cor,
        taskUid: act.uid,
        taskName: act.name,
        wbs: act.wbs,
        work,
        start: act.start,
        finish: act.finish,
        percentComplete,
        discipline: act.discipline || '',
        area: act.area || '',
        areaPath: getAreaPath(act.wbs),
        responsible: act.responsible || '',
        baselines: act.baselines,
      })
    }
  }

  results.sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true }))
  return results
}

