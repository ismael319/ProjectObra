import { Navigate, useNavigate } from 'react-router-dom'
import { FolderKanban, ShieldCheck, Loader2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

// Landing pós-login. Pra quem NÃO é Dono da Plataforma, cai direto em
// /projects (comportamento de sempre). Pra Dono da Plataforma, mostra 2
// caminhos: entrar num projeto normalmente, ou ir pra administração da
// plataforma (liberar módulos por empresa, gerenciar donos, e as próximas
// ferramentas administrativas que forem entrando).
export default function Home() {
  const { userProfile, isLoadingProfile } = useAuth()
  const navigate = useNavigate()

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  if (!userProfile?.is_super_admin) {
    return <Navigate to="/projects" replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pra onde vamos?</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Você é Dono da Plataforma — escolha um caminho.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <button
            onClick={() => navigate('/projects')}
            className="group text-left bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
              <FolderKanban className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              Meus Projetos
              <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition -translate-x-1 group-hover:translate-x-0" />
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Entre nas suas obras e cronogramas, como qualquer usuário.
            </p>
          </button>

          <button
            onClick={() => navigate('/admin')}
            className="group text-left bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-4">
              <ShieldCheck className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              Administração da Plataforma
              <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition -translate-x-1 group-hover:translate-x-0" />
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Empresas clientes, módulos liberados, outros Donos da Plataforma.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
