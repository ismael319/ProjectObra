import { useQuery } from '@tanstack/react-query'
import { fetchPublicoKpis } from '@/lib/apresentacao-db'

const SEMAFORO_HEX: Record<string, string> = { verde: '#22c55e', amarelo: '#f59e0b', vermelho: '#ef4444' }

export default function SlideDashboardMacro({ token }: { token: string }) {
  const { data: projetos = [], isLoading } = useQuery({
    queryKey: ['apresentacao-publica-kpis', token],
    queryFn: () => fetchPublicoKpis(token),
    refetchOnMount: 'always',
    staleTime: 0,
  })

  if (isLoading) return null

  return (
    <div className="w-full h-full flex flex-col p-10 bg-gray-950 text-white overflow-hidden">
      <h1 className="text-3xl font-bold mb-8">Portfólio de Projetos</h1>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
        {projetos.map((p) => (
          <div key={p.projetoId} className="rounded-2xl bg-white/5 border border-white/10 p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">{p.nome}</h2>
                <p className="text-sm text-white/50">{p.cliente || '—'}</p>
              </div>
              <span
                className="w-4 h-4 rounded-full shrink-0 mt-1"
                style={{ backgroundColor: p.statusSemaforo ? SEMAFORO_HEX[p.statusSemaforo] : '#6b7280' }}
              />
            </div>
            {p.avancoFisicoPct != null ? (
              <>
                <div className="mt-4 flex items-baseline justify-between text-sm text-white/60">
                  <span>Físico: <strong className="text-white text-lg">{p.avancoFisicoPct}%</strong></span>
                  <span>Planejado: {p.avancoPlanejadoPct}%</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{p.ppcUltimaSemana}%</p>
                    <p className="text-[11px] text-white/40">PPC</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{p.efetivoAtual}</p>
                    <p className="text-[11px] text-white/40">Efetivo</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold tabular-nums ${(p.ocorrenciasCriticas ?? 0) > 0 ? 'text-red-400' : ''}`}>{p.ocorrenciasAbertas}</p>
                    <p className="text-[11px] text-white/40">Ocorrências</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-white/40">Ainda sem indicadores calculados.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
