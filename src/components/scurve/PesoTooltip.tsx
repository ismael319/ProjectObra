import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { getSPIColor } from '@/lib/project-calculations'
import { COLOR_REAL, COLOR_FORECAST, COLOR_PLANNED } from '@/lib/curve-utils'
import type { CurvaSSemana } from '@/lib/curva-s-peso'

interface PesoTooltipProps {
  active?: boolean
  label?: string
  semanas: CurvaSSemana[]
}

function SemiGauge({ value, label }: { value: number | null; label: string }) {
  const cx = 50, cy = 52, r = 40
  const min = 0.5, max = 1.3
  const valueToAngle = (v: number) => 180 + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 180
  const polar = (angleDeg: number, radius: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }
  const arcPath = (startAngle: number, endAngle: number, radius: number) => {
    if (endAngle <= startAngle) return ''
    const start = polar(startAngle, radius)
    const end = polar(endAngle, radius)
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
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
          return <path key={b.color} d={arcPath(valueToAngle(from), valueToAngle(to), r)} stroke={b.color} strokeWidth={8} fill="none" strokeLinecap="butt" opacity={0.35} />
        })}
        {value !== null && <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke={color} strokeWidth={3} strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r={3} fill={color} />
      </svg>
      <span className="text-sm font-bold -mt-1" style={{ color }}>{value === null ? '\u2013' : value.toFixed(2)}</span>
      <span className="text-center text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  )
}

function AdherenceBar({ value, label }: { value: number | null; label: string }) {
  const width = value === null ? 0 : Math.min(100, Math.max(0, value))
  const color = value === null ? '#9ca3af' : value >= 100 ? '#22c55e' : value >= 90 ? '#f59e0b' : value >= 80 ? '#f97316' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[120px] justify-center">
      <span className="text-center text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      <div className="relative w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-3">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
        <div className="absolute -top-1.5 bottom-[-2px] w-px bg-gray-400 dark:bg-gray-500" style={{ left: '100%' }} />
      </div>
      <span className="text-sm font-bold" style={{ color }}>{value === null ? '\u2013' : `${value.toFixed(0)}%`}</span>
    </div>
  )
}

export function PesoTooltip({ active, label, semanas }: PesoTooltipProps) {
  if (!active || !label || semanas.length === 0) return null

  const idx = semanas.findIndex((s) => `S${String(s.semanaIndice).padStart(2, '0')}` === label)
  if (idx === -1) return null

  const period = semanas[idx]
  const prevPeriod = semanas[Math.max(0, idx - 1)]

  const realAcum = period.avancoExecutadoAcum ?? 0
  const realPrevAcum = prevPeriod.avancoExecutadoAcum ?? 0
  const bl0Acum = period.avancoPlanejadoAcum
  const bl0PrevAcum = prevPeriod.avancoPlanejadoAcum
  const forecastAcum = period.forecastAcum ?? 0
  const forecastPrevAcum = prevPeriod.forecastAcum ?? 0

  const realDeltaPP = realAcum - realPrevAcum
  const blDeltaPP = bl0Acum - bl0PrevAcum

  const aderencia = bl0Acum > 0 ? (realAcum / bl0Acum) * 100 : null
  const desvioVsBase = realAcum - bl0Acum

  const semLabel = `Sem.`
  const blPeriodRef = bl0Acum - bl0PrevAcum
  const realSem = realAcum - realPrevAcum
  const ritmo = blPeriodRef > 0 ? realSem / blPeriodRef : null

  const fmtVal = (v: number) => `${v.toFixed(1)}%`

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[min(320px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{period.label ?? `S${String(period.semanaIndice).padStart(2, '0')}`}</span>
        {idx > 0 && period.avancoExecutadoAcum !== null && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">Status</span>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 mb-1 pb-1 border-b border-gray-100 dark:border-gray-700">
        <SemiGauge value={ritmo} label={`Ritmo ${semLabel}`} />
        <AdherenceBar value={aderencia} label="Aderencia Base" />
      </div>
      <div className="mb-3 border-b border-gray-100 pb-3 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
        {realDeltaPP > 0 ? '+' : ''}{realDeltaPP.toFixed(1)}pp / base {blDeltaPP > 0 ? '+' : ''}{blDeltaPP.toFixed(1)}pp
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 dark:text-gray-500">
            <th className="text-left font-medium pb-1">Serie</th>
            <th className="text-right font-medium pb-1">Acum.</th>
            <th className="text-right font-medium pb-1">{semLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_PLANNED }} />
                <span className="text-gray-700 dark:text-gray-200">BL0</span>
              </span>
            </td>
            <td className="text-right py-0.5 pr-2">
              <div className="text-gray-900 dark:text-white font-medium">{fmtVal(bl0Acum)}</div>
            </td>
            <td className="text-right py-0.5">
              <span className={`inline-flex items-center gap-0.5 ${blDeltaPP > 0 ? 'text-green-600' : blDeltaPP < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {blDeltaPP > 0 ? <ArrowUp size={10} /> : blDeltaPP < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                {blDeltaPP > 0 ? '+' : ''}{blDeltaPP.toFixed(1)}pp
              </span>
            </td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_FORECAST }} />
                <span className="text-gray-700 dark:text-gray-200">Forecast</span>
              </span>
            </td>
            <td className="text-right py-0.5 pr-2">
              <div className="text-gray-900 dark:text-white font-medium">{fmtVal(forecastAcum)}</div>
            </td>
            <td className="text-right py-0.5">
              <span className={`inline-flex items-center gap-0.5 ${forecastAcum - forecastPrevAcum > 0 ? 'text-green-600' : forecastAcum - forecastPrevAcum < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {forecastAcum - forecastPrevAcum > 0 ? <ArrowUp size={10} /> : forecastAcum - forecastPrevAcum < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                {forecastAcum - forecastPrevAcum > 0 ? '+' : ''}{(forecastAcum - forecastPrevAcum).toFixed(1)}pp
              </span>
            </td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_REAL }} />
                <span className="text-gray-700 dark:text-gray-200">Real</span>
              </span>
            </td>
            <td className="text-right py-0.5 pr-2">
              <div className="text-gray-900 dark:text-white font-medium">{fmtVal(realAcum)}</div>
            </td>
            <td className="text-right py-0.5">
              <span className={`inline-flex items-center gap-0.5 ${realDeltaPP > 0 ? 'text-green-600' : realDeltaPP < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {realDeltaPP > 0 ? <ArrowUp size={10} /> : realDeltaPP < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                {realDeltaPP > 0 ? '+' : ''}{realDeltaPP.toFixed(1)}pp
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {desvioVsBase !== 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Desvio vs Base</span>
          <span className={`text-sm font-bold inline-flex items-center gap-1 ${desvioVsBase > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {desvioVsBase > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {desvioVsBase > 0 ? '+' : ''}{desvioVsBase.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
