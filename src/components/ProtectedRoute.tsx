import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

// Usuários com papel "insercao_pontual" (apontadores) só têm acesso à tela de lançamento.
const LANCAMENTO_HOME = '/dashboard/people/lancamento'

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, isLoading, userProfile, isLoadingProfile } = useAuth()
  const location = useLocation()

  if (isLoading || (session && isLoadingProfile)) {
    sessionStorage.setItem('redirect_after_login', location.pathname + location.search)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Perfil ausente (erro ao buscar) ou solicitação ainda não aprovada:
  // nunca libera acesso ao app, só à tela de aguardando aprovação.
  if (!userProfile || userProfile.status_solicitacao !== 'aprovado') {
    return <Navigate to="/aguardando-aprovacao" replace />
  }

  // Usuário precisa aceitar os termos de uso e política de privacidade
  if (!userProfile.termos_aceitos_em && location.pathname !== '/aceitar-termos') {
    return <Navigate to="/aceitar-termos" replace />
  }

  // O papel "insercao_pontual" só existe na tela de lançamento, que ainda não
  // é isolada por empresa (ver RequireModulo) — então essa regra só vale pra
  // empresa piloto, senão vira loop de redirecionamento.
  // O check extra de módulo evita outro loop: se esse usuário não tem o módulo
  // "engenharia" liberado (restrição por usuário via user_modulos_visiveis),
  // o RequireModulo da rota de lançamento o jogaria de volta pra /dashboard —
  // que o redirect abaixo mandaria de novo pra lançamento, infinitamente.
  if (
    userProfile.papel === 'insercao_pontual' &&
    userProfile.organizacao_piloto &&
    userProfile.modulos.includes('engenharia') &&
    location.pathname !== LANCAMENTO_HOME
  ) {
    return <Navigate to={LANCAMENTO_HOME} replace />
  }

  return <>{children}</>
}
