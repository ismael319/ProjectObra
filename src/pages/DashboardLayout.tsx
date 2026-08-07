import { useEffect, useState, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, Sun, Moon, FolderOpen, User, LogOut, ChevronDown, Menu, Loader2, FileText } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import fgiLogo from '@/assets/fgi-logo.png'
import ChatWidget from '@/components/ChatWidget'
import { usePresentationMode } from '@/lib/presentation-mode'
import { useTheme } from '@/lib/theme-context'
import { useProjects } from '@/lib/project-store'
import { useProject } from '@/lib/project-context'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

export default function DashboardLayout() {
  const { presentationMode } = usePresentationMode()
  const { isDark, toggle, brandColor } = useTheme()
  const { currentProject, isLoadingProjects, isHydratingCurrentProject } = useProjects()
  const { setProject, setMultipleProjects, project } = useProject()
  const { user, signOut, userProfile } = useAuth()
  const navigate = useNavigate()
  const isInsercaoPontual = userProfile?.papel === 'insercao_pontual'
  // Papel efetivo no módulo "sistema" (override, se existir, senão o global) —
  // controla quem vê o link "Sistema" e o selo de pendências.
  const { podeEditar: podeGerenciarUsuarios } = usePapelModulo('sistema')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!podeGerenciarUsuarios) return

    supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status_solicitacao', 'pendente')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [podeGerenciarUsuarios])

  const userInitials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'U'

  useEffect(() => {
    // Apontadores (papel "insercao_pontual") não navegam pela seleção de projetos/cronogramas —
    // vão direto para a tela de lançamento, que não depende disso.
    if (isInsercaoPontual) return

    // Ao recarregar a página, currentProject começa null até a lista de
    // projetos ser buscada de novo (isLoadingProjects) e o projeto salvo ser
    // restaurado (isHydratingCurrentProject) — sem esperar os dois, esse
    // efeito mandava pra /projects logo no primeiro render, ainda antes da
    // busca terminar, e o usuário "perdia o lugar" onde estava a cada F5.
    if (isLoadingProjects || isHydratingCurrentProject) return

    if (!currentProject) {
      navigate('/projects')
      return
    }

    const cronogramas = currentProject.cronogramas || []
    const activeCronos = cronogramas.filter((c) => c.ativo)
    const dadosAtivos = activeCronos.map((c) => c.dados).filter(Boolean)

    if (dadosAtivos.length === 0) {
      const fallback = cronogramas[0]?.dados
      if (fallback && (!project || project !== fallback)) {
        setProject(fallback)
      }
      return
    }

    if (dadosAtivos.length === 1) {
      if (!project || project !== dadosAtivos[0]) {
        setProject(dadosAtivos[0])
      }
    } else {
      setMultipleProjects(dadosAtivos)
    }
  }, [currentProject, isInsercaoPontual, isLoadingProjects, isHydratingCurrentProject])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen])

  if (!isInsercaoPontual && (isLoadingProjects || isHydratingCurrentProject)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!isInsercaoPontual && !currentProject) return null

  const activeCount = currentProject ? (currentProject.cronogramas || []).filter((c) => c.ativo).length : 0
  const totalCount = currentProject ? (currentProject.cronogramas || []).length : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header fixo - largura total */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-white/10 shadow-[0_1px_0_0_rgba(0,0,0,0.4)] px-4 sm:px-6 z-40">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg bg-white p-1 shrink-0">
              <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:block h-6 w-px bg-white/10" />
            {!isInsercaoPontual && (
              <>
                <button
                  onClick={() => navigate('/projects')}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
                >
                  <FolderOpen size={18} />
                  <span className="hidden md:inline">Meus Projetos</span>
                </button>
                <div className="h-6 w-px bg-white/10 shrink-0" />
              </>
            )}
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white truncate">
                {isInsercaoPontual ? 'Lançamento de Efetivo' : currentProject?.nome}
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
                onClick={() => navigate('/dashboard/admin/users')}
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
                className="flex items-center gap-2 p-1 pr-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-white/15"
                  style={{ backgroundColor: brandColor }}
                >
                  {userInitials}
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-black/5 border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    {!isInsercaoPontual && (
                      <button
                        onClick={() => { navigate('/profile'); setUserMenuOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <User size={16} />
                        Meu Perfil
                      </button>
                    )}
                    <button
                      onClick={toggle}
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
                      onClick={() => { signOut(); navigate('/login') }}
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

      {/* Sidebar abaixo do header — escondida em modo apresentação (ex.: Gantt
          Livre) pra sobrar tela inteira pro conteúdo durante uma reunião. */}
      {!presentationMode && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
          papel={userProfile?.papel ?? undefined}
          modulos={userProfile?.modulos}
          podeGerenciarUsuarios={podeGerenciarUsuarios}
        />
      )}

      {/* Conteúdo principal */}
      <main className={`pt-16 transition-all duration-300 ${presentationMode ? '' : sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>

      <ChatWidget />
    </div>
  )
}
