import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, Download, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useProjects } from '@/lib/project-store'
import { useGanttStore } from '@/lib/gantt/store'
import { toISODate } from '@/lib/gantt/dates'
import type { WBSActivity } from '@/lib/xml-parser'
import ColumnValueFilter, { computeColumnFilterExcludedUids, type ColumnFilterState, type ColumnFieldDef } from '@/components/ColumnValueFilter'

const DEFAULT_COR = '#2F6FE4'

interface Props {
  open: boolean
  onClose: () => void
}

interface Row {
  id: string // `${cronogramaId}::${uid}` — único mesmo com WBS repetido entre cronogramas
  uid: number
  cronogramaId: string
  cronogramaNome: string
  cronogramaCor: string
  nome: string
  codigo: string
  outlineLevel: number
  parentId: string | null // já resolvido pro id (não pro código cru) — evita colisão de WBS entre cronogramas
  start: Date
  finish: Date
  isSummary: boolean
  percentComplete: number
}

interface CronogramaGroup {
  id: string
  nome: string
  cor: string
  rows: Row[]
  roots: Row[]
  childrenByParent: Map<string | null, Row[]>
  rawActivities: WBSActivity[]
  customFieldDefs: ColumnFieldDef[]
}

// Constrói as linhas de um cronograma com o pai já resolvido por ID (via
// outlineNumber) — cada cronograma tem seu próprio espaço de números WBS, que
// reinicia em "1" a cada arquivo, então nunca cruza com o de outro cronograma
// aqui (mesmo bug que já mordeu o import da EAP).
function buildRows(cronogramaId: string, cronogramaNome: string, cronogramaCor: string, activities: WBSActivity[]): Row[] {
  const valid = activities.filter((a) => a.outlineLevel > 0 && a.name.trim())
  const byOutlineNumber = new Map(valid.map((a) => [a.outlineNumber, a]))
  return valid.map((a) => {
    const parts = a.outlineNumber ? a.outlineNumber.split('.') : []
    const parentOutline = parts.length > 1 ? parts.slice(0, -1).join('.') : null
    const parentActivity = parentOutline ? byOutlineNumber.get(parentOutline) : null
    return {
      id: `${cronogramaId}::${a.uid}`,
      uid: a.uid,
      cronogramaId,
      cronogramaNome,
      cronogramaCor,
      nome: a.name,
      codigo: a.wbs || a.outlineNumber || String(a.uid),
      outlineLevel: a.outlineLevel,
      parentId: parentActivity ? `${cronogramaId}::${parentActivity.uid}` : null,
      start: a.start,
      finish: a.finish,
      isSummary: a.isSummary,
      percentComplete: a.percentComplete,
    }
  })
}

