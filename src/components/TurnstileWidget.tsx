import { useEffect, useRef, useState } from 'react'
import { Shield } from 'lucide-react'

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string
        callback: (token: string) => void
        'expired-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export default function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Carrega o script do Turnstile se ainda não estiver carregado
    if (!document.querySelector('script[src*="turnstile"]')) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => setLoaded(true)
      document.body.appendChild(script)
    } else {
      setLoaded(true)
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!loaded || !containerRef.current || widgetIdRef.current) return

    // Turnstile pode já ter renderizado o widget se o script carregou via
    // api.js automático — espera um tick pra garantir que o container existe
    const timer = setTimeout(() => {
      if (containerRef.current && window.turnstile) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
          callback: onVerify,
          'expired-callback': onExpire,
          theme: 'auto',
        })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [loaded, onVerify, onExpire])

  return (
    <div className="flex items-center justify-center">
      <div ref={containerRef} className="cf-turnstile" />
      {!loaded && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Shield size={14} />
          Carregando verificação de segurança...
        </div>
      )}
    </div>
  )
}
