import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { CloudRain, AlertTriangle, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getActivitiesInDateRange } from '@/lib/programacao-db'
import { computeIndicators } from '@/lib/adherence'

interface Props {
  openOccurrencesCount: number
}

const RAIN_WINDOW_DAYS = 30
const PPC_WINDOW_DAYS = 21

export function SCurveRootCauseCards({ openOccurrencesCount }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: rainDays = 0 } = useQuery({
    queryKey: ['scurve-root-cause', 'chuva', today],
    queryFn: async () => {
      const start = format(subDays(new Date(), RAIN_WINDOW_DAYS), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('mapa_chuvas')
        .select('data,status')
        .gte('data', start)
        .lte('data', today)
        .in('status', ['parcial', 'constante'])
      if (error) throw error
      return (data ?? []).length
    },
  })

  const { data: ppc } = useQuery({
    queryKey: ['scurve-root-cause', 'ppc', today],
    queryFn: async () => {
      const start = format(subDays(new Date(), PPC_WINDOW_DAYS), 'yyyy-MM-dd')
      const activities = await getActivitiesInDateRange(start, today)
      return computeIndicators(activities)
    },
  })

  const plannedTotal = ppc ? ppc.total - ppc.extras : 0

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Causa-raiz · Últimos {RAIN_WINDOW_DAYS} dias
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <CloudRain size={14} className="text-sky-500" /> Chuva ({RAIN_WINDOW_DAYS}D)
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{rainDays} {rainDays === 1 ? 'dia' : 'dias'}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {rainDays === 0 ? 'Sem registros' : 'Com impacto de chuva'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <AlertTriangle size={14} className="text-amber-500" /> Ocorrências abertas
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{openOccurrencesCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{openOccurrencesCount === 0 ? '0 no total' : 'no total'}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <Target size={14} className="text-red-500" /> PPC ({PPC_WINDOW_DAYS}D)
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {ppc ? `${Math.round(ppc.ppc * 100)}%` : '—'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {ppc ? `${ppc.concluidas}/${plannedTotal} concluídos · ${ppc.pendentes} pendentes` : 'Sem dados'}
          </p>
        </div>
      </div>
    </div>
  )
}
