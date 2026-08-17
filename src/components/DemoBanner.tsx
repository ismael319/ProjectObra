import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export function DemoBanner() {
  const { userProfile } = useAuth()

  if (!userProfile?.is_demo) return null

  return (
    <section
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-100"
    >
      <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">Você está numa conta demo</p>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Os dados desta obra são temporários e somem em algumas horas.{' '}
          <Link to="/signup" className="font-medium underline underline-offset-2">
            Criar conta de verdade
          </Link>
        </p>
      </div>
    </section>
  )
}
