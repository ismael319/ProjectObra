import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { getSPIColor } from '@/lib/project-calculations'
import type { BaselineInfo } from '@/lib/xml-parser'
import {
  pct,
  round2,
  fmtVal,
  findStatusIndex,
  sumBL0,
  lookupBL,
  PERIOD_LABEL,
  BL_COLORS,
  COLOR_REAL,
  COLOR_FORECAST,
  type CurveGranularity,
  type CalculationUnit,
  type CurvePeriod,
} from '@/lib/curve-utils'

// ═══════════════════════════════════════════════════════════════════
// SemiGauge — velocímetro semicircular (SPI do período)
// ═══════════════════════════════════════════════════════════════════

interface SemiGaugeProps {
  value: number | null
  label: string
  min?: number
  max?: number
}

const cx = 50
const cy = 52
const r = 40

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

function arcPath(startAngle: number, endAngle: number, radius: number) {
  if (endAngle <= startAngle) return ''
  const start = polar(startAngle, radius)
  const end = polar(endAngle, radius)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export function SemiGauge({ value, label, min = 0.5, max = 1.3 }: SemiGaugeProps) {
  const valueToAngle = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v))
    return 180 + ((clamped - min) / (max - min)) * 180
  }

  const bands = [
    { from: min, to: 0.8, color: '#ef4444' },
    { from: 0.8, to: 0.9, color: '#f97316' },
    { from: 0.9, to: 1.0, color: '#f59e0b' },
    { from: 1.0, to: max, color: '#22c55e' },
  ]

  const color = value === null ? '#9ca3af' : getSPIColor(value)
  const needleAngle = value === null ? 270 : valueToAngle(value)
  const needleEnd = polar(needleAngle, r - 8)

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg viewBox="0 0 100 60" width="92" height="55">
        {bands.map((b) => {
          const from = Math.max(b.from, min)
          const to = Math.min(b.to, max)
          if (to <= from) return null
          return (
            <path
              key={b.color}
              d={arcPath(valueToAngle(from), valueToAngle(to), r)}
              stroke={b.color}
              strokeWidth={8}
              fill="none"
              strokeLinecap="butt"
              opacity={0.35}
            />
          )
        })}
        {value !== null && (
          <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke={color} strokeWidth={3} strokeLinecap="round" />
        )}
        <circle cx={cx} cy={cy} r={3} fill={color} />
      </svg>
      <span className="text-sm font-bold -mt-1" style={{ color }}>{value === null ? '–' : value.toFixed(2)}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center">{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// AdherenceBar — barra horizontal (aderência à baseline selecionada)
// ═══════════════════════════════════════════════════════════════════

interface AdherenceBarProps {
  value: number | null
  label: string
}

