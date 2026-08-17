import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import ChatWidget from '@/components/ChatWidget'
import { DemoBanner } from '@/components/DemoBanner'
import { OfflineBanner } from '@/components/OfflineBanner'
import { PwaInstallBanner } from '@/components/PwaInstallBanner'
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { DashboardNavigation } from '@/components/layout/DashboardNavigation'
import { usePresentationMode } from '@/lib/presentation-mode'
import { useTheme } from '@/lib/theme-context'
import { useChatbotPreference } from '@/lib/chatbot-preference-context'
import { useProjects } from '@/lib/project-store'
import { useProject } from '@/lib/project-context'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useMediaQuery } from '@/lib/use-media-query'
import { getDashboardRouteTitle } from '@/lib/nav-config'
import { usePendenciasValidacao, useMeusRejeitados } from '@/lib/validacao/validacao-db'

export default function DashboardLayout() {
  const { presentationMode } = usePresentationMode()
  const { isDark, toggle, brandColor } = useTheme()
  const { chatbotEnabled, toggleChatbot } = useChatbotPreference()
  const isMobile = useMediaQuery('(max-width: 639px)')
  const { currentProject, isLoadingProjects, isHydratingCurrentProject } = useProjects()
  const { setProject, setMultipleProjects, project } = useProject()
  const { user, signOut, userProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isInsercaoPontual = userProfile?.papel === 'insercao_pontual'
  // Papel efetivo no módulo "sistema" (override, se existir, senão o global) —
  // controla quem vê o link "Sistema" e o selo de pendências.
  const { podeEditar: podeGerenciarUsuarios } = usePapelModulo('sistema')
  const podeAcessarSistema = !!userProfile?.modulos?.includes('sistema') && podeGerenciarUsuarios
  // Mesmo critério de RequirePortfolio (gate da rota) — só repete aqui pra
  // decidir se mostra o link no menu; a rota já se protege sozinha.
  const podeVerPortfolio = !!userProfile?.is_super_admin || (userProfile?.escopo_projetos === 'todos' && !isInsercaoPontual)
  const podeConfigurarApresentacao = userProfile?.papel === 'edicao' || !!userProfile?.is_super_admin
  // Telas de gerência que olham TODOS os projetos de uma vez (Portfólio,
  // configurar/rodar Apresentação da empresa) não fazem sentido atrás do
  // "abra um projeto primeiro" — sobretudo Apresentação, que o gerente na
  // matriz precisa alcançar direto de "Meus Projetos" (ver ProjectSelection),
  // sem escolher uma obra qualquer só pra passar por aqui.
  const rotaSemProjetoObrigatorio = ['/dashboard/apresentacao', '/dashboard/portfolio'].some((p) =>
    location.pathname.startsWith(p),
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncedProjectKey, setSyncedProjectKey] = useState<string | null>(null)
  const projectSyncKey = currentProject
    ? `${currentProject.id}:${(currentProject.cronogramas || []).map((cronograma) => `${cronograma.id}:${cronograma.versao}:${cronograma.ativo}:${cronograma.dataUpload}`).join('|')}`
    : null

  useEffect(() => {
    if (!podeAcessarSistema) return

    supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status_solicitacao', 'pendente')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [podeAcessarSistema])

  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false)
  }, [isMobile])

  const { data: validacoesPendentes = [] } = usePendenciasValidacao()
  const { data: meusRejeitados = [] } = useMeusRejeitados()
  const totalConferir = validacoesPendentes.reduce((soma, p) => soma + p.total, 0)
  const totalValidacoes = totalConferir + meusRejeitados.length

  const nomePerfil = userProfile?.nome || user?.user_metadata?.nome
  const userInitials = nomePerfil
    ? nomePerfil.slice(0, 2).toUpperCase()
    : user?.email
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
      setSyncedProjectKey(null)
      if (!rotaSemProjetoObrigatorio) navigate('/projects')
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
      setSyncedProjectKey(projectSyncKey)
      return
    }

    if (dadosAtivos.length === 1) {
      if (!project || project !== dadosAtivos[0]) {
        setProject(dadosAtivos[0])
      }
    } else {
      setMultipleProjects(dadosAtivos)
    }
    setSyncedProjectKey(projectSyncKey)
  }, [currentProject, isInsercaoPontual, isLoadingProjects, isHydratingCurrentProject, projectSyncKey])

  if (!isInsercaoPontual && (isLoadingProjects || isHydratingCurrentProject || (currentProject && syncedProjectKey !== projectSyncKey))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!isInsercaoPontual && !currentProject && !rotaSemProjetoObrigatorio) return null

  const activeCount = currentProject ? (currentProject.cronogramas || []).filter((c) => c.ativo).length : 0
  const totalCount = currentProject ? (currentProject.cronogramas || []).length : 0
  const pageTitle = getDashboardRouteTitle(location.pathname)
  // Portfólio e a própria tela de configurar Apresentação são visões que
  // olham várias/todas as obras de uma vez — a navegação do dashboard
  // (sidebar/bottom-nav) é "de dentro de uma obra" e não faz sentido aqui.
  const escondeNavegacao = presentationMode || rotaSemProjetoObrigatorio
  const hasMobileBottomNav = isMobile && !escondeNavegacao && !isInsercaoPontual

  const headerProps = {
    pageTitle,
    isInsercaoPontual,
    projectName: currentProject?.nome,
    activeCount,
    totalCount,
    podeGerenciarUsuarios: podeAcessarSistema,
    pendingCount,
    totalValidacoes,
    meusRejeitados: meusRejeitados.length,
    userName: userProfile?.nome ?? user?.user_metadata?.nome,
    userEmail: user?.email,
    userInitials,
    brandColor,
    isDark,
    chatbotEnabled,
    onOpenMenu: () => setMobileMenuOpen(true),
    onNavigate: navigate,
    onToggleTheme: toggle,
    onToggleChatbot: toggleChatbot,
    onSignOut: () => { signOut(); navigate('/login') },
  }

  const navigationProps = {
    variant: isMobile ? 'mobile' as const : 'desktop' as const,
    collapsed: sidebarCollapsed,
    onToggle: () => setSidebarCollapsed(!sidebarCollapsed),
    mobileOpen: mobileMenuOpen,
    onMobileClose: () => setMobileMenuOpen(false),
    papel: userProfile?.papel ?? undefined,
    modulos: userProfile?.modulos,
    podeGerenciarUsuarios: podeAcessarSistema,
    podeVerPortfolio,
    podeConfigurarApresentacao,
    projectName: currentProject?.nome,
    // Módulos da sidebar (Engenharia, Qualidade, Segurança...) são navegação
    // DENTRO de uma obra — sem projeto selecionado (Portfólio, Apresentação
    // "de todas as obras") eles não fazem sentido e escondem.
    temProjeto: !!currentProject,
    brandColor,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <DashboardHeader {...headerProps} variant={isMobile ? 'mobile' : 'desktop'} />

      {/* Sidebar abaixo do header — escondida em modo apresentação (ex.: Gantt
          Livre) e na própria tela de configurar Apresentação, pra sobrar tela
          inteira pro conteúdo. */}
      {!escondeNavegacao && (
        <DashboardNavigation {...navigationProps} />
      )}

      {/* Conteúdo principal */}
      <main className={`dashboard-app-content min-w-0 pt-14 transition-all duration-300 sm:pt-16 ${isMobile ? 'mobile-app-content' : ''} ${escondeNavegacao ? '' : sidebarCollapsed ? 'lg:ml-[calc(4rem+env(safe-area-inset-left,0px))]' : 'lg:ml-[calc(16rem+env(safe-area-inset-left,0px))]'}`}>
        <div className={`dashboard-content-inner min-w-0 p-4 sm:p-6 ${hasMobileBottomNav ? 'mobile-content-with-nav' : ''}`}>
          <DemoBanner />
          <OfflineBanner />
          <PwaUpdateBanner />
          <PwaInstallBanner />
          <Outlet />
        </div>
      </main>

      {chatbotEnabled && <ChatWidget isMobile={isMobile} hasMobileNavigation={hasMobileBottomNav} />}
    </div>
  )
}
