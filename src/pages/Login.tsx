import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Shield, Lock, FileCheck, ArrowRight, PlayCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { ProductTour } from '@/components/ProductTour'
import TurnstileWidget from '@/components/TurnstileWidget'
import fgiLogo from '@/assets/fgi-logo.png'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setError('')
    setIsLoading(true)

    // Verifica rate limit antes de tentar login
    const { data: rateLimitOk } = await supabase
      .rpc('verificar_rate_limit_login', { p_ip: '' })
    if (rateLimitOk === false) {
      setIsLoading(false)
      setError('Muitas tentativas de login. Aguarde 15 minutos.')
      return
    }

    if (!turnstileToken) {
      setError('Complete a verificação de segurança')
      return
    }

    const { error } = await signIn(data.email, data.password, turnstileToken)
    setIsLoading(false)

    if (error) {
      void supabase.rpc('registrar_evento_seguranca', {
        p_event_type: 'login_failed',
        p_severity: 'warning',
        p_email: data.email,
        p_ip: '',
      })
      setError(error.toLowerCase().includes('captcha')
        ? 'A verificação de segurança expirou. Faça-a novamente.'
        : 'Email ou senha incorretos')
    } else {
      void supabase.rpc('registrar_evento_seguranca', {
        p_event_type: 'login_success',
        p_severity: 'info',
        p_email: data.email,
        p_ip: '',
      })
      navigate('/')
    }
  }

  const onTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token)
  }, [])

  const onTurnstileExpire = useCallback(() => {
    setTurnstileToken('')
  }, [])

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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 p-2.5 shadow-lg shadow-blue-950/50 ring-1 ring-white/10">
            <img src={fgiLogo} alt="SIGA SOLUÇÕES" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SIGA SOLUÇÕES</h1>
          <p className="text-blue-200/60 text-sm mt-1">Plataforma Corporativa</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Bem-vindo!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Gerenciamento de Projetos</p>
          </div>

          {/* Toggle Entrar/Criar Conta */}
          <div className="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-1 mb-6">
            <Link
              to="/login"
              className="flex-1 py-2 text-sm font-semibold rounded-md bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white text-center transition"
            >
              Entrar
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-2 text-sm font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-center transition"
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                placeholder="seu@email.com"
                className={`w-full px-4 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.email ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  className={`w-full px-4 py-3 pr-12 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                    errors.password ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div className="py-2">
              <TurnstileWidget onVerify={onTurnstileVerify} onExpire={onTurnstileExpire} />
            </div>

            <button
              type="submit"
              disabled={isLoading || !turnstileToken}
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

          <div className="mt-6">
            <button
              onClick={() => setTourOpen(true)}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold text-sm py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition"
            >
              <PlayCircle size={17} />
              Conhecer aplicativo
            </button>
          </div>
        </div>

        {/* CTA de planos */}
        <div className="mt-6 text-center">
          <Link
            to="/planos"
            className="inline-flex items-center gap-2 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-sm py-2.5 px-6 rounded-full shadow-md shadow-blue-600/25 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-px transition-all"
          >
            Assine já
            <ArrowRight size={16} />
          </Link>
        </div>

        <ProductTour open={tourOpen} onOpenChange={setTourOpen} />

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-blue-200/40 text-xs mb-3">© 2026 SIGA SOLUÇÕES · Planejamento e Controle</p>
          <div className="flex items-center justify-center gap-4 text-blue-200/50 text-xs mb-3">
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
          <div className="flex items-center justify-center gap-3 text-blue-300/40 text-xs">
            <Link to="/legal/privacy" className="hover:text-blue-300/70 transition">Privacidade</Link>
            <span>·</span>
            <Link to="/legal/terms" className="hover:text-blue-300/70 transition">Termos</Link>
            <span>·</span>
            <Link to="/legal/dpa" className="hover:text-blue-300/70 transition">DPA</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
