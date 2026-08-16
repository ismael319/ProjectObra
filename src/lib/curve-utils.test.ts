import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCurveFromRawPoints } from './curve-utils'
import type { BaselineInfo, TimephasedDataPoint } from './xml-parser'

const BL0: BaselineInfo = {
  id: 'BL0',
  index: 0,
  label: 'Baseline 0 (original)',
  available: true,
  totalWork: 200,
  totalCost: 0,
  hasTimephased: true,
}

function pt(over: Partial<TimephasedDataPoint> & { start: Date }): TimephasedDataPoint {
  const { start, ...rest } = over
  return {
    type: 1,
    uid: 1,
    start,
    finish: new Date(start.getTime() + 86400000),
    unit: 1,
    valueHours: 0,
    ...rest,
  }
}

function sampleRawPoints(): TimephasedDataPoint[] {
  const d1 = new Date('2026-08-01T00:00:00')
  const d2 = new Date('2026-08-02T00:00:00')
  return [
    pt({ type: 1, start: d1, valueHours: 100 }),
    pt({ type: 4, baselineIndex: 0, start: d1, valueHours: 80 }),
    pt({ type: 2, start: d1, valueHours: 40 }),
    pt({ type: 1, start: d2, valueHours: 100 }),
    pt({ type: 4, baselineIndex: 0, start: d2, valueHours: 120 }),
  ]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-10T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildCurveFromRawPoints — cache', () => {
  it('retorna resultado equivalente para os mesmos inputs', () => {
    const raw = sampleRawPoints()
    const a = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    const b = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    expect(b).toEqual(a)
  })

  it('reutiliza a MESMA referência quando os inputs não mudaram (hit de cache)', () => {
    const raw = sampleRawPoints()
    const a = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    const b = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    expect(b).toBe(a)
  })

  it('não retorna curva de um input para outro (chave inclui granularity/unit/BLs)', () => {
    const raw = sampleRawPoints()
    const day = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    const week = buildCurveFromRawPoints(raw, 'week', 'HH', [BL0], 5)
    expect(week).not.toBe(day)

    const r$ = buildCurveFromRawPoints(raw, 'day', 'R$', [BL0], 5)
    expect(r$).not.toBe(day)

    const semBL = buildCurveFromRawPoints(raw, 'day', 'HH', [], 5)
    expect(semBL).not.toBe(day)
  })

  it('expira sozinho quando o dia muda (o status depende da data atual)', () => {
    const raw = sampleRawPoints()
    const a = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    vi.setSystemTime(new Date('2026-08-11T12:00:00'))
    const b = buildCurveFromRawPoints(raw, 'day', 'HH', [BL0], 5)
    expect(b).not.toBe(a)
  })

  it('não cacheia rawPoints vazio', () => {
    expect(buildCurveFromRawPoints([], 'week', 'HH', [BL0], 5)).toEqual([])
    expect(buildCurveFromRawPoints(undefined, 'week', 'HH', [BL0], 5)).toEqual([])
  })
})
