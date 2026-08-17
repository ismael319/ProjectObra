import { useMemo, useState } from 'react'
import { Ellipsis, FolderOpen, LayoutDashboard, Settings } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildNavSections, getNavItemDestination, type NavItem } from '@/lib/nav-config'

interface MobileBottomNavProps {
  modulos: string[]
  podeGerenciarUsuarios: boolean
  projectName?: string
  temProjeto?: boolean
  brandColor: string
}

function itemIsActive(item: NavItem, pathname: string): boolean {
  if (item.path === '/dashboard') return pathname === item.path
  if (pathname === item.path || pathname.startsWith(`${item.path}/`)) return true
  return item.children?.some((child) => itemIsActive(child, pathname)) ?? false
}

function mobileLabel(item: NavItem): string {
  if (item.path === '/dashboard/people') return 'Efetivo'
  if (item.path === '/dashboard/seguranca/dashboard') return 'Segurança'
  if (item.path === '/dashboard/administracao') return 'Administração'
  return item.label
}

export default function MobileBottomNav({
  modulos,
  podeGerenciarUsuarios,
  projectName,
  temProjeto = true,
  brandColor,
}: MobileBottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const sections = useMemo(() => (temProjeto ? buildNavSections(modulos) : []), [modulos, temProjeto])

  const primaryItems = useMemo(() => {
    const items = sections.flatMap((section) => section.items)
    const preferred = ['/dashboard/planning', '/dashboard/people']
      .map((path) => items.find((item) => item.path === path))
      .filter((item): item is NavItem => !!item)

    const fallback = items.filter((item) => !preferred.some((current) => current.path === item.path))
    return preferred.length > 0 ? preferred.slice(0, 2) : fallback.slice(0, 2)
  }, [sections])

  const tabs: NavItem[] = [
    { icon: LayoutDashboard, label: 'Visão Geral', path: '/dashboard' },
    ...primaryItems,
  ]
  const hasActivePrimary = tabs.some((item) => itemIsActive(item, location.pathname))

  const goTo = (path: string) => {
    setMoreOpen(false)
    navigate(path)
  }

  return (
    <>
      <nav
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex h-14 max-w-lg items-stretch px-2">
          {tabs.map((item) => {
            const active = itemIsActive(item, location.pathname)
            const Icon = item.icon
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => goTo(getNavItemDestination(item))}
                className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition-colors"
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <span
                    className="absolute top-0 h-0.5 w-8 rounded-b-full"
                    style={{ backgroundColor: brandColor }}
                  />
                )}
                <span
                  className={`flex h-7 w-10 items-center justify-center rounded-xl transition-colors ${active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  style={active ? { backgroundColor: `${brandColor}18` } : undefined}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={`max-w-full truncate ${active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                  {mobileLabel(item)}
                </span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition-colors"
            aria-label="Abrir todos os módulos"
            aria-expanded={moreOpen}
          >
            {(!hasActivePrimary || moreOpen) && (
              <span
                className="absolute top-0 h-0.5 w-8 rounded-b-full"
                style={{ backgroundColor: brandColor }}
              />
            )}
            <span
              className={`flex h-7 w-10 items-center justify-center rounded-xl ${!hasActivePrimary || moreOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              style={!hasActivePrimary || moreOpen ? { backgroundColor: `${brandColor}18` } : undefined}
            >
              <Ellipsis size={20} />
            </span>
            <span className={!hasActivePrimary || moreOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>Mais</span>
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="mobile-nav-sheet inset-x-0 bottom-0 left-0 top-auto grid max-h-[82dvh] w-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-t-3xl border-x-0 border-b-0 p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:rounded-t-3xl">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          <DialogHeader className="border-b border-slate-200 px-5 pb-4 pt-3 text-left dark:border-slate-700">
            <DialogTitle>Navegação</DialogTitle>
            <DialogDescription className="truncate">{projectName ?? 'Escolha uma área do sistema'}</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto overscroll-contain px-4 py-4">
            <button
              type="button"
              onClick={() => goTo('/dashboard')}
              className={`mb-4 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${location.pathname === '/dashboard' ? 'bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}
              aria-current={location.pathname === '/dashboard' ? 'page' : undefined}
            >
              <LayoutDashboard size={19} />
              Visão Geral
            </button>

            <div className="space-y-5">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    {section.title}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const active = itemIsActive(item, location.pathname)
                      return (
                        <div key={item.path} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => goTo(getNavItemDestination(item))}
                            className={`flex min-h-12 w-full items-center gap-3 border-l-4 px-4 text-left text-sm font-semibold ${active ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'border-transparent text-slate-800 dark:text-slate-100'}`}
                            style={active ? { borderLeftColor: brandColor } : undefined}
                            aria-current={location.pathname === getNavItemDestination(item) ? 'page' : undefined}
                          >
                            <Icon size={19} />
                            <span className="flex-1">{item.label}</span>
                          </button>
                          {item.children && (
                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 dark:bg-slate-950/50">
                              {item.children.map((child) => {
                                const ChildIcon = child.icon
                                const childActive = itemIsActive(child, location.pathname)
                                return (
                                  <button
                                    key={child.path}
                                    type="button"
                                    onClick={() => goTo(child.path)}
                                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-xs font-medium ${childActive ? 'bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
                                    style={childActive ? { borderColor: brandColor } : undefined}
                                    aria-current={childActive ? 'page' : undefined}
                                  >
                                    <ChildIcon size={16} className="shrink-0" />
                                    <span>{child.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link
                to="/projects"
                onClick={() => setMoreOpen(false)}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                <FolderOpen size={18} />
                Meus Projetos
              </Link>
              {podeGerenciarUsuarios && (
                <Link
                  to="/dashboard/admin/users"
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  <Settings size={18} />
                  Sistema
                </Link>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
