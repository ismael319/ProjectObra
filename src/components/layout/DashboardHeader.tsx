import { useEffect, useRef, useState } from 'react'
import { Bell, Building2, ChevronDown, CreditCard, FileText, FolderOpen, LogOut, Menu, MessageCircle, Moon, ShieldCheck, Sun, User } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

export interface OrganizacaoMembership {
  organizacao_id: string
  nome: string
  papel: string
  is_demo: boolean
  demo_expira_em: string | null
  is_piloto: boolean
}

export interface DashboardHeaderProps {
  variant: 'mobile' | 'desktop'
  pageTitle: string
  isInsercaoPontual: boolean
  projectName?: string
  activeCount: number
  totalCount: number
  podeGerenciarUsuarios: boolean
  pendingCount: number
  totalValidacoes: number
  meusRejeitados: number
  userName?: string
  userEmail?: string
  userInitials: string
  brandColor: string
  isDark: boolean
  chatbotEnabled: boolean
  organizacaoAtual?: string
  minhasOrganizacoes?: OrganizacaoMembership[]
  onOpenMenu: () => void
  onNavigate: (path: string) => void
  onToggleTheme: () => void
  onToggleChatbot: () => void
  onSignOut: () => void
  onTrocarOrganizacao?: (organizacaoId: string) => void
}

export function DashboardHeader({
  variant,
  pageTitle,
  isInsercaoPontual,
  projectName,
  activeCount,
  totalCount,
  podeGerenciarUsuarios,
  pendingCount,
  totalValidacoes,
  meusRejeitados,
  userName,
  userEmail,
  userInitials,
  brandColor,
  isDark,
  chatbotEnabled,
  organizacaoAtual,
  minhasOrganizacoes = [],
  onOpenMenu,
  onNavigate,
  onToggleTheme,
  onToggleChatbot,
  onSignOut,
  onTrocarOrganizacao,
}: DashboardHeaderProps) {
  const isMobile = variant === 'mobile'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const accountButtonRef = useRef<HTMLButtonElement>(null)
  const orgMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setUserMenuOpen(false)
        accountButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [userMenuOpen])

  useEffect(() => {
    if (!orgMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setOrgMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOrgMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [orgMenuOpen])

  return (
    <header className={`dashboard-app-header fixed top-0 left-0 right-0 bg-slate-900 border-b border-white/10 shadow-[0_1px_0_0_rgba(0,0,0,0.4)] z-40 ${isMobile ? 'mobile-app-header h-14 px-3' : 'h-16 px-6'}`}>
      <div className="flex items-center justify-between h-full">
        <div className={`flex items-center min-w-0 ${isMobile ? 'gap-3' : 'gap-4'}`}>
          {isMobile ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1">
              <img src={fgiLogo} alt="FGI Decision" className="h-full w-full object-contain" />
            </div>
          ) : (
            <button
              onClick={onOpenMenu}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
          )}

          {!isMobile && (
            <>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white p-1 shrink-0">
                <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
              </div>
              <div className="h-6 w-px bg-white/10" />
            </>
          )}

          {!isInsercaoPontual && !isMobile && minhasOrganizacoes.length > 1 && (
            <div className="relative" ref={orgMenuRef}>
              <button
                onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Building2 size={16} />
                <span className="max-w-[140px] truncate">{organizacaoAtual ?? 'Empresa'}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {orgMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-black/5 border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trocar empresa</p>
                  </div>
                  <div className="py-1">
                    {minhasOrganizacoes.map((org) => (
                      <button
                        key={org.organizacao_id}
                        onClick={() => {
                          setOrgMenuOpen(false)
                          onTrocarOrganizacao?.(org.organizacao_id)
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          org.organizacao_id === minhasOrganizacoes.find((o) => o.nome === organizacaoAtual)?.organizacao_id
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Building2 size={16} className="shrink-0" />
                        <span className="flex-1 text-left truncate">{org.nome}</span>
                        {org.is_piloto && (
                          <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">PILOTO</span>
                        )}
                        {org.is_demo && (
                          <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">DEMO</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
            <h1 className={`${isMobile ? 'text-sm' : 'text-base'} truncate font-bold text-white`}>
              {isMobile ? pageTitle : isInsercaoPontual ? 'Lançamento de Efetivo' : projectName}
            </h1>
            {isMobile && projectName && !isInsercaoPontual && (
              <p className="truncate text-[10px] leading-tight text-slate-400">{projectName}</p>
            )}
            {!isMobile && !isInsercaoPontual && totalCount > 1 && (
              <span className="inline-block text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded-full">
                {activeCount}/{totalCount} cronogramas
              </span>
            )}
          </div>
        </div>

        <div className={`flex shrink-0 items-center ${isMobile ? 'gap-0.5' : 'gap-2'}`}>
          {totalValidacoes > 0 && (
            <button
              onClick={() => onNavigate('/dashboard/validacoes')}
              className={`relative rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white ${isMobile ? 'flex h-10 w-10 items-center justify-center' : 'p-2'}`}
              title={
                meusRejeitados > 0
                  ? `${meusRejeitados} lançamento(s) seu(s) voltaram para correção`
                  : 'Lançamentos aguardando sua conferência'
              }
            >
              <ShieldCheck size={19} />
              <span
                className={`absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white rounded-full ring-2 ring-slate-900 ${
                  meusRejeitados > 0 ? 'bg-red-500' : 'bg-amber-500'
                }`}
              >
                {totalValidacoes > 9 ? '9+' : totalValidacoes}
              </span>
            </button>
          )}

          {podeGerenciarUsuarios && (
            <button
              onClick={() => onNavigate('/dashboard/admin/users')}
              className={`relative rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white ${isMobile ? 'flex h-10 w-10 items-center justify-center' : 'p-2'}`}
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
              ref={accountButtonRef}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center justify-center gap-2 rounded-full p-1 transition-colors hover:bg-white/5 ${isMobile ? 'h-10 w-10' : 'min-h-11 min-w-11 pr-2'}`}
              aria-label="Abrir menu da conta"
              aria-expanded={userMenuOpen}
            >
              <div
                className={`${isMobile ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'} flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white/15`}
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
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{userName ?? userEmail}</p>
                  {userName && userEmail && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{userEmail}</p>
                  )}
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
                  {!isInsercaoPontual && (
                    <button
                      onClick={() => { onNavigate('/profile/plano'); setUserMenuOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <CreditCard size={16} />
                      Meu Plano
                    </button>
                  )}
                  <button
                    onClick={onToggleChatbot}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    role="switch"
                    aria-checked={chatbotEnabled}
                  >
                    <MessageCircle size={16} />
                    <span className="flex-1 text-left">Assistente Virtual</span>
                    <span
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        chatbotEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          chatbotEnabled ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </button>
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
