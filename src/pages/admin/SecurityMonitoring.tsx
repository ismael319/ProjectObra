import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, Info, Eye, RefreshCw, Ban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface SecurityAlert {
  id: string
  event_type: string
  severity: string
  email: string | null
  ip: string | null
  descricao: string
  metadata: Record<string, unknown>
  created_at: string
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
  warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
}

const severityIcons: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
}

export default function SecurityMonitoring() {
  const { userProfile } = useAuth()
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const fetchAlerts = async () => {
    setLoading(true)
    let query = supabase
      .from('security_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') {
      query = query.eq('severity', filter)
    }

    const { data } = await query
    setAlerts((data ?? []) as SecurityAlert[])
    setLoading(false)
  }

  useEffect(() => {
    if (userProfile?.is_super_admin) fetchAlerts()
  }, [userProfile?.is_super_admin, filter])

  if (!userProfile?.is_super_admin) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">Acesso restrito a administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitoramento de Segurança</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Eventos de segurança e atividades suspeitas</p>
        </div>
        <button
          onClick={fetchAlerts}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(['all', 'critical', 'warning', 'info'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : f === 'warning' ? 'Alertas' : 'Info'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Shield size={48} className="mx-auto text-green-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Nenhum evento de segurança encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const SeverityIcon = severityIcons[alert.severity] || Info
            return (
              <div
                key={alert.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${severityColors[alert.severity] || 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="flex items-start gap-3">
                  <SeverityIcon size={20} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{alert.descricao}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800' :
                        alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800' :
                        'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800'
                      }`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {alert.email && <span>Email: {alert.email}</span>}
                      {alert.ip && <span>IP: {alert.ip}</span>}
                      <span>{new Date(alert.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