function RowNode({
  row, childrenByParent, depth, selected, onToggle,
}: {
  row: Row
  childrenByParent: Map<string | null, Row[]>
  depth: number
  selected: Set<string>
  onToggle: (row: Row) => void
}) {
  const [open, setOpen] = useState(true)
  const children = childrenByParent.get(row.id) ?? []
  const hasChildren = children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-slate-800 text-sm"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="p-0 text-gray-400 dark:text-slate-500 shrink-0"
        >
          {hasChildren ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="inline-block w-3.5" />}
        </button>
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => onToggle(row)}
          className="w-3.5 h-3.5 shrink-0 cursor-pointer"
        />
        {row.codigo && (
          <span className="font-mono text-[10px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1 rounded shrink-0">
            {row.codigo}
          </span>
        )}
        <span className={`truncate ${row.isSummary ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-300'}`}>
          {row.nome}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-slate-500 shrink-0">{Math.round(row.percentComplete)}%</span>
        <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
          {toISODate(row.start)} → {toISODate(row.finish)}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {children.map((c) => (
            <RowNode key={c.id} row={c} childrenByParent={childrenByParent} depth={depth + 1} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ModalImportarCronograma({ open, onClose }: Props) {
  const { currentProject } = useProjects()
  const { addAtividadesBulk } = useGanttStore()
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  const groups = useMemo<CronogramaGroup[]>(() => {
    const cronogramas = (currentProject?.cronogramas ?? []).filter((c) => c.ativo && c.dados)
    return cronogramas.map((c) => {
      const rows = buildRows(c.id, c.nome, c.cor, c.dados!.activities)
      const childrenByParent = new Map<string | null, Row[]>()
      for (const r of rows) {
        const arr = childrenByParent.get(r.parentId) ?? []
        arr.push(r)
        childrenByParent.set(r.parentId, arr)
      }
      return {
        id: c.id, nome: c.nome, cor: c.cor, rows, roots: childrenByParent.get(null) ?? [], childrenByParent,
        rawActivities: c.dados!.activities, customFieldDefs: c.dados!.customFieldDefs,
      }
    })
  }, [currentProject])

  const rowById = useMemo(() => {
    const map = new Map<string, Row>()
    for (const g of groups) for (const r of g.rows) map.set(r.id, r)
    return map
  }, [groups])

  const excludedByGroup = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const g of groups) map.set(g.id, computeColumnFilterExcludedUids(g.rawActivities, columnFilters, g.customFieldDefs))
    return map
  }, [groups, columnFilters])

  // Busca (nome/código) + filtro de coluna decidem quais linhas "batem"; sempre
  // inclui a cadeia de pais de cada uma pra árvore ficar legível (não dá pra
  // recortar só o item achado sem quebrar a hierarquia visual).
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    return groups
      .map((g) => {
        const excluded = excludedByGroup.get(g.id)
        const matches = g.rows.filter((r) => {
          if (excluded?.has(r.uid)) return false
          if (!term) return true
          return r.nome.toLowerCase().includes(term) || r.codigo.toLowerCase().includes(term)
        })
        if (matches.length === 0) return null
        const keep = new Set<string>()
        for (const m of matches) {
          let cur: Row | undefined = m
          while (cur) {
            keep.add(cur.id)
            cur = cur.parentId ? rowById.get(cur.parentId) : undefined
          }
        }
        const rows = g.rows.filter((r) => keep.has(r.id))
        const childrenByParent = new Map<string | null, Row[]>()
        for (const r of rows) {
          const arr = childrenByParent.get(r.parentId) ?? []
          arr.push(r)
          childrenByParent.set(r.parentId, arr)
        }
        return { ...g, rows, roots: childrenByParent.get(null) ?? [], childrenByParent }
      })
      .filter((g): g is CronogramaGroup => g !== null)
  }, [groups, search, rowById, excludedByGroup])

  function toggleRow(row: Row) {
    setSelected((prev) => {
      const next = new Set(prev)
      const turningOn = !next.has(row.id)
      if (turningOn) {
        next.add(row.id)
        // Marca a cadeia de pais junto — sem isso o item entraria sem pai
        // resolvido na hora de importar.
        let cur = row.parentId ? rowById.get(row.parentId) : undefined
        while (cur) {
          next.add(cur.id)
          cur = cur.parentId ? rowById.get(cur.parentId) : undefined
        }
      } else {
        // Desmarca também os descendentes — não faz sentido manter um filho
        // selecionado se o pai não vai ser importado.
        const group = groups.find((g) => g.rows.some((r) => r.id === row.id))
        const toRemove = new Set<string>([row.id])
        const queue = [row.id]
        while (queue.length > 0) {
          const cur = queue.pop()!
          for (const child of group?.childrenByParent.get(cur) ?? []) {
            if (!toRemove.has(child.id)) {
              toRemove.add(child.id)
              queue.push(child.id)
            }
          }
        }
        for (const id of toRemove) next.delete(id)
      }
      return next
    })
  }

  function toggleGroup(group: CronogramaGroup) {
    const allSelected = group.rows.every((r) => selected.has(r.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of group.rows) {
        if (allSelected) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  }

  async function handleImport() {
    const selectedRows = [...rowById.values()].filter((r) => selected.has(r.id))
    if (selectedRows.length === 0) return
    setImporting(true)
    try {
      // Ordena por outlineLevel (pais antes dos filhos) — addAtividadesBulk
      // insere sequencialmente e precisa que o pai já tenha um id real gravado
      // antes de inserir o filho que referencia ele.
      const sorted = [...selectedRows].sort((a, b) => a.outlineLevel - b.outlineLevel)
      const items = sorted.map((r) => ({
        tempId: r.id,
        parentTempId: r.parentId,
        nome: r.nome,
        dataInicio: toISODate(r.start),
        dataFim: toISODate(r.finish),
        equipesAlocadas: [] as string[],
        cor: DEFAULT_COR,
        percentualConcluido: Math.round(r.percentComplete),
      }))
      await addAtividadesBulk(items)
      toast.success(`${items.length} atividade(s) importada(s) do cronograma`)
      setSelected(new Set())
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Download size={18} /> Importar do cronograma
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-3 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou código EDT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
            <ColumnValueFilter
              sources={groups.map((g) => ({ activities: g.rawActivities, customFieldDefs: g.customFieldDefs }))}
              filters={columnFilters}
              onChange={setColumnFilters}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-3">
          {filteredGroups.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-12">
              {groups.length === 0 ? 'Nenhum cronograma ativo carregado no projeto.' : 'Nenhum item encontrado.'}
            </p>
          ) : (
            filteredGroups.map((g) => {
              const allSelected = g.rows.length > 0 && g.rows.every((r) => selected.has(r.id))
              const someSelected = g.rows.some((r) => selected.has(r.id))
              return (
                <div key={g.id} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800/50">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                      onChange={() => toggleGroup(g)}
                      className="w-3.5 h-3.5"
                    />
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.cor }} />
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{g.nome}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto shrink-0">{g.rows.length} itens</span>
                  </div>
                  <div className="py-1 max-h-72 overflow-y-auto">
                    {g.roots.map((r) => (
                      <RowNode key={r.id} row={r} childrenByParent={g.childrenByParent} depth={0} selected={selected} onToggle={toggleRow} />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 dark:border-slate-700">
          <span className="text-xs text-gray-500 dark:text-slate-400">{selected.size} item(ns) selecionado(s)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Importar {selected.size > 0 ? selected.size : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
