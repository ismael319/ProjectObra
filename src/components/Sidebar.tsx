import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BarChart3, GanttChart,
  Users, Calendar, AlertTriangle, Clock, PieChart,
  Shield, Award, Menu, X, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, TrendingUp,
  ClipboardList, CheckSquare, Search, BarChart,
  FolderCog,
  FolderTree, FileSpreadsheet,
} from 'lucide-react'
import { useTheme } from '@/lib/theme-context'

interface NavItem {
  icon: React.ElementType
  label: string
  path: string
  children?: NavItem[]
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Engenharia',
    items: [
      {
        icon: TrendingUp, label: 'Planejamento', path: '/dashboard/planning',
        children: [
          { icon: BarChart3, label: 'Curva S', path: '/dashboard/planning' },
          { icon: Calendar, label: 'Programação', path: '/dashboard/daily' },
          { icon: GanttChart, label: 'Gantt Livre', path: '/dashboard/gantt' },
          { icon: Users, label: 'Histograma MO', path: '/dashboard/resources' },
        ],
      },
      {
        icon: PieChart, label: 'Distribuição Efetivo', path: '/dashboard/people',
        children: [
          { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/people/lancamento' },
          { icon: CheckSquare, label: 'Validação', path: '/dashboard/people/validacao' },
          { icon: Search, label: 'Consulta', path: '/dashboard/people/consulta' },
          { icon: BarChart, label: 'Resumo Diário', path: '/dashboard/people/resumo' },
          { icon: FolderCog, label: 'Cadastro', path: '/dashboard/people/cadastro' },
          { icon: FolderTree, label: 'EAP', path: '/dashboard/people/eap' },
          { icon: FileSpreadsheet, label: 'Importar EAP', path: '/dashboard/people/importar-eap' },
        ],
      },
      { icon: AlertTriangle, label: 'Ocorrências', path: '/dashboard/occurrences' },
      { icon: Clock, label: 'Mão de Obra', path: '/dashboard/labor' },
    ],
  },
  {
    title: 'Segurança',
    items: [
      { icon: Shield, label: 'RDR - Dashboard', path: '/dashboard/security/rdr' },
    ],
  },
  {
    title: 'Qualidade',
    items: [],
  },
]

