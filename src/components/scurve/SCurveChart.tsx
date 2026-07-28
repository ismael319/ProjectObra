import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import { CurveTooltip } from '@/components/CurveGauges'
import {
  BL_COLORS,
  COLOR_REAL,
  COLOR_FORECAST,
  fmtVal,
  formatAxisTick,
  type CalculationUnit,
  type CurveGranularity,
  type CurvePeriod,
} from '@/lib/curve-utils'
import type { BaselineInfo } from '@/lib/xml-parser'
import type { Occurrence } from '@/lib/project-context'
import { getCategoryDef, getSeverityDef } from '@/lib/occurrence-types'

interface ChartDataItem {
  date: number
  planned: number
  actual: number
  forecast: number
  actualPeriod: number
  forecastPeriod: number
  [key: string]: unknown
}

interface CronCurve {
  id: string
  curve: Array<{ date: string; actual: number }>
}

interface TooltipState {
  active: boolean
  coordinate: { x: number; y: number }
  label: number | string
  payload: Array<{ name: string; value: number; color: string }>
}

interface SCurveChartProps {
  chartData: ChartDataItem[]
  curveData: CurvePeriod[]
  availableBLs: Array<BaselineInfo & { index: number }>
  selectedBL: string
  selectedBLInfo: (BaselineInfo & { index: number }) | undefined
  unit: CalculationUnit
  unitLabel: string
  granularity: CurveGranularity
  weekStartDay: number
  consolidationMethod: string
  cronCurves: CronCurve[]
  hasActivityFilter: boolean
  hiddenBLs: string[]
  statusX: number | null
  tooltipState: TooltipState | null
  onTooltipChange: (state: TooltipState | null) => void
  occurrences: Occurrence[]
}

