import { describe, expect, it } from 'vitest'
import type { WBSActivity } from './xml-parser'
import {
  buildDashboardAttention,
  getActivityKey,
  getActivityStatus,
  getDaysLate,
  isActivityActiveToday,
  isActivityDueToday,
  isActivityLate,
} from './dashboard-insights'

const referenceDate = new Date(2026, 7, 9, 12)

function activity(overrides: Partial<WBSActivity> = {}): WBSActivity {
  return {
    id: '1',
    uid: 1,
    name: 'Atividade',
    wbs: '1.1',
    outlineLevel: 2,
    outlineNumber: '1.1',
    start: new Date(2026, 7, 1, 8),
    finish: new Date(2026, 7, 9, 17),
    duration: 480,
    durationFormat: 7,
    percentComplete: 0,
    predecessorUids: [],
    resourceUids: [],
    isMilestone: false,
    isSummary: false,
    baselines: [],
    responsible: '',
    discipline: '',
    area: '',
    notes: '',
    priority: 500,
    calendarName: '',
    text1: '',
    text2: '',
    text3: '',
    number1: 0,
    number2: 0,
    number3: 0,
    ...overrides,
  }
}

describe('dashboard-insights', () => {
  it('não considera atrasada uma atividade que vence hoje', () => {
    const item = activity({ finish: new Date(2026, 7, 9, 0, 1) })

    expect(isActivityLate(item, referenceDate)).toBe(false)
    expect(isActivityDueToday(item, referenceDate)).toBe(true)
  })

  it('prioriza atraso sobre andamento para atividade parcial vencida', () => {
    const item = activity({ percentComplete: 55, finish: new Date(2026, 7, 7, 18) })

    expect(getActivityStatus(item, referenceDate)).toBe('atrasada')
    expect(getDaysLate(item, referenceDate)).toBe(2)
  })

  it('ignora atividades concluídas e resumos nos alertas de prazo', () => {
    expect(isActivityLate(activity({ percentComplete: 100, finish: new Date(2026, 7, 1) }), referenceDate)).toBe(false)
    expect(isActivityLate(activity({ isSummary: true, finish: new Date(2026, 7, 1) }), referenceDate)).toBe(false)
  })

  it('identifica atividade em execução no intervalo do dia', () => {
    expect(isActivityActiveToday(activity({ percentComplete: 25 }), referenceDate)).toBe(true)
    expect(isActivityActiveToday(activity({ percentComplete: 0 }), referenceDate)).toBe(false)
    expect(isActivityActiveToday(activity({ percentComplete: 25, isMilestone: true }), referenceDate)).toBe(false)
  })

  it('separa atrasos, vencimentos e marcos pendentes por prioridade', () => {
    const late = activity({ uid: 1, finish: new Date(2026, 7, 5) })
    const dueToday = activity({ uid: 2 })
    const milestone = activity({ uid: 3, isMilestone: true, finish: new Date(2026, 7, 8) })
    const futureMilestone = activity({ uid: 4, isMilestone: true, finish: new Date(2026, 7, 10) })

    const summary = buildDashboardAttention([dueToday, futureMilestone, milestone, late], referenceDate)

    expect(summary.late).toEqual([late, milestone])
    expect(summary.dueToday).toEqual([dueToday])
    expect(summary.pendingMilestones).toEqual([])
  })

  it('gera chaves diferentes para UIDs repetidos em cronogramas distintos', () => {
    const first = activity({ uid: 7, sourceCronogramaIndex: 0 })
    const second = activity({ uid: 7, sourceCronogramaIndex: 1 })

    expect(getActivityKey(first)).not.toBe(getActivityKey(second))
  })
})
