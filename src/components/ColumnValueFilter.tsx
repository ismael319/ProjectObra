import { useMemo, useState } from 'react'
import { ChevronLeft, Clock, Plus, Search, X } from 'lucide-react'
import type { WBSActivity } from '@/lib/xml-parser'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/lib/use-media-query'

export interface ColumnFilterState {
  /** 'discipline' | 'responsible' | 'area' | `cf:<nome do campo>` (Extended Attribute, casado por NOME — o FieldID não é estável entre arquivos/cronogramas) */
  key: string
  label: string
  values: string[]
}

export interface ColumnFieldDef {
  fieldId: string
  name: string
}

export const EMPTY_VALUE = '__vazio__'

// Histórico de filtros (coluna+valores) aplicados, pra fixar os mais usados no topo
// da lista de colunas — global (não por cronograma/projeto), guardado no navegador.
const HISTORY_KEY = 'obracontrol_column_filter_history'
const MAX_HISTORY_ENTRIES = 50
const TOP_USED_COUNT = 5

interface FilterHistoryEntry {
  key: string
  label: string
  values: string[]
  count: number
}

function historySignature(key: string, values: string[]): string {
  return `${key}::${[...values].sort().join('|')}`
}

function loadHistory(): FilterHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

function recordFilterUsage(key: string, label: string, values: string[]): void {
  const history = loadHistory()
  const sig = historySignature(key, values)
  const existing = history.find((h) => historySignature(h.key, h.values) === sig)
  if (existing) {
    existing.count++
    existing.label = label
  } else {
    history.push({ key, label, values, count: 1 })
  }
  // Limita o histórico salvo pra não crescer sem parar — mantém só as entradas
  // mais relevantes (mais usadas primeiro).
  history.sort((a, b) => b.count - a.count)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)))
  } catch { /* */ }
}

function getTopUsedFilters(): FilterHistoryEntry[] {
  return loadHistory().sort((a, b) => b.count - a.count).slice(0, TOP_USED_COUNT)
}

// "Área" foi removida da lista — WBSActivity.area nunca é preenchido a partir do XML
// (fica sempre ''), então esse filtro nunca tinha valor nenhum pra oferecer além de
// "(vazio)": filtrar por Área não excluía nada de fato, só parecia um filtro funcional.
const BUILTIN_COLUMNS: { key: string; label: string }[] = [
  { key: 'discipline', label: 'Disciplina' },
  { key: 'responsible', label: 'Responsável' },
]

export function getActivityColumnValue(activity: WBSActivity, key: string, fieldDefs: ColumnFieldDef[]): string {
  if (key === 'discipline') return activity.discipline || ''
  if (key === 'responsible') return activity.responsible || ''
  if (key.startsWith('cf:')) {
    const name = key.slice(3)
    // Campo personalizado é casado por NOME (não FieldID) porque o mesmo campo pode
    // ter FieldID diferente em cada cronograma/arquivo MSPDI — o filtro é global,
    // então precisa resolver o campo certo dentro de CADA cronograma pelo nome.
    const def = fieldDefs.find((d) => d.name === name)
    if (!def) return ''
    return activity.customFields?.[def.fieldId] || ''
  }
  return ''
}

/** UIDs de atividades que NÃO atendem a todos os filtros de coluna ativos (AND entre colunas, OR entre valores da mesma coluna). */
export function computeColumnFilterExcludedUids(
  activities: WBSActivity[],
  filters: ColumnFilterState[],
  fieldDefs: ColumnFieldDef[],
): Set<number> {
  const excluded = new Set<number>()
  const activeFilters = filters.filter((f) => f.values.length > 0)
  if (activeFilters.length === 0) return excluded
  for (const activity of activities) {
    for (const filter of activeFilters) {
      const raw = getActivityColumnValue(activity, filter.key, fieldDefs)
      const value = raw === '' ? EMPTY_VALUE : raw
      if (!filter.values.includes(value)) {
        excluded.add(activity.uid)
        break
      }
    }
  }
  return excluded
}

interface ColumnValueFilterProps {
  /** Um item por cronograma selecionado — cada campo personalizado é resolvido dentro do seu próprio cronograma (mesmo nome pode ter FieldID diferente em cada um). */
  sources: { activities: WBSActivity[]; customFieldDefs: ColumnFieldDef[] }[]
  filters: ColumnFilterState[]
  onChange: (next: ColumnFilterState[]) => void
}

