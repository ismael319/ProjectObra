import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

// Rota pública (/demo/:id) — fora de ProtectedRoute/DashboardLayout de
// propósito, igual a /apresentacao/:token (ver ApresentacaoPublica.tsx): o
// id da URL só vira acesso de verdade através de resgatar_acesso_demo, uma
// RPC SECURITY DEFINER que revalida o link (existe, não revogado, não
// expirado) — nenhuma tabela real tem GRANT direto pro visitante.
export default function AcessoDemo() {
  const { id } = useParams<{ id: string }>()
  const { redeemDemoAccess } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const attempted = useRef(false)

  useEffect(() => {
    if (!id || attempted.current) return
    attempted.current = true

    redeemDemoAccess(id).then(({ error }) => {
      if (error) {
        setError('Não foi possível entrar na conta demo.')
        setErrorDetail(error)
      } else {
        navigate('/', { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-sm text-center space-y-3">
          <ShieldAlert className="mx-auto text-amber-500" size={40} />
          <p className="text-gray-700 dark:text-gray-200 font-medium">{error}</p>
          {/* Detalhe técnico visível de propósito (rota nova, sem telemetria
              ainda) — evita repetir o susto de descobrir só pelo console que
              a causa real era outra (ex.: sign-in anônimo desligado no
              projeto) e não o link em si. */}
          {errorDetail && <p className="text-xs text-gray-400 dark:text-gray-500">{errorDetail}</p>}
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700">
            Ir para o login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  )
}
