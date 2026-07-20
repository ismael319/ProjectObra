// Cálculos de índices de gerenciamento de projetos (PMBOK)

export interface ProjectIndices {
  // Earned Value Management
  PV: number // Planned Value (BCWS)
  EV: number // Earned Value (BCWP)
  AC: number // Actual Cost (ACWP)
  BAC: number // Budget at Completion

  // Performance Indices
  SPI: number // Schedule Performance Index
  CPI: number // Cost Performance Index

  // Forecasts
  EAC: { eac1: number; eac2: number; eac3: number }
  ETC: { eac1: number; eac2: number; eac3: number }
  VAC: number

  // Schedule
  SV: number // Schedule Variance
  CV: number // Cost Variance

  // Percent Complete
  percentPlanned: number
  percentComplete: number

  // PPC (Percent Plan Complete) - Last Planner System
  PPC: number
}

export interface EAC {
  eac1: number // BAC / CPI
  eac2: number // AC + (BAC - EV)
  eac3: number // AC + [(BAC - EV) / (CPI × SPI)]
}

export interface DailyActivity {
  date: Date
  activities: {
    uid: number
    name: string
    wbs: string
    plannedStart: Date
    plannedFinish: Date
    actualStart?: Date
    percentComplete: number
    resources: string[]
    status: 'not-started' | 'in-progress' | 'completed' | 'delayed'
  }[]
}

export function calculateIndices(
  plannedValuePerPeriod: number[],
  earnedValuePerPeriod: number[],
  actualCostPerPeriod: number[],
  bac: number
): ProjectIndices {
  // Somatórios
  const PV = plannedValuePerPeriod.reduce((a, b) => a + b, 0)
  const EV = earnedValuePerPeriod.reduce((a, b) => a + b, 0)
  const AC = actualCostPerPeriod.reduce((a, b) => a + b, 0)

  // Performance Indices
  const SPI = PV > 0 ? EV / PV : 0
  const CPI = AC > 0 ? EV / AC : 0

  // Variances
  const SV = EV - PV
  const CV = EV - AC

  // EAC calculations
  const eac1 = CPI > 0 ? bac / CPI : bac
  const eac2 = AC + (bac - EV)
  const eac3 = CPI > 0 && SPI > 0 ? AC + (bac - EV) / (CPI * SPI) : eac2

  // ETC
  const etc1 = eac1 - AC
  const etc2 = eac2 - AC
  const etc3 = eac3 - AC

  // VAC
  const vac = bac - eac1

  // Percent Complete
  const percentPlanned = bac > 0 ? (PV / bac) * 100 : 0
  const percentComplete = bac > 0 ? (EV / bac) * 100 : 0

  return {
    PV,
    EV,
    AC,
    BAC: bac,
    SPI: Math.round(SPI * 100) / 100,
    CPI: Math.round(CPI * 100) / 100,
    EAC: {
      eac1: Math.round(eac1 * 100) / 100,
      eac2: Math.round(eac2 * 100) / 100,
      eac3: Math.round(eac3 * 100) / 100,
    },
    ETC: {
      eac1: Math.round(etc1 * 100) / 100,
      eac2: Math.round(etc2 * 100) / 100,
      eac3: Math.round(etc3 * 100) / 100,
    },
    VAC: Math.round(vac * 100) / 100,
    SV: Math.round(SV * 100) / 100,
    CV: Math.round(CV * 100) / 100,
    percentPlanned: Math.round(percentPlanned * 10) / 10,
    percentComplete: Math.round(percentComplete * 10) / 10,
    PPC: 0, // Será calculado separadamente
  }
}

export function calculatePPC(
  tasksCompletedOnTime: number,
  totalTasksScheduled: number
): number {
  if (totalTasksScheduled === 0) return 0
  return Math.round((tasksCompletedOnTime / totalTasksScheduled) * 100 * 10) / 10
}

export function getSPIColor(spi: number): string {
  if (spi >= 1.0) return '#22c55e' // Verde - adiantado
  if (spi >= 0.9) return '#f59e0b' // Amarelo - leve atraso
  if (spi >= 0.8) return '#f97316' // Laranja - atraso moderado
  return '#ef4444' // Vermelho - atraso crítico
}

