import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import fgiLogo from '@/assets/fgi-logo.png'

const FUNCOES = [
  'Engenheiro(a) Civil',
  'Engenheiro(a) de Produção',
  'Arquiteto(a)',
  'Técnico(a) de Edificações',
  'Técnico(a) de Segurança do Trabalho',
  'Coordenador(a) de Obras',
  'Gerente de Projetos',
  'Responsável Técnico(a)',
  'Estagiário(a)',
  'Auxiliar Administrativo',
]

export default function CompletarPerfil() {
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputFuncaoRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const { completarPerfil, userProfile } = useAuth()
  const navigate = useNavigate()

  const funcoesFiltradas = FUNCOES.filter((f) =>
    f.toLowerCase().includes(funcao.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const nomeInvalido = nome.trim().length < 3
  const funcaoInvalida = funcao.trim().length === 0
  const podeEnviar = !nomeInvalido && !funcaoInvalida && !isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!podeEnviar) return

    setIsSubmitting(true)
    setError('')
    const { error: submitError } = await completarPerfil(nome.trim(), funcao.trim())
    if (submitError) {
      setError('Erro ao salvar perfil. Tente novamente.')
      setIsSubmitting(false)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 p-2.5 shadow-lg">
            <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">FGI Decision</h1>
          <p className="text-blue-200/60 text-sm mt-1">Complete seu perfil para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
            <User className="text-blue-600" size={24} />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bem-vindo(a)!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-40">
                Precisamos de algumas informações para seu primeiro acesso
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome completo *
              </label>
              <input
                id="nome"
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400"
                autoFocus
              />
              {nome.length > 0 && nomeInvalido && (
                <p className="mt-1 text-xs text-red-500">Nome deve ter pelo menos 3 caracteres</p>
              )}
            </div>

            <div className="relative" ref={suggestionsRef}>
              <label htmlFor="funcao" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Função / Cargo *
              </label>
              <input
                ref={inputFuncaoRef}
                id="funcao"
                type="text"
                value={funcao}
                onChange={(e) => {
                  setFuncao(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Digite ou selecione sua função"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400"
                autoComplete="off"
              />
              {showSuggestions && funcao.trim().length > 0 && funcoesFiltradas.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {funcoesFiltradas.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onMouseDown={() => {
                        setFuncao(f)
                        setShowSuggestions(false)
                        inputFuncaoRef.current?.focus()
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors ${
                        funcao === f ? 'bg-blue-50 dark:bg-gray-600 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {userProfile?.is_super_admin && (
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                Essas informações ajudam a personalizar sua experiência na plataforma.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/30 p-3 rounded-lg">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!podeEnviar}
            className="w-full mt-6 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Salvando...
              </>
            ) : (
              <>
                Continuar
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-blue-200/40 text-xs">
            © 2026 FGI Decision · Planejamento e Controle
          </p>
        </div>
      </div>
    </div>
  )
}
