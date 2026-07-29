import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import fgiLogo from '@/assets/fgi-logo.png'

export default function AceitarTermos() {
  const [aceitou, setAceitou] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { aceitarTermos } = useAuth()
  const navigate = useNavigate()

  const handleAccept = async () => {
    setIsSubmitting(true)
    await aceitarTermos()
    setIsSubmitting(false)
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 p-2.5 shadow-lg">
            <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">FGI Decision</h1>
          <p className="text-blue-200/60 text-sm mt-1">Aceite dos Termos de Uso</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <Shield className="text-blue-600" size={24} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Atualização em nossos Termos</h2>
              <p className="text-sm text-gray-500">
                Precisamos do seu consentimento para continuar utilizando a plataforma
              </p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-gray-600 mb-6">
            <p>
              Para estar em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>,
              atualizamos nossa Política de Privacidade e Termos de Uso.
            </p>
            <p className="mt-3">
              Pedimos que leia atentamente os documentos abaixo antes de prosseguir:
            </p>
            <ul className="mt-2 space-y-2">
              <li>
                <Link to="/legal/privacy" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Política de Privacidade
                </Link>
                {' '}— saiba como tratamos seus dados pessoais
              </li>
              <li>
                <Link to="/legal/terms" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Termos de Uso
                </Link>
                {' '}— condições de uso da plataforma
              </li>
              <li>
                <Link to="/legal/dpa" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Acordo de Tratamento de Dados (DPA)
                </Link>
                {' '}— responsabilidades como Operador vs Controlador
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">
                Li e aceito a Política de Privacidade e os Termos de Uso
              </span>
              <p className="text-xs text-gray-500 mt-1">
                Ao aceitar, você declara estar ciente de como seus dados serão tratados
              </p>
            </div>
          </label>

          <button
            onClick={handleAccept}
            disabled={!aceitou || isSubmitting}
            className="w-full mt-6 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              'Aguarde...'
            ) : (
              <>
                Aceitar e continuar
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-blue-200/40 text-xs">
            © 2026 FGI Decision · Planejamento e Controle
          </p>
        </div>
      </div>
    </div>
  )
}