export function AdherenceBar({ value, label }: AdherenceBarProps) {
  const width = value === null ? 0 : Math.min(100, Math.max(0, value))
  const overflow = value !== null && value > 100
  const color =
    value === null ? '#9ca3af' : value >= 100 ? '#22c55e' : value >= 90 ? '#f59e0b' : value >= 80 ? '#f97316' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[120px] justify-center">
      <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center">{label}</span>
      <div className="relative w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-3">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
        <div className="absolute -top-1.5 bottom-[-2px] w-px bg-gray-400 dark:bg-gray-500" style={{ left: '100%' }} />
        {overflow && (
          <span className="absolute -top-3 text-[9px] leading-none" style={{ left: '100%', transform: 'translateX(-50%)', color }}>▲</span>
        )}
      </div>
      <span className="text-sm font-bold" style={{ color }}>{value === null ? '–' : `${value.toFixed(0)}%`}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// CurveTooltip — conteúdo customizado do <Tooltip> do recharts
// ═══════════════════════════════════════════════════════════════════

export interface CurveTooltipProps {
  active?: boolean
  label?: number | string
  granularity: CurveGranularity
  unit: CalculationUnit
  curveData: CurvePeriod[]
  availableBLs: BaselineInfo[]
  selectedBL: string
}

export function CurveTooltip({ active, label, granularity, unit, curveData, availableBLs, selectedBL }: CurveTooltipProps) {
  if (!active || label === undefined || label === null || curveData.length === 0) return null

  const idx = curveData.findIndex((p) => new Date(p.date).getTime() === Number(label))
  if (idx === -1) return null

  const period = curveData[idx]
  const prevPeriod = curveData[Math.max(0, idx - 1)]
  const lastPeriod = curveData[curveData.length - 1]
  const isStatusPeriod = idx === findStatusIndex(curveData)

  // Denominador: total da Linha Base 0 (BL0). Fallback para planned se BL0 ausente.
  // lookupBL (não acesso direto por []) porque blCum pode estar chaveado com o id
  // composto do cronograma ("cronId__BL0", cronograma único) ou já normalizado
  // ("BL0", síntese ponderada) — acesso direto por bl.id/selectedBL falha num dos
  // dois casos e zera as linhas de base no card.
  const bl0Total = sumBL0(lastPeriod.blCum)
  const bac = bl0Total > 0 ? bl0Total : lastPeriod.planned
  const blTotalFinal = lookupBL(lastPeriod.blCum, selectedBL)

  const pctRealAcum = pct(period.actual, bac)
  const pctRealAcumPrev = pct(prevPeriod.actual, bac)
  const realDeltaPP = round2(pctRealAcum - pctRealAcumPrev)

  const pctBLAcum = pct(lookupBL(period.blCum, selectedBL), blTotalFinal)
  const pctBLAcumPrev = pct(lookupBL(prevPeriod.blCum, selectedBL), blTotalFinal)
  const blDeltaPP = round2(pctBLAcum - pctBLAcumPrev)

  const aderencia = pctBLAcum > 0 ? round2((pctRealAcum / pctBLAcum) * 100) : null
  const desvioVsBase = blTotalFinal > 0 ? round2(pctRealAcum - pctBLAcum) : null

  // Ritmo do período = Real do período / LB de referência do MESMO período (não mais
  // Real/Planejado do cronograma atual). Quando a LB não distribuiu nada nesse
  // período específico (comum após replanejamento — o trabalho foi remanejado para
  // outra semana), o ritmo fica indefinido (null) em vez de virar um pico artificial.
  const blPeriodRef = lookupBL(period.blPeriod, selectedBL)
  const ritmo = blPeriodRef > 0 ? round2(period.actualPeriod / blPeriodRef) : null

  const periodColLabel = PERIOD_LABEL[granularity]

  const rows: { key: string; color: string; name: string; value: number; prevValue: number; total: number }[] = []
  for (const bl of availableBLs) {
    rows.push({
      key: bl.id,
      color: BL_COLORS[bl.index],
      name: bl.label,
      value: lookupBL(period.blCum, bl.id),
      prevValue: lookupBL(prevPeriod.blCum, bl.id),
      total: lookupBL(lastPeriod.blCum, bl.id),
    })
  }
  rows.push({ key: 'forecast', color: COLOR_FORECAST, name: 'Forecast', value: period.forecast, prevValue: prevPeriod.forecast, total: bac })
  rows.push({ key: 'actual', color: COLOR_REAL, name: 'Real', value: period.actual, prevValue: prevPeriod.actual, total: bac })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[320px] max-w-[380px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{period.label}</span>
        {isStatusPeriod && (
          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide">
            Status
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 mb-1 pb-1 border-b border-gray-100 dark:border-gray-700">
        <SemiGauge value={ritmo} label={`Ritmo ${periodColLabel}`} />
        <AdherenceBar value={aderencia} label="Aderência Base" />
      </div>
      <div className="text-center text-[11px] text-gray-400 dark:text-gray-500 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
        {realDeltaPP > 0 ? '+' : ''}{realDeltaPP.toFixed(1)}pp / base {blDeltaPP > 0 ? '+' : ''}{blDeltaPP.toFixed(1)}pp
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 dark:text-gray-500">
            <th className="text-left font-medium pb-1">Série</th>
            <th className="text-right font-medium pb-1">Acum.</th>
            <th className="text-right font-medium pb-1">{periodColLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowPct = pct(row.value, row.total)
            const prevPct = pct(row.prevValue, row.total)
            const deltaPP = round2(rowPct - prevPct)
            return (
              <tr key={row.key}>
                <td className="py-0.5 pr-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                    <span className="text-gray-700 dark:text-gray-200 truncate max-w-[110px] inline-block align-bottom">{row.name}</span>
                  </span>
                </td>
                <td className="text-right py-0.5 pr-2">
                  <div className="text-gray-900 dark:text-white font-medium">{rowPct.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{fmtVal(row.value, unit)}</div>
                </td>
                <td className="text-right py-0.5">
                  <span className={`inline-flex items-center gap-0.5 ${deltaPP > 0 ? 'text-green-600' : deltaPP < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {deltaPP > 0 ? <ArrowUp size={10} /> : deltaPP < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                    {deltaPP > 0 ? '+' : ''}{deltaPP.toFixed(1)}pp
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {desvioVsBase !== null && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Desvio vs Base</span>
          <span className={`text-sm font-bold inline-flex items-center gap-1 ${desvioVsBase > 0 ? 'text-green-600' : desvioVsBase < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {desvioVsBase > 0 ? <ArrowUp size={12} /> : desvioVsBase < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
            {desvioVsBase > 0 ? '+' : ''}{desvioVsBase.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
