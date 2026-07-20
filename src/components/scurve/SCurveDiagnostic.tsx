import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileCode } from 'lucide-react'
import { parseMSProjectXML, type TimephasedDataPoint } from '@/lib/xml-parser'
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

export function SCurveDiagnostic({ onClose }: Props) {
  const [xmlName, setXmlName] = useState<string | null>(null)
  const [typeInfo, setTypeInfo] = useState<TypeInfo[]>([])
  const [rawPointCount, setRawPointCount] = useState(0)
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
      setXmlName(file.name)
      const text = await file.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const parseError = doc.querySelector('parsererror')
      if (parseError) {
        setError('Erro ao parsear XML: ' + parseError.textContent?.slice(0, 200))
        return
      }

      const parsed = parseMSProjectXML(doc)
      const rawPoints = parsed.timephased?.rawPoints || []
      setRawPointCount(rawPoints.length)

      if (rawPoints.length === 0) {
        setError('Nenhum TimephasedData encontrado no XML')
        return
      }

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
        const starts = points.map((p) => p.start.getTime())
        const ends = points.map((p) => p.finish.getTime())
        const minDate = new Date(Math.min(...starts))
        const maxDate = new Date(Math.max(...ends))

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
