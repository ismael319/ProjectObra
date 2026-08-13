import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'

// Gate de rota do Dashboard Macro/Portfólio: só quem enxerga TODOS os
// projetos da empresa (escopo_projetos = 'todos' — gerente/diretor/dono, na
// terminologia do pedido original) e não é insercao_pontual (papel de campo,
// sem leitura agregada) chega na tela. Mesmo padrão de RequirePapel — gate
// de UI; a proteção de verdade é a RLS de vw_projeto_kpis via projetos.
export default function RequirePortfolio({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()

  const podeVer =
    userProfile?.is_super_admin ||
    (userProfile?.escopo_projetos === 'todos' && userProfile?.papel !== 'insercao_pontual')

  if (!podeVer) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
