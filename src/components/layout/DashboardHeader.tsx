import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, FileText, FolderOpen, LogOut, Menu, Moon, Sun, User } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

export interface DashboardHeaderProps {
  variant: 'mobile' | 'desktop'
  isInsercaoPontual: boolean
  projectName?: string
  activeCount: number
  totalCount: number
  podeGerenciarUsuarios: boolean
  pendingCount: number
  userEmail?: string
  userInitials: string
  brandColor: string
  isDark: boolean
  onOpenMenu: () => void
  onNavigate: (path: string) => void
  onToggleTheme: () => void
  onSignOut: () => void
}

export function DashboardHeader({
  variant,
  isInsercaoPontual,
  projectName,
  activeCount,
  totalCount,
  podeGerenciarUsuarios,
  pendingCount,
  userEmail,
  userInitials,
  brandColor,
  isDark,
  onOpenMenu,
  onNavigate,
  onToggleTheme,
  onSignOut,
}: DashboardHeaderProps) {
  const isMobile = variant === 'mobile'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  return (
    <header className={`fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-white/10 shadow-[0_1px_0_0_rgba(0,0,0,0.4)] z-40 ${isMobile ? 'px-4' : 'px-6'}`}>
      <div className="flex items-center justify-between h-full">
        <div className={`flex items-center min-w-0 ${isMobile ? 'gap-3' : 'gap-4'}`}>
          <button
            onClick={onOpenMenu}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

          {!isMobile && (
            <>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white p-1 shrink-0">
                <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
              </div>
              <div className="h-6 w-px bg-white/10" />
            </>
          )}

          {!isInsercaoPontual && !isMobile && (
            <>
              <button
                onClick={() => onNavigate('/projects')}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <FolderOpen size={18} />
                <span className="hidden md:inline">Meus Projetos</span>
              </button>
              <div className="h-6 w-px shrink-0 bg-white/10" />
            </>
          )}

          <div className="min-w-0">
            <h1 className="text-base font-bold text-white truncate">
              {isInsercaoPontual ? 'Lançamento de Efetivo' : projectName}
            </h1>
            {!isInsercaoPontual && totalCount > 1 && (
              <span className="inline-block text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded-full">
                {activeCount}/{totalCount} cronogramas
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {podeGerenciarUsuarios && (
            <button
              onClick={() => onNavigate('/dashboard/admin/users')}
              className="relative p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Solicitações de acesso pendentes"
            >
              <Bell size={19} />
              {pendingCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full ring-2 ring-slate-900">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          )}

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full p-1 transition-colors hover:bg-white/5 ${isMobile ? '' : 'pr-2'}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-white/15"
                style={{ backgroundColor: brandColor }}
              >
                {userInitials}
              </div>
              {!isMobile && (
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-black/5 border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{userEmail}</p>
                </div>
                <div className="py-1">
                  {!isInsercaoPontual && (
                    <button
                      onClick={() => { onNavigate('/profile'); setUserMenuOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <User size={16} />
                      Meu Perfil
                    </button>
                  )}
                  <button
                    onClick={onToggleTheme}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isDark ? <Sun size={16} /> : <Moon size={16} />}
                    {isDark ? 'Modo Claro' : 'Modo Escuro'}
                  </button>
                  <button
                    onClick={() => { window.open('/legal/privacy', '_blank'); setUserMenuOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <FileText size={16} />
                    Privacidade e Termos
                  </button>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-700 py-1">
                  <button
                    onClick={onSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={16} />
                    Sair da Conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
