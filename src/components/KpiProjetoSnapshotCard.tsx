import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ProjetoKpiSnapshot {
  projeto_id: string
  data_snapshot: string
  avanco_fisico_pct: number | null
  avanco_planejado_pct: number | null
  desvio_pct: number | null
  ppc_ultima_semana: number | null
  restricoes_abertas: number | null
  efetivo_atual: number | null
  ocorrencias_abertas: number | null
  ocorrencias_criticas: number | null
  status_semaforo: 'verde' | 'amarelo' | 'vermelho' | null
}

const SEMAFORO_COR: Record<string, string> = {
  verde: 'bg-emerald-500',
  amarelo: 'bg-amber-500',
  vermelho: 'bg-red-500',
}

function useSnapshotProjeto(projetoId: string | undefined) {
  return useQuery({
    queryKey: ['vw_projeto_kpis', projetoId],
    enabled: !!projetoId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_projeto_kpis')
        .select('*')
        .eq('projeto_id', projetoId!)
        .order('data_snapshot', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      return (data?.[0] ?? null) as ProjetoKpiSnapshot | null
    },
  })
}

function Stat({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${cor ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  )
}

export default function KpiProjetoSnapshotCard({ projetoId }: { projetoId: string | undefined }) {
  const { data: snapshot, isLoading } = useSnapshotProjeto(projetoId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <Loader2 size={18} className="animate-spin text-gray-300" />
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-gray-700 dark:bg-gray-800">
        <AlertTriangle size={16} className="text-gray-300" />
        <p className="text-xs text-gray-400 dark:text-gray-500">Ainda sem snapshot deste projeto — o cálculo roda a cada 5 min.</p>
      </div>
    )
  }

  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`)

  return (
    <div className="h-full space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${SEMAFORO_COR[snapshot.status_semaforo ?? ''] ?? 'bg-gray-300'}`} />
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Snapshot do projeto</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Avanço real" value={pct(snapshot.avanco_fisico_pct)} />
        <Stat label="Avanço planejado" value={pct(snapshot.avanco_planejado_pct)} />
        <Stat
          label="Desvio"
          value={snapshot.desvio_pct === null ? '—' : `${snapshot.desvio_pct > 0 ? '+' : ''}${snapshot.desvio_pct.toFixed(1)} pp`}
          cor={snapshot.desvio_pct !== null && snapshot.desvio_pct < 0 ? 'text-red-600 dark:text-red-400' : undefined}
        />
        <Stat label="PPC última semana" value={pct(snapshot.ppc_ultima_semana)} />
        <Stat label="Restrições abertas" value={String(snapshot.restricoes_abertas ?? 0)} />
        <Stat label="Efetivo atual" value={String(snapshot.efetivo_atual ?? 0)} />
        <Stat
          label="Ocorrências abertas"
          value={String(snapshot.ocorrencias_abertas ?? 0)}
          cor={snapshot.ocorrencias_criticas ? 'text-red-600 dark:text-red-400' : undefined}
        />
        <Stat label="Críticas" value={String(snapshot.ocorrencias_criticas ?? 0)} />
      </div>
    </div>
  )
}
