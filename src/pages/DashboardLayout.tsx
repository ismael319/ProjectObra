import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import ChatWidget from '@/components/ChatWidget'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { DashboardNavigation } from '@/components/layout/DashboardNavigation'
import { usePresentationMode } from '@/lib/presentation-mode'
import { useTheme } from '@/lib/theme-context'
import { useProjects } from '@/lib/project-store'
import { useProject } from '@/lib/project-context'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useMediaQuery } from '@/lib/use-media-query'

export default function DashboardLayout() {
  const { presentationMode } = usePresentationMode()
  const { isDark, toggle, brandColor } = useTheme()
  const isMobile = useMediaQuery('(max-width: 639px)')
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
  const [pendingCount, setPendingCount] = useState(0)

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

  const headerProps = {
    isInsercaoPontual,
    projectName: currentProject?.nome,
    activeCount,
    totalCount,
    podeGerenciarUsuarios,
    pendingCount,
    userEmail: user?.email,
    userInitials,
    brandColor,
    isDark,
    onOpenMenu: () => setMobileMenuOpen(true),
    onNavigate: navigate,
    onToggleTheme: toggle,
    onSignOut: () => { signOut(); navigate('/login') },
  }

  const navigationProps = {
    collapsed: sidebarCollapsed,
    onToggle: () => setSidebarCollapsed(!sidebarCollapsed),
    mobileOpen: mobileMenuOpen,
    onMobileClose: () => setMobileMenuOpen(false),
    papel: userProfile?.papel ?? undefined,
    modulos: userProfile?.modulos,
    podeGerenciarUsuarios,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <DashboardHeader {...headerProps} variant={isMobile ? 'mobile' : 'desktop'} />

      {/* Sidebar abaixo do header — escondida em modo apresentação (ex.: Gantt
          Livre) pra sobrar tela inteira pro conteúdo durante uma reunião. */}
      {!presentationMode && (
        <DashboardNavigation {...navigationProps} />
      )}

      {/* Conteúdo principal */}
      <main className={`min-w-0 pt-16 transition-all duration-300 ${presentationMode ? '' : sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <div className="min-w-0 p-4 sm:p-6">
          <Outlet />
        </div>
      </main>

      <ChatWidget />
    </div>
  )
}
