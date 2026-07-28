import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

interface SessionOnlyRouteProps {
  children: React.ReactNode
}

// Exige apenas sessão autenticada, sem checar papel/status_solicitacao.
// Usado pela tela de aguardando aprovação, que precisa ser acessível mesmo
// para quem ainda não foi aprovado — o ProtectedRoute normal redirecionaria
// esses usuários de volta para cá, causando loop.
export default function SessionOnlyRoute({ children }: SessionOnlyRouteProps) {
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
