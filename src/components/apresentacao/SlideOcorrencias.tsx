import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { fetchPublicoOcorrencias } from '@/lib/apresentacao-db'

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function SlideOcorrencias({ token, projetoId }: { token: string; projetoId: string | null }) {
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['apresentacao-publica-ocorrencias', token, projetoId],
    queryFn: () => fetchPublicoOcorrencias(token, projetoId!),
    enabled: !!projetoId,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  if (!projetoId) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-950 text-white/40">Slide sem projeto vinculado.</div>
  }
  if (isLoading) return null

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="w-full h-full flex flex-col p-10 bg-gray-950 text-white overflow-hidden">
      <h1 className="text-3xl font-bold mb-8">Ocorrências em Aberto</h1>
      {registros.length === 0 ? (
        <p className="text-white/50 text-lg">Nenhuma ocorrência em aberto.</p>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto">
          {registros.map((r, i) => {
            const vencido = !!r.prazo && r.prazo < hoje
            return (
              <div key={i} className={`rounded-xl border p-4 ${vencido ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.local || '—'}</span>
                  {vencido && (
                    <span className="flex items-center gap-1 text-red-400 text-sm font-semibold">
                      <AlertTriangle size={14} /> Prazo vencido
                    </span>
                  )}
                </div>
                <p className="text-white/70 mt-1">{r.descricao}</p>
                <p className="text-white/40 text-xs mt-2">
                  Ocorrido em {formatData(r.dataOcorrido)}{r.prazo ? ` · Prazo: ${formatData(r.prazo)}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