export function SCurveChart({
  chartData,
  curveData,
  availableBLs,
  selectedBL,
  selectedBLInfo,
  unit,
  unitLabel: _unitLabel,
  granularity,
  weekStartDay,
  consolidationMethod: _consolidationMethod,
  cronCurves: _cronCurves,
  hasActivityFilter: _hasActivityFilter,
  hiddenBLs,
  statusX,
  tooltipState,
  onTooltipChange,
  occurrences,
}: SCurveChartProps) {
  const chartContainerRef = React.useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = React.useState(0)
  const [occTooltip, setOccTooltip] = React.useState<{ occurrence: Occurrence; coordinate: { x: number; y: number } } | null>(null)

  React.useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setChartWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const effectiveBarSize = useMemo(() => {
    const n = chartData.length
    if (n === 0 || chartWidth === 0) return 6
    const yAxisWidth = 60
    const plotWidth = Math.max(0, chartWidth - yAxisWidth)
    const bandWidth = plotWidth / n
    const clusterWidth = bandWidth * 0.8
    return Math.max(2, Math.min(32, clusterWidth / 3))
  }, [chartData.length, chartWidth])

  // Eixo X: cada tick corresponde a um período real do gráfico.
  // Para granularidade semanal, mostra todas as semanas; para mensal/anual,
  // limita a ~15 rótulos para evitar sobreposição.
  const xTicks = useMemo(() => {
    const n = chartData.length
    if (n === 0) return undefined
    const step = granularity === 'week' ? 1 : Math.max(1, Math.ceil(n / 15))
    const ticks: number[] = []
    for (let i = 0; i < n; i += step) ticks.push(chartData[i].date)
    return ticks
  }, [chartData, granularity])

  if (chartData.length === 0) {
    return (
      <div className="h-[640px] flex items-center justify-center text-gray-400">
        Sem dados para exibir
      </div>
    )
  }

  return (
    <>
      <div className="h-[640px]" ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height="100%">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ComposedChart data={chartData} onMouseMove={(state: any) => {
            if (state?.activeTooltipIndex != null && state?.activeLabel != null) {
              onTooltipChange({
                active: true,
                coordinate: state.activeCoordinate ?? { x: 0, y: 0 },
                label: state.activeLabel,
                payload: state.activePayload ?? [],
              })
            }
          }} onMouseLeave={() => onTooltipChange(null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            {statusX !== null && chartData.length > 0 && (
              <ReferenceArea x1={chartData[0].date} x2={statusX} fill={COLOR_REAL} fillOpacity={0.06} />
            )}
            <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisTick(new Date(v), granularity, weekStartDay)} />
            <YAxis
              tick={{ fontSize: 11 }}
              width={60}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {selectedBLInfo && (
              <Bar
                dataKey={`${selectedBLInfo.id}_period`}
                fill={BL_COLORS[selectedBLInfo.index]}
                fillOpacity={0.35}
                barSize={effectiveBarSize}
                name={`${selectedBLInfo.label} (período)`}
                legendType="none"
                isAnimationActive={false}
              />
            )}
            <Bar
              dataKey="forecastPeriod"
              fill={COLOR_FORECAST}
              fillOpacity={0.35}
              barSize={effectiveBarSize}
              name="Forecast (período)"
              legendType="none"
              isAnimationActive={false}
            />
            <Bar
              dataKey="actualPeriod"
              fill={COLOR_REAL}
              fillOpacity={0.35}
              barSize={effectiveBarSize}
              name="Real (período)"
              legendType="none"
              isAnimationActive={false}
            />

            {availableBLs.filter((bl) => !hiddenBLs.includes(bl.id)).map((bl) => (
              <Area
                key={bl.id}
                type="monotone"
                dataKey={bl.id}
                stroke={BL_COLORS[bl.index]}
                fill={BL_COLORS[bl.index]}
                fillOpacity={bl.id === selectedBL ? 0.03 : 0}
                strokeWidth={bl.id === selectedBL ? 2.5 : 1.5}
                strokeOpacity={bl.id === selectedBL ? 1 : 0.55}
                dot={false}
                name={bl.label}
                isAnimationActive={false}
              />
            ))}

            <Area type="monotone" dataKey="actual" stroke={COLOR_REAL} fill={COLOR_REAL} fillOpacity={0.08} strokeWidth={2.5} name="Real" isAnimationActive={false} />
            <Area type="monotone" dataKey="forecast" stroke={COLOR_FORECAST} fill={COLOR_FORECAST} fillOpacity={0.05} strokeWidth={2.5} strokeOpacity={1} strokeDasharray="6 3" dot={false} name="Forecast" isAnimationActive={false} />

            {statusX !== null && (
              <ReferenceLine
                x={statusX}
                stroke="#dc2626"
                strokeDasharray="4 4"
                label={{ value: 'Status', position: 'top', fill: '#dc2626', fontSize: 14, fontWeight: 600 }}
              />
            )}

            {/* Pontos de atenção — ocorrências de gravidade alta/crítica no período do
                gráfico, marcadas perto do eixo X com a cor da categoria. */}
            {occurrences.map((occ) => {
              const categoryDef = getCategoryDef(occ.type)
              return (
                <ReferenceDot
                  key={occ.id}
                  x={new Date(occ.date).getTime()}
                  y={2}
                  r={0}
                  ifOverflow="visible"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  shape={(props: any) => (
                    <g
                      transform={`translate(${props.cx}, ${props.cy})`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setOccTooltip({ occurrence: occ, coordinate: { x: props.cx, y: props.cy } })}
                      onMouseLeave={() => setOccTooltip(null)}
                    >
                      <circle r={6} fill={categoryDef.color} stroke="#fff" strokeWidth={1.5} />
                    </g>
                  )}
                />
              )
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {tooltipState?.active && chartContainerRef.current && (() => {
        const rect = chartContainerRef.current!.getBoundingClientRect()
        const tooltipWidth = 380
        const tooltipHeight = 260
        const margin = 12

        let left = rect.left + tooltipState.coordinate.x + margin
        if (left + tooltipWidth > window.innerWidth - 8) {
          left = rect.left + tooltipState.coordinate.x - tooltipWidth - margin
        }
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))

        let top = rect.top + tooltipState.coordinate.y
        top = Math.max(tooltipHeight / 2 + 8, Math.min(top, window.innerHeight - tooltipHeight / 2 - 8))

        return createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left,
              top,
              transform: 'translateY(-50%)',
            }}
          >
            <CurveTooltip
              active={tooltipState.active}
              label={tooltipState.label}
              granularity={granularity}
              unit={unit}
              curveData={curveData}
              availableBLs={availableBLs.filter((bl) => !hiddenBLs.includes(bl.id))}
              selectedBL={selectedBL}
            />
          </div>,
          document.body,
        )
      })()}
      {occTooltip && chartContainerRef.current && (() => {
        const rect = chartContainerRef.current!.getBoundingClientRect()
        const tooltipWidth = 280
        const tooltipHeight = 140
        const margin = 12
        const categoryDef = getCategoryDef(occTooltip.occurrence.type)
        const severityDef = getSeverityDef(occTooltip.occurrence.severity)
        const CategoryIcon = categoryDef.icon

        let left = rect.left + occTooltip.coordinate.x + margin
        if (left + tooltipWidth > window.innerWidth - 8) {
          left = rect.left + occTooltip.coordinate.x - tooltipWidth - margin
        }
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))

        let top = rect.top + occTooltip.coordinate.y - tooltipHeight - margin
        top = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8))

        return createPortal(
          <div
            className="fixed z-[9999] pointer-events-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3"
            style={{ left, top, width: tooltipWidth }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="p-1 rounded"
                style={{ backgroundColor: categoryDef.color + '1a', color: categoryDef.color }}
              >
                <CategoryIcon size={14} />
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{categoryDef.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityDef.badgeClass}`}>
                {severityDef.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {new Date(occTooltip.occurrence.date).toLocaleDateString('pt-BR')}
              {occTooltip.occurrence.impactDays > 0 && ` · +${occTooltip.occurrence.impactDays} dias de impacto`}
            </p>
            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
              {occTooltip.occurrence.description}
            </p>
          </div>,
          document.body,
        )
      })()}
    </>
  )
}
