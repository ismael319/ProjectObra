import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BarChart3, GanttChart,
  Calendar, AlertTriangle, PieChart,
  Award, Menu, X, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, TrendingUp,
  ClipboardList, CheckSquare, Search, BarChart,
  FolderCog,
  FolderTree, FileSpreadsheet, CloudRain,
  Settings, PackageSearch, UserCog,
  Truck, LineChart, Database, FlaskConical,
  ShieldCheck, Map,
} from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { PapelUsuario } from '@/lib/auth-context'

interface NavItem {
  icon: React.ElementType
  label: string
  path: string
  children?: NavItem[]
  disabled?: boolean
}

// Telas de administração do sistema — agrupadas sob "Sistema" no rodapé da
// sidebar, visíveis só pra quem tem papel Edição no módulo 'sistema'.
// A chave não é uma rota: o grupo só abre/fecha, não navega pra lugar nenhum.
const SISTEMA_KEY = 'grupo:sistema'
const SISTEMA_ITEMS = [
  { to: '/dashboard/admin/users', label: 'Usuários', Icon: UserCog },
  { to: '/dashboard/admin/validacoes', label: 'Validações', Icon: ShieldCheck },
]

// Telas do Gantt Livre, Apontamento/EAP, Programação semanal e Mapa de Chuvas
// (módulo "engenharia") e RDR (módulo "seguranca") só aparecem pra empresas
// que têm esse módulo contratado (ver RequireModulo + Empresas Clientes, onde
// o Dono da Plataforma libera). Isso é só cosmético: a proteção de verdade é
// o RLS (modulos-plataforma-migration.sql).
function buildNavSections(modulos: string[]): { title: string; items: NavItem[] }[] {
  const temEngenharia = modulos.includes('engenharia')
  const temSeguranca = modulos.includes('seguranca')
  const temSuprimentos = modulos.includes('suprimentos')
  const temAdministracao = modulos.includes('administracao')
  const temQualidade = modulos.includes('qualidade')

  // Todo o bloco de Engenharia (inclusive Curva S/Histograma MO/Ocorrências/
  // Mão de Obra, que antes ficavam sempre visíveis) só existe quando a
  // empresa/usuário tem o módulo 'engenharia' — sem isso, um usuário
  // restrito a outro módulo (ex.: Administração) via user_modulos_visiveis
  // continuava vendo essas telas de Engenharia, tanto na sidebar quanto (a
  // rota em si não checava o módulo) direto pela URL.
  const engenhariaItems: NavItem[] = temEngenharia ? [
    {
      icon: TrendingUp, label: 'Planejamento', path: '/dashboard/planning',
      children: [
        { icon: BarChart3, label: 'Curva S', path: '/dashboard/planning' },
        { icon: Calendar, label: 'Programação', path: '/dashboard/daily' },
        { icon: GanttChart, label: 'Gantt Livre', path: '/dashboard/gantt' },
        { icon: LineChart, label: 'Histograma', path: '/dashboard/histograma-mo' },
      ],
    },
    {
      icon: PieChart, label: 'Distribuição Efetivo', path: '/dashboard/people',
      children: [
        { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/people/lancamento' },
        { icon: CheckSquare, label: 'Validação', path: '/dashboard/people/validacao' },
        { icon: Search, label: 'Consulta', path: '/dashboard/people/consulta' },
        { icon: BarChart, label: 'Resumo', path: '/dashboard/people/resumo' },
        { icon: FolderCog, label: 'Cadastro', path: '/dashboard/people/cadastro' },
        { icon: FolderTree, label: 'EAP', path: '/dashboard/people/eap' },
        { icon: FileSpreadsheet, label: 'Importar EAP', path: '/dashboard/people/importar-eap' },
      ],
    },
    { icon: Map, label: 'Gestão à Vista', path: '/dashboard/gestao-vista' },
    { icon: AlertTriangle, label: 'Ocorrências', path: '/dashboard/occurrences' },
    { icon: CloudRain, label: 'Mapa de Chuvas', path: '/dashboard/mapa-chuvas' },
  ] : []

  const qualidadeItems: NavItem[] = temQualidade ? [
    {
      icon: Truck, label: 'Concreto', path: '/dashboard/qualidade/concreto',
      children: [
        { icon: BarChart, label: 'Dashboard', path: '/dashboard/qualidade/concreto/dashboard' },
        { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/qualidade/concreto/lancamento' },
        { icon: CheckSquare, label: 'Validação', path: '/dashboard/qualidade/concreto/validacao' },
        { icon: Search, label: 'Consulta', path: '/dashboard/qualidade/concreto/consulta' },
        { icon: FlaskConical, label: 'Ensaios', path: '/dashboard/qualidade/concreto/ensaios' },
        { icon: FolderCog, label: 'Cadastro', path: '/dashboard/qualidade/concreto/cadastro' },
        { icon: Database, label: 'Dados', path: '/dashboard/qualidade/concreto/importar-historico' },
      ],
    },
  ] : []

  const segurancaItems: NavItem[] = temSeguranca ? [
    { icon: BarChart, label: 'Dashboard RDR', path: '/dashboard/seguranca/dashboard' },
    { icon: ClipboardList, label: 'Novo Registro', path: '/dashboard/seguranca/novo' },
    { icon: Search, label: 'Registros', path: '/dashboard/seguranca/registros' },
  ] : []

  return [
    ...(temEngenharia ? [{ title: 'Engenharia', items: engenhariaItems }] : []),
    ...(temSeguranca ? [{ title: 'Segurança', items: segurancaItems }] : []),
    ...(temSuprimentos
      ? [{ title: 'Suprimentos', items: [{ icon: PackageSearch, label: 'Alertas Sienge', path: '/dashboard/suprimentos' }] }]
      : []),
    ...(temAdministracao
      ? [{
          title: 'Administração', items: [
            { icon: UserCog, label: 'Controle de Funcionários', path: '/dashboard/administracao' },
          ],
        }]
      : []),
    ...(temQualidade ? [{ title: 'Qualidade', items: qualidadeItems }] : []),
  ]
}

// Apontadores (papel "insercao_pontual") só enxergam o lançamento de efetivo.
const navSectionsInsercaoPontual: { title: string; items: NavItem[] }[] = [
  {
    title: 'Distribuição Efetivo',
    items: [
      { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/people/lancamento' },
    ],
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
  mobileOpen: boolean
  onMobileClose: () => void
  papel?: PapelUsuario
  modulos?: string[]
  // Papel efetivo NO módulo "sistema" (calculado no DashboardLayout, que tem
  // acesso a papelPorModulo) — não dá pra derivar aqui só do `papel` global,
  // já que alguém pode ter um override edicao só em "sistema".
  podeGerenciarUsuarios?: boolean
}

export default function Sidebar({
  collapsed, onToggle, mobileOpen, onMobileClose, papel,
  modulos = [], podeGerenciarUsuarios = false,
}: SidebarProps) {
  const isInsercaoPontual = papel === 'insercao_pontual'

  const navSections = isInsercaoPontual ? navSectionsInsercaoPontual : buildNavSections(modulos)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['Visão Geral', 'Engenharia', 'Distribuição Efetivo'])
  )
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const location = useLocation()
  const { brandColor } = useTheme()

  // Mapeia cada módulo para seus paths e título da seção na sidebar
  const moduloPaths: Record<string, { title: string; paths: string[]; expandiveis: string[] }> = {
    engenharia: {
      title: 'Engenharia',
      paths: [
        '/dashboard/planning', '/dashboard/daily', '/dashboard/gantt', '/dashboard/histograma-mo',
        '/dashboard/people', '/dashboard/people/lancamento', '/dashboard/people/validacao',
        '/dashboard/people/consulta', '/dashboard/people/resumo', '/dashboard/people/cadastro',
        '/dashboard/people/eap', '/dashboard/people/importar-eap',
        '/dashboard/occurrences', '/dashboard/mapa-chuvas',
      ],
      expandiveis: ['/dashboard/planning', '/dashboard/people'],
    },
    seguranca: {
      title: 'Segurança',
      paths: ['/dashboard/seguranca/dashboard', '/dashboard/seguranca/novo', '/dashboard/seguranca/registros'],
      expandiveis: [],
    },
    suprimentos: {
      title: 'Suprimentos',
      paths: ['/dashboard/suprimentos'],
      expandiveis: [],
    },
    administracao: {
      title: 'Administração',
      paths: ['/dashboard/administracao'],
      expandiveis: [],
    },
    qualidade: {
      title: 'Qualidade',
      paths: ['/dashboard/qualidade/concreto', '/dashboard/qualidade/concreto/dashboard', '/dashboard/qualidade/concreto/lancamento', '/dashboard/qualidade/concreto/validacao', '/dashboard/qualidade/concreto/consulta', '/dashboard/qualidade/concreto/ensaios', '/dashboard/qualidade/concreto/cadastro', '/dashboard/qualidade/concreto/importar-historico'],
      expandiveis: ['/dashboard/qualidade/concreto'],
    },
  }

  // Recolhe a seção do módulo anterior quando o usuário navega para outro módulo
  useEffect(() => {
    const moduloAtual = Object.entries(moduloPaths).find(([, config]) =>
      config.paths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
    )?.[0]

    if (!moduloAtual) return

    // Recolhe todas as seções que NÃO são a atual
    for (const [key, config] of Object.entries(moduloPaths)) {
      if (key === moduloAtual) continue
      setExpandedSections((prev) => {
        if (!prev.has(config.title)) return prev
        const next = new Set(prev)
        next.delete(config.title)
        return next
      })
      setExpandedItems((prev) => {
        let changed = false
        const next = new Set(prev)
        for (const p of config.expandiveis) {
          if (next.has(p)) {
            next.delete(p)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
  }, [location.pathname])

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

  // Realça o grupo "Sistema" enquanto qualquer tela dele estiver aberta —
  // mesmo comportamento de isItemOrChildActive nas seções do nav.
  const isSistemaAtivo = SISTEMA_ITEMS.some((i) => isActive(i.to))
  const sistemaAberto = expandedItems.has(SISTEMA_KEY)

  const activeStyle = (path: string): React.CSSProperties =>
    isActive(path)
      ? { backgroundColor: sidebarActiveTint, borderLeft: `3px solid ${sidebarActive}`, paddingLeft: collapsed ? undefined : 'calc(0.75rem - 3px)' }
      : {}

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-40 lg:hidden" onClick={() => onMobileClose()} />
      )}

      <aside
        className={`fixed top-16 left-0 bottom-0 text-white z-50 transform transition-all duration-300 lg:translate-x-0 flex flex-col border-r border-black/10 shadow-[4px_0_16px_-8px_rgba(0,0,0,0.3)] ${collapsed ? 'w-16' : 'w-64 max-w-[85vw]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ backgroundColor: sidebarBg }}
      >
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'p-2 pt-4' : 'p-3 pt-4 space-y-5'}`}>
          {!isInsercaoPontual && (
            <>
              <Link
                to="/dashboard"
                onClick={() => onMobileClose()}
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
            </>
          )}

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

                    if (item.disabled) {
                      return (
                        <div
                          key={item.path}
                          title="Em breve"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-white/50 cursor-not-allowed select-none"
                        >
                          <item.icon size={17} className="opacity-60" />
                          <span className="flex-1">{item.label}</span>
                        </div>
                      )
                    }

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
                                  onClick={() => onMobileClose()}
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
                        onClick={() => onMobileClose()}
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
                    if (item.disabled) {
                      return (
                        <div
                          key={item.path}
                          title="Em breve"
                          className="flex items-center justify-center px-2 py-2.5 rounded-md text-sm text-white/50 cursor-not-allowed select-none"
                        >
                          <item.icon size={17} className="opacity-60" />
                        </div>
                      )
                    }
                    if (hasChildren) {
                      return (
                        <div key={item.path} className="relative group">
                          <Link
                            to={item.path}
                            onClick={() => onMobileClose()}
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
                                  onClick={() => onMobileClose()}
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
                        onClick={() => onMobileClose()}
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

        {podeGerenciarUsuarios && (
          <div className={`border-t ${collapsed ? 'p-2' : 'p-3'}`} style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
            {/* "Sistema" é o grupo; Usuários e Validações são as telas dentro
                dele. Reusa expandedItems/toggleItem do nav — começa fechado,
                igual aos outros itens com filhos. */}
            <button
              type="button"
              onClick={() => !collapsed && toggleItem(SISTEMA_KEY)}
              className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${isSistemaAtivo ? 'text-white' : 'text-white/80 hover:text-white'}`}
              style={isSistemaAtivo ? { backgroundColor: sidebarActiveTint, borderLeft: `3px solid ${sidebarActive}` } : undefined}
              onMouseEnter={(e) => { if (!isSistemaAtivo) e.currentTarget.style.backgroundColor = sidebarHover }}
              onMouseLeave={(e) => { if (!isSistemaAtivo) e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Sistema"
            >
              <Settings size={18} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Sistema</span>
                  {sistemaAberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </>
              )}
            </button>

            {/* Recolhida, os filhos ficam sempre à mostra como ícones: o rótulo
                do grupo não cabe e esconder deixaria as telas sem caminho. */}
            {(collapsed || sistemaAberto) && (
              <div className={collapsed ? 'space-y-0.5' : 'mt-0.5 ml-3 pl-3 border-l border-white/15 space-y-0.5'}>
                {SISTEMA_ITEMS.map(({ to, label, Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => onMobileClose()}
                    className={`flex items-center gap-3 rounded-md text-sm transition-colors duration-150 ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
                    } ${isActive(to) ? 'text-white font-semibold' : 'text-white/80 hover:text-white font-medium'}`}
                    style={activeStyle(to)}
                    onMouseEnter={(e) => { if (!isActive(to)) e.currentTarget.style.backgroundColor = sidebarHover }}
                    onMouseLeave={(e) => { if (!isActive(to)) e.currentTarget.style.backgroundColor = 'transparent' }}
                    title={label}
                  >
                    <Icon size={collapsed ? 18 : 15} />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
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
