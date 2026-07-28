import { Fragment, useState, useRef, useCallback } from 'react'
import { Upload, X, FileCode } from 'lucide-react'
import { parseMSProjectXML, decodeXmlBytes, type TimephasedDataPoint } from '@/lib/xml-parser'
import { round2 } from '@/lib/curve-utils'

interface Props {
  onClose: () => void
}

interface TypeInfo {
  type: number
  name: string
  totalHours: number
  pointCount: number
  dateRange: string
  periods: { label: string; value: number }[]
}

interface BaselineGapInfo {
  totalRealHours: number
  excludedHours: number
  excludedAssignments: number
  totalAssignmentsWithReal: number
}

interface BaselineBreakdownRow {
  index: number
  hours: number
  points: number
  assignments: number
  taskLevelHours: number
  taskCount: number
  maxTaskHours: number
  maxTaskLabel: string
}

export function SCurveDiagnostic({ onClose }: Props) {
  const [xmlName, setXmlName] = useState<string | null>(null)
  const [typeInfo, setTypeInfo] = useState<TypeInfo[]>([])
  const [rawPointCount, setRawPointCount] = useState(0)
  const [baselineGap, setBaselineGap] = useState<BaselineGapInfo | null>(null)
  const [baselineBreakdown, setBaselineBreakdown] = useState<BaselineBreakdownRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const TYPE_NAMES: Record<number, string> = {
    1: 'Trabalho Planejado (Type 1)',
    2: 'Trabalho Real (Type 2)',
    4: 'Baseline 0 Work (Type 4)',
    5: 'Baseline Work (Type 5→4)',
    9: 'Trabalho Acumulado (Type 9)',
    10: 'Unidades (Type 10)',
    11: 'Percentual (Type 11)',
    16: 'Baseline 1 Work (Type 16)',
    18: 'Acumulada (Type 18)',
    19: 'Acumulada (Type 19)',
    22: 'Custo Acumulado (Type 22)',
    24: 'Série Temporal (Type 24)',
  }

  const handleFile = useCallback(async (file: File) => {
    try {
      setError(null)
      setBaselineGap(null)
      setBaselineBreakdown([])
      setXmlName(file.name)
      // Detecta o encoding pelo BOM em vez de assumir UTF-8 — exports do MS Project
      // costumam vir em UTF-16, e ler como UTF-8 corrompe o arquivo (o DOMParser
      // rejeita como inválido: "Start tag expected, '<' not found").
      const buffer = await file.arrayBuffer()
      const text = decodeXmlBytes(buffer)
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const parseError = doc.querySelector('parsererror')
      if (parseError) {
        setError('Erro ao parsear XML: ' + parseError.textContent?.slice(0, 200))
        return
      }

      const parsed = parseMSProjectXML(text)
      const rawPoints = parsed.timephased?.rawPoints || []
      setRawPointCount(rawPoints.length)

      if (rawPoints.length === 0) {
        setError('Nenhum TimephasedData encontrado no XML')
        return
      }

      // Quantifica quanto do Trabalho Real (Type 2) fica de fora do Avanço Real por
      // pertencer a uma alocação (assignment) sem Baseline 0 própria — mesma regra de
      // capActualByAssignmentBaseline em curve-utils.ts. Comum quando recursos são
      // adicionados/trocados numa tarefa depois que a LB foi salva: a tarefa em si
      // pode ter baseline, mas essa alocação específica não tem.
      const uidsWithBaseline = new Set<number>()
      for (const p of rawPoints) {
        if (p.type === 4 && (p.baselineIndex ?? 0) === 0) uidsWithBaseline.add(p.uid)
      }
      const realPoints = rawPoints.filter((p) => p.type === 2)
      const totalRealHours = realPoints.reduce((s, p) => s + p.valueHours, 0)
      const excludedRealPoints = realPoints.filter((p) => !uidsWithBaseline.has(p.uid))
      const excludedHours = excludedRealPoints.reduce((s, p) => s + p.valueHours, 0)
      const excludedAssignments = new Set(excludedRealPoints.map((p) => p.uid)).size
      const totalAssignmentsWithReal = new Set(realPoints.map((p) => p.uid)).size
      setBaselineGap({ totalRealHours: round2(totalRealHours), excludedHours: round2(excludedHours), excludedAssignments, totalAssignmentsWithReal })

      // Quebra do Type 4 (Baseline Work) por número de baseline (0-10) — no MSPDI,
      // TODAS as linhas de base usam o mesmo Type=4 no <TimephasedData>, diferenciadas
      // só pelo <Number> do <Baseline> pai. A tabela de totais por Type soma tudo
      // junto; esta quebra mostra se o "Real" está de fato excluído por falta de
      // dado, ou se o projeto simplesmente usa uma baseline diferente da BL0 como
      // referência corrente (comum após um re-baseline).
      const blMap = new Map<number, { hours: number; points: number; assignments: Set<number> }>()
      for (const p of rawPoints) {
        if (p.type !== 4) continue
        const idx = p.baselineIndex ?? 0
        const entry = blMap.get(idx) || { hours: 0, points: 0, assignments: new Set<number>() }
        entry.hours += p.valueHours
        entry.points++
        entry.assignments.add(p.uid)
        blMap.set(idx, entry)
      }

      // Total "de origem" por tarefa (<Task><Baseline><Number>/<Work>, direto do XML,
      // sem passar pela extração timephased/sintetização) — compara contra o hours
      // acima pra saber se uma eventual inflação vem do VALOR lido do XML (bug de
      // parsing de duração/unidade) ou da lógica de distribuição sintética.
      const taskLevelByIndex = new Map<number, { hours: number; count: number; max: number; maxLabel: string }>()
      for (const act of parsed.activities) {
        if (act.isSummary) continue
        for (let i = 0; i <= 10; i++) {
          const bl = act.baselines[i]
          if (!bl || bl.work <= 0) continue
          const hoursForTask = bl.work / 60
          const entry = taskLevelByIndex.get(i) || { hours: 0, count: 0, max: 0, maxLabel: '' }
          entry.hours += hoursForTask
          entry.count++
          if (hoursForTask > entry.max) {
            entry.max = hoursForTask
            // isSummary é sempre false aqui (já filtrado acima) — o nível de WBS é o
            // sinal útil: nível 1-2 costuma ser fase/resumo classificado incorretamente
            // como tarefa-folha no XML, o que explicaria um valor desproporcional.
            entry.maxLabel = `UID ${act.uid} · WBS ${act.wbs} (nível ${act.outlineLevel}) · "${act.name}"`
          }
          taskLevelByIndex.set(i, entry)
        }
      }

      const breakdown: BaselineBreakdownRow[] = Array.from(blMap.entries())
        .map(([index, v]) => {
          const t = taskLevelByIndex.get(index)
          return {
            index,
            hours: round2(v.hours),
            points: v.points,
            assignments: v.assignments.size,
            taskLevelHours: round2(t?.hours || 0),
            taskCount: t?.count || 0,
            maxTaskHours: round2(t?.max || 0),
            maxTaskLabel: t?.maxLabel || '',
          }
        })
        .sort((a, b) => a.index - b.index)
      setBaselineBreakdown(breakdown)

      // Agrupar por tipo
      const byType = new Map<number, TimephasedDataPoint[]>()
      for (const p of rawPoints) {
        const arr = byType.get(p.type) || []
        arr.push(p)
        byType.set(p.type, arr)
      }

      const infos: TypeInfo[] = []
      for (const [type, points] of byType) {
        const totalHours = points.reduce((s, p) => s + p.valueHours, 0)
        // Loop em vez de Math.min/max(...array): pontos de projetos grandes podem
        // passar de dezenas de milhares e estourar a pilha de chamadas do JS.
        let minMs = Infinity
        let maxMs = -Infinity
        for (const p of points) {
          const s = p.start.getTime()
          const f = p.finish.getTime()
          if (s < minMs) minMs = s
          if (f > maxMs) maxMs = f
        }
        const minDate = new Date(minMs)
        const maxDate = new Date(maxMs)

        // Agrupar por semana para Type 1
        const periodMap = new Map<string, number>()
        for (const p of points) {
          const weekLabel = `${minDate.getFullYear()}-W${getWeekNumber(p.start)}`
          // Usar start como label
          const d = p.start
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          periodMap.set(key, (periodMap.get(key) || 0) + p.valueHours)
        }

        const periods = Array.from(periodMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 10) // Mostrar só os 10 primeiros e últimos
          .map(([label, value]) => ({ label, value: round2(value) }))

        infos.push({
          type,
          name: TYPE_NAMES[type] || `Type ${type}`,
          totalHours: round2(totalHours),
          pointCount: points.length,
          dateRange: `${minDate.toLocaleDateString('pt-BR')} — ${maxDate.toLocaleDateString('pt-BR')}`,
          periods,
        })
      }

      infos.sort((a, b) => a.type - b.type)
      setTypeInfo(infos)

      console.log('[XMLDiagnostic] Raw points:', rawPoints.length)
      console.table(infos.map((i) => ({
        type: i.type,
        name: i.name,
        totalHours: i.totalHours,
        points: i.pointCount,
        dateRange: i.dateRange,
      })))
    } catch (err) {
      setError('Erro: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileCode size={18} /> Diagnóstico XML — Timephased Data
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition"
          >
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {xmlName || 'Clique para selecionar um arquivo XML do MS Project'}
            </p>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }} />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          {baselineGap && (
            <div className={`rounded-lg p-3 text-sm border ${
              baselineGap.excludedHours > 0
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
            }`}>
              {baselineGap.excludedHours > 0 ? (
                <>
                  <p className="font-semibold">
                    ⚠ {baselineGap.excludedHours.toLocaleString('pt-BR')} h reais ({baselineGap.excludedAssignments} de {baselineGap.totalAssignmentsWithReal} alocações)
                    ficam de fora do Avanço Real por não terem Baseline 0 própria.
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    {baselineGap.totalRealHours > 0
                      ? `Isso representa ${round2((baselineGap.excludedHours / baselineGap.totalRealHours) * 100)}% de todo o Trabalho Real (Type 2) apontado no XML.`
                      : ''}
                    {' '}Geralmente acontece quando um recurso é adicionado/trocado numa tarefa depois que a linha de base foi salva — a alocação nova não tem orçamento de BL0.
                  </p>
                </>
              ) : (
                <p>✓ Todas as alocações com Trabalho Real têm Baseline 0 própria — nenhuma exclusão nesse critério.</p>
              )}
            </div>
          )}

          {baselineBreakdown.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-750 text-sm font-medium text-gray-800 dark:text-gray-200">
                Type 4 (Baseline Work) por número de linha de base
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left font-medium px-4 py-1.5">Baseline</th>
                    <th className="text-right font-medium px-4 py-1.5">Horas (timephased)</th>
                    <th className="text-right font-medium px-4 py-1.5">Pontos</th>
                    <th className="text-right font-medium px-4 py-1.5">Alocações</th>
                    <th className="text-right font-medium px-4 py-1.5">Horas (tarefa, origem)</th>
                    <th className="text-right font-medium px-4 py-1.5">Tarefas</th>
                    <th className="text-right font-medium px-4 py-1.5">Maior tarefa (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {baselineBreakdown.map((row) => (
                    <Fragment key={row.index}>
                      <tr className={row.index === 0 ? 'font-semibold' : ''}>
                        <td className="px-4 py-1 text-gray-700 dark:text-gray-300">BL{row.index}</td>
                        <td className="px-4 py-1 text-right font-mono text-gray-700 dark:text-gray-300">{row.hours.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-1 text-right text-gray-500 dark:text-gray-400">{row.points}</td>
                        <td className="px-4 py-1 text-right text-gray-500 dark:text-gray-400">{row.assignments}</td>
                        <td className="px-4 py-1 text-right font-mono text-gray-700 dark:text-gray-300">{row.taskLevelHours.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-1 text-right text-gray-500 dark:text-gray-400">{row.taskCount}</td>
                        <td className="px-4 py-1 text-right text-gray-500 dark:text-gray-400" title={row.maxTaskLabel}>{row.maxTaskHours.toLocaleString('pt-BR')}</td>
                      </tr>
                      {row.maxTaskLabel && (
                        <tr className="text-[10px] text-gray-400 dark:text-gray-500">
                          <td colSpan={7} className="px-4 pb-1.5 truncate">↳ maior tarefa da BL{row.index}: {row.maxTaskLabel}</td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {baselineBreakdown.length > 1 && (
                <p className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                  O total de "Baseline 0 Work (Type 4)" na tabela abaixo soma TODAS as linhas acima — todas usam o mesmo Type 4 no XML,
                  diferenciadas só pelo número da baseline. Se a maior parte das alocações/horas estiver numa baseline diferente de BL0,
                  é sinal de que o projeto foi re-baselineado e a referência corrente não é mais a BL0.
                </p>
              )}
            </div>
          )}

          {typeInfo.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {rawPointCount} pontos timephased encontrados em {xmlName}
              </p>
              {typeInfo.map((ti) => (
                <div key={ti.type} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className={`px-4 py-2 flex items-center justify-between ${ti.type === 1 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-750'}`}>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {ti.name}
                    </span>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{ti.totalHours.toLocaleString('pt-BR')} h</span>
                      <span>{ti.pointCount} pts</span>
                      <span>{ti.dateRange}</span>
                    </div>
                  </div>
                  {ti.type === 1 && ti.periods.length > 0 && (
                    <div className="px-4 py-2 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                      <p className="text-gray-400 dark:text-gray-500 mb-1">Primeiros 10 períodos com dados Type 1:</p>
                      {ti.periods.map((p, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{p.label}</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400">{p.value.toLocaleString('pt-BR')} h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
