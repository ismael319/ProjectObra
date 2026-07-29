import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import OrganizacoesManagement from '@/pages/admin/OrganizacoesManagement'

// Tela de administração da plataforma — fora do /dashboard de propósito: o
// /dashboard exige um projeto selecionado (ver DashboardLayout), e um Dono da
// Plataforma que só quer liberar módulo/gerenciar empresa não tem por que
// escolher um projeto antes. Ver Home.tsx (o card "Administração da
// Plataforma" leva pra cá).
//
// A gestão de usuários (pendentes/histórico/convidar) não é mais uma aba
// separada — ela só fazia sentido pra própria empresa do Dono (a RLS de
// UserApprovalManagement é escopada por organização), então virou parte do
// "Gerenciar" de cada empresa em OrganizacoesManagement, onde o Dono já
// escolhe qual empresa está mexendo.
export default function PlatformAdmin() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Administração da Plataforma</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{user?.email}</span>
            <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-red-600 transition">
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 py-8">
        <OrganizacoesManagement />
      </div>
    </div>
  )
}
