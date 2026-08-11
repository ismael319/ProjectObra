import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, User, Mail, Briefcase, Save, Palette, Download, Trash2, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'

const PRESET_COLORS = [
  { name: 'Azul', value: '#2563EB' },
  { name: 'Verde', value: '#16A34A' },
  { name: 'Vermelho', value: '#DC2626' },
  { name: 'Laranja', value: '#EA580C' },
  { name: 'Roxo', value: '#9333EA' },
  { name: 'Rosa', value: '#DB2777' },
  { name: 'Teal', value: '#0D9488' },
  { name: 'Indigo', value: '#4F46E5' },
]

export default function Profile() {
  const { user, userProfile, refetchProfile } = useAuth()
  const navigate = useNavigate()
  const { brandColor, setBrandColor } = useTheme()
  const [nome, setNome] = useState(userProfile?.nome ?? user?.user_metadata?.nome ?? user?.email?.split('@')[0] ?? '')
  const [funcao, setFuncao] = useState(userProfile?.funcao ?? '')
  const [saved, setSaved] = useState(false)
  const [savingFuncao, setSavingFuncao] = useState(false)
  const [savingNome, setSavingNome] = useState(false)
  const [customColor, setCustomColor] = useState(brandColor)

  const handleSave = () => {
    setBrandColor(customColor)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSalvarNome = async () => {
    if (!nome.trim()) {
      toast.error('Informe um nome')
      return
    }
    if (nome.trim() === (userProfile?.nome ?? '')) return
    setSavingNome(true)
    const { error } = await supabase.rpc('atualizar_meu_nome', { novo_nome: nome.trim() })
    if (error) {
      toast.error(`Não foi possível salvar o nome: ${error.message}`)
    } else {
      toast.success('Nome atualizado')
      await refetchProfile()
    }
    setSavingNome(false)
  }

  const handleSalvarFuncao = async () => {
    setSavingFuncao(true)
    const { error } = await supabase.rpc('atualizar_minha_funcao', { nova_funcao: funcao })
    if (error) {
      toast.error(`Não foi possível salvar a função: ${error.message}`)
    } else {
      toast.success('Função atualizada')
      await refetchProfile()
    }
    setSavingFuncao(false)
  }

  const handlePreset = (color: string) => {
    setCustomColor(color)
    setBrandColor(color)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meu Perfil</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ backgroundColor: customColor }}>
            {nome ? nome.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{nome}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
              Nome exibido nos registros (RDR), apontamentos e para quem gerencia sua empresa.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5">
                <User size={18} className="text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="bg-transparent border-none outline-none ml-2 text-sm text-gray-900 dark:text-white w-full"
                />
              </div>
              <button
                onClick={handleSalvarNome}
                disabled={savingNome || !nome.trim() || nome.trim() === (userProfile?.nome ?? '')}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition font-medium text-sm shrink-0"
              >
                {savingNome ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <div className="flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5">
              <Mail size={18} className="text-gray-400 dark:text-gray-500" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Função</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
              Descrição do seu cargo/perfil (ex.: Engenheiro Civil, Mestre de Obras) — só informativo, aparece
              pra quem gerencia sua empresa. Não muda o que você pode acessar no sistema.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5">
                <Briefcase size={18} className="text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Ex.: Engenheiro Civil"
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value)}
                  className="bg-transparent border-none outline-none ml-2 text-sm text-gray-900 dark:text-white w-full"
                />
              </div>
              <button
                onClick={handleSalvarFuncao}
                disabled={savingFuncao || funcao === (userProfile?.funcao ?? '')}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition font-medium text-sm shrink-0"
              >
                {savingFuncao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Palette size={20} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cores da Empresa</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Escolha a cor principal que será aplicada na barra lateral.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePreset(preset.value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition ${
                customColor === preset.value
                  ? 'border-gray-900 dark:border-white scale-105'
                  : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div
                className="w-10 h-10 rounded-full shadow-inner"
                style={{ backgroundColor: preset.value }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">{preset.name}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cor personalizada:</label>
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{customColor}</span>
        </div>

        <div className="pt-2">
          <div
            className="h-12 rounded-xl"
            style={{ backgroundColor: customColor }}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">Prévia da sidebar</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium text-sm"
          >
            <Save size={16} />
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium text-sm"
          >
            Voltar
          </button>
        </div>
      </div>

      {/* Privacidade e Dados */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Privacidade e Dados</h2>
        </div>
        <div className="space-y-3">
          <Link
            to="/profile/dados"
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition group"
          >
            <div className="flex items-center gap-3">
              <Download size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Exportar dados</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Baixe todos os seus dados pessoais</p>
              </div>
            </div>
            <ArrowLeft size={16} className="text-gray-400 dark:text-gray-500 rotate-180" />
          </Link>

          <Link
            to="/profile/excluir"
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition group"
          >
            <div className="flex items-center gap-3">
              <Trash2 size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-red-500 transition" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Excluir conta</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solicite a remoção dos seus dados</p>
              </div>
            </div>
            <ArrowLeft size={16} className="text-gray-400 dark:text-gray-500 rotate-180" />
          </Link>
        </div>
      </div>
    </div>
  )
}
