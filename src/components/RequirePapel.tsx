import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'

interface RequirePapelProps {
  // Papéis que podem acessar a rota. O Dono da Plataforma (is_super_admin)
  // sempre passa — ele gerencia qualquer empresa pelo /admin, e a rota
  // /dashboard/admin/users é uma entrada alternativa pra quem também tem o
  // papel de edição da própria empresa.
  papeis: string[]
  children: React.ReactNode
}

// Gate de papel no nível de rota — complementa o RequireModulo (módulo) e a
// checagem interna de cada página. Proteção real continua sendo a RLS no banco.
export default function RequirePapel({ papeis, children }: RequirePapelProps) {
  const { userProfile } = useAuth()

  if (!userProfile?.is_super_admin && !(userProfile?.papel && papeis.includes(userProfile.papel))) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
