import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ArrowLeft, Shield, Lock, FileCheck, Mail } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const forgotSchema = z.object({
  email: z.string().email('Email inválido'),
})

type ForgotFormData = z.infer<typeof forgotSchema>

export default function ForgotPassword() {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { resetPassword } = useAuth()

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (data: ForgotFormData) => {
    setError('')
    setSuccess('')
    setIsLoading(true)
    const { error } = await resetPassword(data.email)
    setIsLoading(false)
    if (error) {
      setError('Erro ao enviar email. Tente novamente.')
    } else {
      setSuccess('Email de recuperação enviado! Verifique sua caixa de entrada.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-xl font-bold text-white">PE</span>
          </div>
          <h1 className="text-2xl font-bold text-white">ProjectEng</h1>
          <p className="text-blue-200/60 text-sm mt-1">Plataforma Corporativa</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
              <Mail className="text-blue-600" size={24} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Esqueceu a senha?</h2>
            <p className="text-gray-500 text-sm mt-1">
              Digite seu email e enviaremos um link para redefinir sua senha
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                placeholder="seu@email.com"
                className={`w-full px-4 py-3 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.email ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={16} />
              Voltar para o login
            </Link>
          </div>
        </div>

        {/* Footer */}
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