export function getCPIColor(cpi: number): string {
  if (cpi >= 1.0) return '#22c55e'
  if (cpi >= 0.9) return '#f59e0b'
  if (cpi >= 0.8) return '#f97316'
  return '#ef4444'
}

export function generateSCurveData(
  activities: { start: Date; finish: Date; baselineStart?: Date; baselineFinish?: Date; cost?: number; actualCost?: number; percentComplete: number }[]
): { date: string; planned: number; actual: number; forecast: number }[] {
  if (activities.length === 0) return []

  // Encontrar data mínima e máxima
  const allDates = activities.flatMap((a) => [a.start, a.finish])
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))

  // Gerar semanas
  const weeks: { date: string; planned: number; actual: number; forecast: number }[] = []
  const totalCost = activities.reduce((sum, a) => sum + (a.cost || 0), 0)
  const totalWeeks = Math.ceil((maxDate.getTime() - minDate.getTime()) / (7 * 24 * 60 * 60 * 1000))

  let cumulativePlanned = 0
  let cumulativeActual = 0

  for (let i = 0; i <= totalWeeks; i++) {
    const currentDate = new Date(minDate)
    currentDate.setDate(currentDate.getDate() + i * 7)

    const dateStr = currentDate.toISOString().split('T')[0]

    // Calcular valor planejado para esta semana (curva S)
    const progress = i / totalWeeks
    const sCurveProgress = 1 / (1 + Math.exp(-10 * (progress - 0.5)))
    const weeklyPlanned = totalCost * sCurveProgress * 0.1
    cumulativePlanned += weeklyPlanned

    // Calcular valor realizado
    const weekActivities = activities.filter(
      (a) => a.start <= currentDate && a.finish >= currentDate
    )
    const weeklyActual = weekActivities.reduce((sum, a) => {
      const weeklyCost = (a.cost || 0) / Math.max(1, Math.ceil((a.finish.getTime() - a.start.getTime()) / (7 * 24 * 60 * 60 * 1000)))
      return sum + weeklyCost * (a.percentComplete / 100)
    }, 0)
    cumulativeActual += weeklyActual

    // Forecast (se SPI estiver disponível)
    const spi = cumulativePlanned > 0 ? cumulativeActual / cumulativePlanned : 1
    const forecast = spi > 0 ? cumulativePlanned / spi : cumulativePlanned

    weeks.push({
      date: dateStr,
      planned: Math.round(cumulativePlanned * 100) / 100,
      actual: Math.round(cumulativeActual * 100) / 100,
      forecast: Math.round(forecast * 100) / 100,
    })
  }

  return weeks
}

export function generateResourceHistogram(
  assignments: { resourceUid: number; work: number; actualWork: number }[],
  resources: { uid: number; name: string; group: string }[],
  activities: { start: Date; finish: Date }[]
): { week: string; resources: { name: string; planned: number; actual: number }[] }[] {
  if (activities.length === 0) return []

  const allDates = activities.flatMap((a) => [a.start, a.finish])
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))

  const weeks: { week: string; resources: { name: string; planned: number; actual: number }[] }[] = []
  const totalWeeks = Math.ceil((maxDate.getTime() - minDate.getTime()) / (7 * 24 * 60 * 60 * 1000))

  for (let i = 0; i <= totalWeeks; i++) {
    const currentDate = new Date(minDate)
    currentDate.setDate(currentDate.getDate() + i * 7)
    const weekStr = `Sem ${i + 1}`

    const resourceData = resources.map((res) => {
      const resAssignments = assignments.filter((a) => a.resourceUid === res.uid)
      const planned = resAssignments.reduce((sum, a) => sum + a.work / Math.max(1, totalWeeks), 0) / 60
      const actual = resAssignments.reduce((sum, a) => sum + a.actualWork / Math.max(1, totalWeeks), 0) / 60

      return {
        name: res.name,
        planned: Math.round(planned * 10) / 10,
        actual: Math.round(actual * 10) / 10,
      }
    })

    weeks.push({ week: weekStr, resources: resourceData })
  }

  return weeks
}
