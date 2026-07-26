import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'

interface RequireOrganizacaoPilotoProps {
  children: React.ReactNode
}

// Protege telas que ainda NÃO têm isolamento por empresa no banco de dados
// (Gantt Livre, Apontamento/EAP, Programação semanal, Mapa de Chuvas, RDR).
// Isso aqui é só uma proteção "de vitrine" (esconde/evita a pessoa clicar);
// a proteção de verdade é a RESTRICTIVE POLICY no banco (ver
// src/lib/multi-tenant-fase1-migration.sql, passo 10), que bloqueia mesmo
// que alguém chame a API do Supabase diretamente.
export default function RequireOrganizacaoPiloto({ children }: RequireOrganizacaoPilotoProps) {
  const { userProfile } = useAuth()

  if (!userProfile?.organizacao_piloto) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
