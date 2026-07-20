import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Shield, Lock, FileCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setError('')
    setIsLoading(true)
    const { error } = await signIn(data.email, data.password)
    setIsLoading(false)
    if (error) {
      setError('Email ou senha incorretos')
    } else {
      navigate('/projects')
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-blue-600/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-[32rem] h-[32rem] bg-indigo-600/20 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl mb-4 shadow-lg shadow-blue-950/50 ring-1 ring-white/10">
            <span className="text-xl font-extrabold text-white tracking-tight">PE</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ProjectEng</h1>
          <p className="text-blue-200/60 text-sm mt-1">Plataforma Corporativa</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Bem-vindo!</h2>
            <p className="text-gray-500 text-sm mt-1">Gerenciamento de Projetos</p>
          </div>

          {/* Toggle Entrar/Criar Conta */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <Link
              to="/login"
              className="flex-1 py-2 text-sm font-semibold rounded-md bg-white shadow-sm text-gray-900 text-center transition"
            >
              Entrar
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 text-center transition"
            >
              Criar conta
            </Link>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Senha
                </label>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700">
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-12 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                    errors.password ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg shadow-md shadow-blue-600/25 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-px active:translate-y-0 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar no sistema'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/signup" className="text-sm text-gray-500 hover:text-gray-700">
              Conhecer aplicativo →
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
