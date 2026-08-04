import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'

interface RequireModuloProps {
  modulo: string
  children: React.ReactNode
}

// Protege telas que só existem pra empresas com determinado módulo contratado
// (ex.: "engenharia", "seguranca") — quem libera é o Dono da Plataforma, em
// Empresas Clientes. Isso aqui é só a proteção "de vitrine" (esconde/evita a
// pessoa clicar); a proteção de verdade é a RESTRICTIVE POLICY no banco (ver
// supabase/migrations/modulos-plataforma-migration.sql), que bloqueia mesmo que alguém
// chame a API do Supabase diretamente.
export default function RequireModulo({ modulo, children }: RequireModuloProps) {
  const { userProfile } = useAuth()

  if (!userProfile?.modulos?.includes(modulo)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
