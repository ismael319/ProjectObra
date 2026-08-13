import { useQuery } from '@tanstack/react-query'
import { fetchPublicoCurvaS } from '@/lib/apresentacao-db'

const SEMAFORO_HEX: Record<string, string> = { verde: '#22c55e', amarelo: '#f59e0b', vermelho: '#ef4444' }

export default function SlideCurvaS({ token, projetoId }: { token: string; projetoId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['apresentacao-publica-curva-s', token, projetoId],
    queryFn: () => fetchPublicoCurvaS(token, projetoId!),
    enabled: !!projetoId,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  if (!projetoId) return <SemProjeto />
  if (isLoading || !data) return null

  const fisico = data.avancoFisicoPct ?? 0
  const planejado = data.avancoPlanejadoPct ?? 0

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-gray-950 text-white">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: data.statusSemaforo ? SEMAFORO_HEX[data.statusSemaforo] : '#6b7280' }} />
        <h1 className="text-3xl font-bold">{data.nome}</h1>
      </div>
      <p className="text-white/50 mb-10">{data.cliente || '—'}</p>

      <div className="w-full max-w-2xl">
        <div className="flex items-end justify-between mb-2">
          <span className="text-white/60">Avanço físico</span>
          <span className="text-5xl font-extrabold tabular-nums">{fisico}%</span>
        </div>
        <div className="h-4 w-full bg-white/10 rounded-full relative overflow-hidden">
          <div className="h-4 rounded-full bg-blue-500" style={{ width: `${Math.min(Math.max(fisico, 0), 100)}%` }} />
          <div
            className="absolute top-0 h-4 w-1 bg-white"
            style={{ left: `${Math.min(Math.max(planejado, 0), 100)}%` }}
            title="Avanço planejado"
          />
        </div>
        <p className="mt-2 text-right text-white/50 text-sm">Planejado: {planejado}%</p>
      </div>
    </div>
  )
}

function SemProjeto() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-950 text-white/40">
      Slide sem projeto vinculado.
    </div>
  )
}
