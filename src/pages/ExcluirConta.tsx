import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, ArrowLeft, Shield, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Link } from 'react-router-dom'

export default function ExcluirConta() {
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleRequestDeletion = async () => {
    if (confirmText !== 'EXCLUIR') return

    setIsDeleting(true)
    try {
      const { error } = await supabase.rpc('solicitar_exclusao_conta', {
        motivo: 'Solicitação do usuário via painel de privacidade',
      })
      if (error) throw error

      toast.success('Solicitação de exclusão registrada. Seus dados serão removidos em até 30 dias.')
      await signOut()
      navigate('/login')
    } catch (err) {
      toast.error('Erro ao solicitar exclusão. Tente novamente.')
      console.error(err)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 dark:bg-gray-950">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Excluir Conta</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Solicite a remoção definitiva dos seus dados da plataforma
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Antes de prosseguir</h2>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">•</span>
              <span>Você tem <strong>30 dias</strong> para exportar seus dados após esta solicitação</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">•</span>
              <span>Após esse prazo, a exclusão será <strong>definitiva e irreversível</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">•</span>
              <span>
                Faça o download dos seus dados antes de prosseguir em{' '}
                <Link to="/dashboard/config/dados" className="text-blue-600 hover:underline">Exportar Dados</Link>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">•</span>
              <span>Logs de acesso serão mantidos por 180 dias (exigência legal)</span>
            </li>
          </ul>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Esta ação não pode ser desfeita após 30 dias
              </p>
              <p className="text-xs text-red-700 mt-1">
                Durante o período de carência de 30 dias, você pode cancelar a solicitação
                entrando em contato com o suporte. Após a confirmação, todos os seus dados
                serão permanentemente removidos.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-700 mb-4">Confirmar exclusão</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Digite <strong className="text-red-700">EXCLUIR</strong> para confirmar que deseja remover sua conta:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite EXCLUIR"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
          />
          <button
            onClick={handleRequestDeletion}
            disabled={confirmText !== 'EXCLUIR' || isDeleting}
            className="w-full bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-red-400 disabled:to-red-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <AlertTriangle size={20} />
                Solicitar exclusão da conta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
