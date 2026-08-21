import { Navigate } from 'react-router-dom'
import { useModulosDaObra } from '@/lib/projeto-modulos'

interface RequireModuloProps {
  modulo: string
  children: React.ReactNode
}

// Protege telas que só existem pra empresas com determinado módulo contratado
// (ex.: "engenharia", "seguranca") — quem libera é o Dono da Plataforma, em
// Empresas Clientes, também por obra (ver src/lib/projeto-modulos.ts). Isso
// aqui é só a proteção "de vitrine" (esconde/evita a pessoa clicar); a
// proteção de verdade contra a empresa (não por obra) é a RESTRICTIVE POLICY
// no banco (ver supabase/migrations/modulos-plataforma-migration.sql), que
// bloqueia mesmo que alguém chame a API do Supabase diretamente.
export default function RequireModulo({ modulo, children }: RequireModuloProps) {
  const modulos = useModulosDaObra()

  if (!modulos.includes(modulo)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
