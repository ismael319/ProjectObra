import Sidebar from '@/components/Sidebar'
import type { PapelUsuario } from '@/lib/auth-context'

interface NavigationProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  papel?: PapelUsuario
  modulos?: string[]
  podeGerenciarUsuarios: boolean
}

// Mantém uma única instância da navegação nesta fase. A barra mobile entrará
// aqui na Fase 2 sem alterar o Outlet nem a árvore das páginas.
export function DashboardNavigation(props: NavigationProps) {
  return <Sidebar {...props} />
}