export default function ColumnValueFilter({ sources, filters, onChange }: ColumnValueFilterProps) {
  const isMobile = useMediaQuery('(max-width: 639px)')
  const [adding, setAdding] = useState(false)
  const [step, setStep] = useState<'column' | 'values'>('column')
  const [columnSearch, setColumnSearch] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [pendingValues, setPendingValues] = useState<Set<string>>(new Set())
  const [topUsed, setTopUsed] = useState<FilterHistoryEntry[]>(() => getTopUsedFilters())

  const allColumns = useMemo(() => {
    const names = new Set<string>()
    for (const s of sources) for (const d of s.customFieldDefs) names.add(d.name)
    const custom = Array.from(names).sort((a, b) => a.localeCompare(b)).map((name) => ({ key: `cf:${name}`, label: name }))
    return [...BUILTIN_COLUMNS, ...custom]
  }, [sources])

  const visibleColumns = useMemo(() => {
    const term = columnSearch.trim().toLowerCase()
    if (!term) return allColumns
    return allColumns.filter((c) => c.label.toLowerCase().includes(term))
  }, [allColumns, columnSearch])

  const valueOptions = useMemo(() => {
    if (!pendingKey) return []
    const counts = new Map<string, number>()
    for (const s of sources) {
      for (const a of s.activities) {
        const raw = getActivityColumnValue(a, pendingKey, s.customFieldDefs)
        const value = raw === '' ? EMPTY_VALUE : raw
        counts.set(value, (counts.get(value) || 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [sources, pendingKey])

  const resetAdd = () => {
    setAdding(false)
    setStep('column')
    setColumnSearch('')
    setPendingKey(null)
    setPendingValues(new Set())
  }

  const startAdd = () => {
    setAdding(true)
    setStep('column')
  }

  const pickColumn = (key: string) => {
    setPendingKey(key)
    setPendingValues(new Set())
    setStep('values')
  }

  const toggleValue = (value: string) => {
    setPendingValues((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const confirmAdd = () => {
    if (!pendingKey || pendingValues.size === 0) return
    const label = allColumns.find((c) => c.key === pendingKey)?.label || pendingKey
    const values = Array.from(pendingValues)
    const next = [...filters.filter((f) => f.key !== pendingKey), { key: pendingKey, label, values }]
    onChange(next)
    recordFilterUsage(pendingKey, label, values)
    setTopUsed(getTopUsedFilters())
    resetAdd()
  }

  const applyTopUsed = (entry: FilterHistoryEntry) => {
    const next = [...filters.filter((f) => f.key !== entry.key), { key: entry.key, label: entry.label, values: entry.values }]
    onChange(next)
    recordFilterUsage(entry.key, entry.label, entry.values)
    setTopUsed(getTopUsedFilters())
    resetAdd()
  }

  const removeFilter = (key: string) => {
    onChange(filters.filter((f) => f.key !== key))
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div>
      <div className="flex items-center justify-between mb-2">
        {isMobile ? (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filtrar por Coluna</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs font-medium text-gray-500 underline decoration-dotted underline-offset-2 dark:text-gray-400">
                Filtrar por Coluna
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-xs">
              Exclui atividades que não batem com os valores escolhidos numa coluna (Disciplina, Responsável
              ou um campo personalizado do MS Project). Cada coluna adicionada é combinada com "E" (AND);
              os valores marcados dentro da mesma coluna são combinados com "OU" (OR).
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {filters.map((f) => (
            <span
              key={f.key}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 py-1 pl-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 sm:min-h-0 sm:pr-2"
            >
              <span className="font-medium">{f.label}:</span>
              <span className="max-w-[140px] truncate">
                {f.values.map((v) => (v === EMPTY_VALUE ? '(vazio)' : v)).join(', ')}
              </span>
              <button
                type="button"
                onClick={() => removeFilter(f.key)}
                className="flex h-11 w-11 shrink-0 items-center justify-center hover:text-blue-900 dark:hover:text-blue-100 sm:h-auto sm:w-auto"
                aria-label={`Remover filtro ${f.label}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={startAdd}
          className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 sm:min-h-0"
        >
          <Plus size={13} /> Adicionar filtro por coluna
        </button>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
          {step === 'column' ? (
            <>
              {topUsed.length > 0 && !columnSearch && (
                <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-400 dark:text-gray-500">
                    <Clock size={11} /> Mais usados
                  </div>
                  <div className="space-y-0.5">
                    {topUsed.map((entry) => (
                      <button
                        key={historySignature(entry.key, entry.values)}
                        onClick={() => applyTopUsed(entry)}
                        className="min-h-11 w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50 sm:min-h-0"
                      >
                        <span className="font-medium">{entry.label}:</span>{' '}
                        <span className="text-gray-500 dark:text-gray-400 truncate">
                          {entry.values.map((v) => (v === EMPTY_VALUE ? '(vazio)' : v)).join(', ')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  autoFocus
                  type="text"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  placeholder="Buscar coluna..."
                  className="min-h-11 w-full rounded-lg border border-gray-200 bg-white py-1.5 pr-2 pl-7 text-xs text-gray-700 placeholder:text-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 sm:min-h-0"
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {visibleColumns.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Nenhuma coluna encontrada</p>
                ) : (
                  visibleColumns.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => pickColumn(c.key)}
                      className="min-h-11 w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50 sm:min-h-0"
                    >
                      {c.label}
                    </button>
                  ))
                )}
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={resetAdd} className="min-h-11 px-3 text-[11px] text-gray-500 hover:underline dark:text-gray-400 sm:min-h-0 sm:px-0">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('column')}
                className="mb-2 flex min-h-11 items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400 sm:min-h-0"
              >
                <ChevronLeft size={12} /> {allColumns.find((c) => c.key === pendingKey)?.label}
              </button>
              <div className="max-h-40 overflow-y-auto space-y-0.5 mb-2">
                {valueOptions.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Nenhum valor encontrado</p>
                ) : (
                  valueOptions.map(([value, count]) => (
                    <label
                      key={value}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/50 sm:min-h-0"
                    >
                      <input
                        type="checkbox"
                        checked={pendingValues.has(value)}
                        onChange={() => toggleValue(value)}
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <span className="truncate text-gray-700 dark:text-gray-200">{value === EMPTY_VALUE ? '(vazio)' : value}</span>
                      <span className="text-gray-400 dark:text-gray-500 ml-auto">{count}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetAdd} className="min-h-11 px-2 py-1 text-xs text-gray-500 hover:underline dark:text-gray-400 sm:min-h-0">
                  Cancelar
                </button>
                <button
                  onClick={confirmAdd}
                  disabled={pendingValues.size === 0}
                  className="min-h-11 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
                >
                  Adicionar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </TooltipProvider>
  )
}
