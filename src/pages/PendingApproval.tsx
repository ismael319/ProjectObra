import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, XCircle, LogOut, RefreshCw, Lock, FileCheck, Shield } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export default function PendingApproval() {
  const { userProfile, isLoadingProfile, user, signOut, refetchProfile } = useAuth()
  const navigate = useNavigate()
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    if (userProfile?.status_solicitacao === 'aprovado') {
      navigate('/', { replace: true })
    }
  }, [userProfile?.status_solicitacao, navigate])

  const handleCheckAgain = async () => {
    setIsChecking(true)
    await refetchProfile()
    setIsChecking(false)
  }

  const isRejected = userProfile?.status_solicitacao === 'rejeitado'

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl mb-4 shadow-lg shadow-blue-950/50 ring-1 ring-white/10">
            <span className="text-xl font-extrabold text-white tracking-tight">PE</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ProjectEng</h1>
          <p className="text-blue-200/60 text-sm mt-1">Plataforma Corporativa</p>
        </div>

        <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 p-8 text-center">
          {isRejected ? (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
                <XCircle className="text-red-500" size={28} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Solicitação recusada</h2>
              <p className="text-gray-500 text-sm mt-2">
                Seu pedido de acesso para <span className="font-medium">{user?.email}</span> foi recusado.
                Entre em contato com um administrador do sistema se acredita que isso é um engano.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-50 rounded-full mb-4">
                <Clock className="text-blue-600" size={28} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Aguardando aprovação</h2>
              <p className="text-gray-500 text-sm mt-2">
                Sua conta <span className="font-medium">{user?.email}</span> foi criada com sucesso. Um gestor
                precisa definir seu perfil de acesso antes que você possa entrar no sistema.
              </p>
            </>
          )}

          <div className="flex flex-col gap-3 mt-6">
            {!isRejected && (
              <button
                onClick={handleCheckAgain}
                disabled={isChecking || isLoadingProfile}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition"
              >
                <RefreshCw size={18} className={isChecking ? 'animate-spin' : ''} />
                Verificar novamente
              </button>
            )}
            <button
              onClick={() => { signOut(); navigate('/login') }}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-4 rounded-lg transition"
            >
              <LogOut size={18} />
              Sair da conta
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-blue-200/40 text-xs mb-3">© 2026 ProjectEng · Planejamento e Controle</p>
          <div className="flex items-center justify-center gap-4 text-blue-200/50 text-xs">
            <span className="flex items-center gap-1">
              <Lock size={12} />
              Criptografado
            </span>
            <span className="flex items-center gap-1">
              <FileCheck size={12} />
              LGPD
            </span>
            <span className="flex items-center gap-1">
              <Shield size={12} />
              SSL/TLS
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
