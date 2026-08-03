import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2, Shield, Building2, User, Archive } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface ExportData {
  exportado_em: string
  perfil: Record<string, unknown>
  organizacao: Record<string, unknown> | null
  modulos: Record<string, unknown>[] | null
}

export default function ExportarDados() {
  const [isExporting, setIsExporting] = useState(false)
  const { user, userProfile } = useAuth()

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const { data, error } = await supabase.rpc('exportar_meus_dados')
      if (error) throw error

      const exportData: ExportData = data as ExportData
      const jsonStr = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fgidecision-dados-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Dados exportados com sucesso!')
    } catch (err) {
      toast.error('Erro ao exportar dados. Tente novamente.')
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 dark:bg-gray-950">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exportar Dados</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Baixe todos os seus dados pessoais armazenados na plataforma
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Seus dados</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
              <User size={18} className="text-blue-500" />
              <span>Perfil do usuário (nome, email, cargo, permissões)</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
              <Building2 size={18} className="text-blue-500" />
              <span>Dados da organização (empresa, módulos contratados)</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
              <Archive size={18} className="text-blue-500" />
              <span>Registros de acesso e auditoria</span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Seus dados estão protegidos
              </p>
              <p className="text-xs text-amber-700 mt-1">
                O download contém apenas seus dados pessoais cadastrais. Dados de obras e
                relatórios inseridos por sua organização devem ser exportados através das
                funcionalidades nativas em cada projeto.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
        >
          {isExporting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download size={20} />
              Baixar meus dados (JSON)
            </>
          )}
        </button>
      </div>
    </div>
  )
}
