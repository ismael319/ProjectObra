import Sidebar from '@/components/Sidebar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import type { PapelUsuario } from '@/lib/auth-context'

interface NavigationProps {
  variant: 'mobile' | 'desktop'
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  papel?: PapelUsuario
  modulos?: string[]
  podeGerenciarUsuarios: boolean
  podeVerPortfolio?: boolean
  podeConfigurarApresentacao?: boolean
  projectName?: string
  temProjeto?: boolean
  brandColor: string
}

export function DashboardNavigation({
  variant,
  projectName,
  temProjeto = true,
  brandColor,
  ...sidebarProps
}: NavigationProps) {
  if (variant === 'mobile') {
    if (sidebarProps.papel === 'insercao_pontual') return null
    return (
      <MobileBottomNav
        modulos={sidebarProps.modulos ?? []}
        podeGerenciarUsuarios={sidebarProps.podeGerenciarUsuarios}
        projectName={projectName}
        temProjeto={temProjeto}
        brandColor={brandColor}
      />
    )
  }

  return <Sidebar {...sidebarProps} temProjeto={temProjeto} />
}
