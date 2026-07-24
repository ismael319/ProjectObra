import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, Info } from 'lucide-react'

interface PlanningTool {
  label: string
  path: string
  info?: string
}

const PLANNING_TOOLS: PlanningTool[] = [
  { label: 'Curva S', path: '/dashboard/planning' },
  { label: 'Programação', path: '/dashboard/daily' },
  { label: 'Gantt Livre', path: '/dashboard/gantt' },
  {
    label: 'Histograma MO',
    path: '/dashboard/resources',
    info: 'Distribuição de mão de obra (efetivo) ao longo do cronograma',
  },
]

export default function PlanningSwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const current = PLANNING_TOOLS.find((t) => t.path === location.pathname) ?? PLANNING_TOOLS[0]

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside)
      return () => document.removeEventListener('mousedown', onClickOutside)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm shadow-sm hover:shadow transition"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Planejamento
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="font-semibold text-gray-900 dark:text-white">{current.label}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-30 py-1.5">
          <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Planejamento
          </div>
          {PLANNING_TOOLS.map((tool) => {
            const isActive = tool.path === current.path
            return (
              <button
                key={tool.path}
                onClick={() => { navigate(tool.path); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200 font-semibold'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-orange-500 hover:text-white'
                }`}
              >
                <span>{tool.label}</span>
                {tool.info && (
                  <span title={tool.info}>
                    <Info size={13} className="opacity-70" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