function hexToHSL(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function shadeColor(hex: string, percent: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const nr = Math.min(255, Math.max(0, Math.round(r * (1 + percent / 100))))
  const ng = Math.min(255, Math.max(0, Math.round(g * (1 + percent / 100))))
  const nb = Math.min(255, Math.max(0, Math.round(b * (1 + percent / 100))))

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['Visão Geral', 'Engenharia'])
  )
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const location = useLocation()
  const { brandColor } = useTheme()

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const toggleItem = (path: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const isItemActive = (path: string) => location.pathname === path
  const isItemOrChildActive = (item: NavItem): boolean => {
    if (isItemActive(item.path)) return true
    return item.children?.some((c) => isItemOrChildActive(c)) ?? false
  }

  const sidebarBg = shadeColor(brandColor, -70)
  const sidebarHover = shadeColor(brandColor, -55)
  const sidebarActive = brandColor
  const sidebarActiveTint = `${brandColor}30`

  const isActive = (path: string) => location.pathname === path

  const activeStyle = (path: string): React.CSSProperties =>
    isActive(path)
      ? { backgroundColor: sidebarActiveTint, borderLeft: `3px solid ${sidebarActive}`, paddingLeft: collapsed ? undefined : 'calc(0.75rem - 3px)' }
      : {}

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-40 lg:hidden" onClick={() => setIsOpen(false)} />
      )}

      <aside
        className={`fixed top-16 left-0 bottom-0 text-white z-50 transform transition-all duration-300 lg:translate-x-0 overflow-y-auto border-r border-black/10 shadow-[4px_0_16px_-8px_rgba(0,0,0,0.3)] ${collapsed ? 'w-16' : 'w-64'} ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ backgroundColor: sidebarBg }}
      >
        <nav className={`${collapsed ? 'p-2 pt-4' : 'p-3 pt-4 space-y-5'}`}>
          <Link
            to="/dashboard"
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 rounded-lg text-sm font-semibold transition-colors duration-150 ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${
              isActive('/dashboard')
                ? 'text-white'
                : 'text-white/80 hover:text-white'
            }`}
            style={activeStyle('/dashboard')}
            onMouseEnter={(e) => { if (!isActive('/dashboard')) e.currentTarget.style.backgroundColor = sidebarHover }}
            onMouseLeave={(e) => { if (!isActive('/dashboard')) e.currentTarget.style.backgroundColor = 'transparent' }}
            title="Visão Geral"
          >
            <LayoutDashboard size={18} />
            {!collapsed && <span>Visão Geral</span>}
          </Link>

          {!collapsed && <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />}

          {navSections.map((section) => (
            <div key={section.title}>
              <button
                onClick={() => toggleSection(section.title)}
                className={`flex items-center justify-between w-full text-[11px] font-bold uppercase tracking-widest mb-1.5 transition-colors ${collapsed ? 'px-0 justify-center' : 'px-2'}`}
                style={{ color: 'rgba(255,255,255,0.6)' }}
                title={section.title}
              >
                {collapsed ? (
                  <span className="text-[10px]">{section.title.charAt(0)}</span>
                ) : (
                  <>
                    {section.title}
                    {section.items.length > 0 && (
                      expandedSections.has(section.title) ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                    )}
                  </>
                )}
              </button>
              {!collapsed && expandedSections.has(section.title) && section.items.length > 0 && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const hasChildren = item.children && item.children.length > 0
                    const itemExpanded = expandedItems.has(item.path)
                    const itemActive = isItemOrChildActive(item)

                    if (hasChildren) {
                      return (
                        <div key={item.path}>
                          <button
                            onClick={() => toggleItem(item.path)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 w-full text-left ${
                              itemActive
                                ? 'text-white font-semibold'
                                : 'text-white/80 hover:text-white font-medium'
                            }`}
                            style={itemActive ? { backgroundColor: `${sidebarActive}26` } : undefined}
                            onMouseEnter={(e) => { if (!itemActive) e.currentTarget.style.backgroundColor = sidebarHover }}
                            onMouseLeave={(e) => { if (!itemActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <item.icon size={17} className={itemActive ? '' : 'opacity-90'} />
                            <span className="flex-1">{item.label}</span>
                            {itemExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          {itemExpanded && (
                            <div className="ml-4 space-y-0.5 border-l border-white/20 pl-2 mt-0.5">
                              {item.children!.map((child) => (
                                <Link
                                  key={child.path}
                                  to={child.path}
                                  onClick={() => setIsOpen(false)}
                                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                                    isItemActive(child.path)
                                      ? 'text-white font-semibold'
                                      : 'text-white/80 hover:text-white font-medium'
                                  }`}
                                  style={activeStyle(child.path)}
                                  onMouseEnter={(e) => { if (!isItemActive(child.path)) e.currentTarget.style.backgroundColor = sidebarHover }}
                                  onMouseLeave={(e) => { if (!isItemActive(child.path)) e.currentTarget.style.backgroundColor = 'transparent' }}
                                >
                                  <child.icon size={15} className={isItemActive(child.path) ? '' : 'opacity-90'} />
                                  {child.label}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 ${
                          isActive(item.path)
                            ? 'text-white font-semibold'
                            : 'text-white/80 hover:text-white font-medium'
                        }`}
                        style={activeStyle(item.path)}
                        onMouseEnter={(e) => { if (!isActive(item.path)) e.currentTarget.style.backgroundColor = sidebarHover }}
                        onMouseLeave={(e) => { if (!isActive(item.path)) e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <item.icon size={17} className={isActive(item.path) ? '' : 'opacity-90'} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
              {collapsed && section.items.length > 0 && expandedSections.has(section.title) && (
                <div className="space-y-0.5 mt-1">
                  {section.items.map((item) => {
                    const hasChildren = item.children && item.children.length > 0
                    if (hasChildren) {
                      return (
                        <div key={item.path} className="relative group">
                          <Link
                            to={item.path}
                            onClick={() => setIsOpen(false)}
                            title={item.label}
                            className={`flex items-center justify-center px-2 py-2.5 rounded-md text-sm transition-colors duration-150 ${
                              isItemOrChildActive(item)
                                ? 'text-white font-semibold'
                                : 'text-white/80 hover:text-white font-medium'
                            }`}
                            style={isItemOrChildActive(item) ? { backgroundColor: sidebarActiveTint, borderLeft: `3px solid ${sidebarActive}` } : undefined}
                            onMouseEnter={(e) => { if (!isItemOrChildActive(item)) e.currentTarget.style.backgroundColor = sidebarHover }}
                            onMouseLeave={(e) => { if (!isItemOrChildActive(item)) e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <item.icon size={17} />
                          </Link>
                          <div className="absolute left-full top-0 ml-1 hidden group-hover:block z-50">
                            <div className="rounded-md py-1 min-w-[140px] shadow-lg" style={{ backgroundColor: sidebarBg }}>
                              {item.children!.map((child) => (
                                <Link
                                  key={child.path}
                                  to={child.path}
                                  onClick={() => setIsOpen(false)}
                                  className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                                    isItemActive(child.path)
                                      ? 'text-white font-semibold'
                                      : 'text-white/80 hover:text-white'
                                  }`}
                                  style={isItemActive(child.path) ? { backgroundColor: `${sidebarActive}40` } : undefined}
                                >
                                  <child.icon size={14} />
                                  {child.label}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsOpen(false)}
                        title={item.label}
                        className={`flex items-center justify-center px-2 py-2.5 rounded-md text-sm transition-colors duration-150 ${
                          isActive(item.path)
                            ? 'text-white font-semibold'
                            : 'text-white/80 hover:text-white font-medium'
                        }`}
                        style={isActive(item.path) ? { backgroundColor: sidebarActiveTint, borderLeft: `3px solid ${sidebarActive}` } : undefined}
                        onMouseEnter={(e) => { if (!isActive(item.path)) e.currentTarget.style.backgroundColor = sidebarHover }}
                        onMouseLeave={(e) => { if (!isActive(item.path)) e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <item.icon size={17} />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <button
        onClick={onToggle}
        className={`hidden lg:flex fixed z-50 items-center justify-center w-7 h-7 text-white rounded-full transition-all duration-300 shadow-md border border-white/10 hover:brightness-125 top-[74px] ${collapsed ? 'left-[46px]' : 'left-[242px]'}`}
        style={{ backgroundColor: sidebarActive }}
        title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
      >
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>
    </>
  )
}
