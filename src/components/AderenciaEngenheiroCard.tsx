import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { getWeek } from '@/lib/programacao-db'
import { computeSegment, type SegmentRow } from '@/lib/adherence'
import { getISOWeekYearAndNumber } from '@/lib/iso-week'
import PainelAderencia from '@/components/programacao/PainelAderencia'

// Mesmo cálculo (computeSegment sobre o campo "foreman") e mesmo componente
// de exibição (PainelAderencia) já usados em "Aderência por Engenheiro" na
// tela de Programação Semanal — aqui só busca a semana ISO atual em vez de
// deixar a pessoa escolher, porque o dashboard não tem seletor de semana.
export default function AderenciaEngenheiroCard({ projetoId }: { projetoId: string | undefined }) {
  const { userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id
  const [rows, setRows] = useState<SegmentRow[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!organizacaoId || !projetoId) return
    let cancelado = false
    setRows(null)
    setErro(false)
    const { year, week } = getISOWeekYearAndNumber(new Date())
    getWeek(organizacaoId, projetoId, year, week)
      .then((weekData) => {
        if (cancelado) return
        setRows(computeSegment(weekData.activities, 'foreman', weekData.partialWeight))
      })
      .catch(() => {
        if (!cancelado) setErro(true)
      })
    return () => {
      cancelado = true
    }
  }, [organizacaoId, projetoId])

  if (erro) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white p-4 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
        Não foi possível carregar a Programação Semanal deste projeto.
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <Loader2 size={18} className="animate-spin text-gray-300" />
      </div>
    )
  }

  return <PainelAderencia title="Aderência por Engenheiro (semana atual)" rows={rows} />
}
