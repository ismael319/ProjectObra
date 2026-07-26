import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

// Usuários com papel "campo" (apontadores) só têm acesso à tela de lançamento.
const CAMPO_HOME = '/dashboard/people/lancamento'

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, isLoading, userProfile, isLoadingProfile } = useAuth()
  const location = useLocation()

  if (isLoading || (session && isLoadingProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (userProfile?.papel === 'campo' && location.pathname !== CAMPO_HOME) {
    return <Navigate to={CAMPO_HOME} replace />
  }

  return <>{children}</>
}
