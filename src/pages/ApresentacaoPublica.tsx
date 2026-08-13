import { useParams } from 'react-router-dom'
import PresentationPlayer from '@/components/apresentacao/PresentationPlayer'

// Rota pública (/apresentacao/:token) — fora de ProtectedRoute/DashboardLayout
// de propósito: nunca carrega sessão, então não tem como mostrar um botão de
// edição por engano. Único ponto de entrada de dado é o token na URL; tudo
// que ele busca passa por RPC SECURITY DEFINER que revalida o token (ver
// migration da Fase D) — nenhuma tabela real tem GRANT para o papel anon.
export default function ApresentacaoPublica() {
  const { token } = useParams<{ token: string }>()

  if (!token) return null

  return <PresentationPlayer token={token} />
}
