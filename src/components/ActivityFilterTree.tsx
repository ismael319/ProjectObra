import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Search, X } from 'lucide-react'
import type { WBSActivity } from '@/lib/xml-parser'

interface TreeNode {
  activity: WBSActivity
  children: TreeNode[]
  leafUids: number[]
}

function buildTree(activities: WBSActivity[]): TreeNode[] {
  const roots: TreeNode[] = []
  const stack: TreeNode[] = []

  for (const activity of activities) {
    const node: TreeNode = { activity, children: [], leafUids: [] }
    while (stack.length > 0 && stack[stack.length - 1].activity.outlineLevel >= activity.outlineLevel) {
      stack.pop()
    }
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }

  function computeLeaves(node: TreeNode): number[] {
    node.leafUids = node.children.length === 0 ? [node.activity.uid] : node.children.flatMap(computeLeaves)
    return node.leafUids
  }
  roots.forEach(computeLeaves)
  return roots
}

// Busca cobre EDT/ID/nome e também as colunas personalizadas do MS Project
// (Responsável, Disciplina, Área, Text1-3, Notas) — cada projeto usa esses campos
// livremente, então não dá pra saber de antemão qual coluna importa pro usuário.
function nodeMatchesSearch(node: TreeNode, term: string): boolean {
  const a = node.activity
  const haystack = [
    a.wbs, a.name, a.uid, a.responsible, a.discipline, a.area, a.text1, a.text2, a.text3, a.notes,
  ].filter(Boolean).join(' ').toLowerCase()
  if (haystack.includes(term)) return true
  return node.children.some((c) => nodeMatchesSearch(c, term))
}

function TriStateCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
    />
  )
}

interface RowProps {
  node: TreeNode
  excluded: Set<number>
  onToggle: (leafUids: number[], nextIncluded: boolean) => void
  expanded: Set<number>
  onToggleExpand: (uid: number) => void
  searchTerm: string
}

function Row({ node, excluded, onToggle, expanded, onToggleExpand, searchTerm }: RowProps) {
  const { activity, children, leafUids } = node
  const excludedCount = leafUids.filter((uid) => excluded.has(uid)).length
  const checked = excludedCount === 0
  const indeterminate = !checked && excludedCount < leafUids.length
  const isSearching = searchTerm.length > 0
  const isOpen = isSearching || expanded.has(activity.uid)
  const hasChildren = children.length > 0
  const visibleChildren = isSearching ? children.filter((c) => nodeMatchesSearch(c, searchTerm)) : children

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
        style={{ paddingLeft: `${(activity.outlineLevel - 1) * 16 + 4}px` }}
        onClick={() => hasChildren && onToggleExpand(activity.uid)}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <TriStateCheckbox checked={checked} indeterminate={indeterminate} onChange={() => onToggle(leafUids, !checked)} />
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono flex-shrink-0 w-14 truncate" title={activity.wbs}>
          {activity.wbs}
        </span>
        <span className={`text-xs truncate ${activity.isSummary ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
          {activity.name}
        </span>
      </div>
      {hasChildren && isOpen && (
        <div>
          {visibleChildren.map((child) => (
            <Row
              key={child.activity.uid}
              node={child}
              excluded={excluded}
              onToggle={onToggle}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ActivityFilterTreeProps {
  activities: WBSActivity[]
  excluded: Set<number>
  onChange: (next: Set<number>) => void
}

export default function ActivityFilterTree({ activities, excluded, onChange }: ActivityFilterTreeProps) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(activities.map((a) => a.uid)))

  const tree = useMemo(() => buildTree(activities), [activities])
  const allLeafUids = useMemo(() => activities.filter((a) => !a.isSummary).map((a) => a.uid), [activities])
  const includedCount = allLeafUids.length - excluded.size

  const searchTerm = search.trim().toLowerCase()
  const visibleRoots = searchTerm ? tree.filter((n) => nodeMatchesSearch(n, searchTerm)) : tree

  const handleToggle = useCallback((leafUids: number[], nextIncluded: boolean) => {
    const next = new Set(excluded)
    for (const uid of leafUids) {
      if (nextIncluded) next.delete(uid)
      else next.add(uid)
    }
    onChange(next)
  }, [excluded, onChange])

  const handleToggleExpand = useCallback((uid: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Filtrar Atividades</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {includedCount} de {allLeafUids.length} incluídas
        </span>
      </div>

      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por EDT, ID, nome, responsável, disciplina, área..."
          className="w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => onChange(new Set())} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Incluir todas
        </button>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <button onClick={() => onChange(new Set(allLeafUids))} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Excluir todas
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg p-1">
        {visibleRoots.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma atividade encontrada</p>
        ) : (
          visibleRoots.map((node) => (
            <Row
              key={node.activity.uid}
              node={node}
              excluded={excluded}
              onToggle={handleToggle}
              expanded={expanded}
              onToggleExpand={handleToggleExpand}
              searchTerm={searchTerm}
            />
          ))
        )}
      </div>
    </div>
  )
}
