import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { fetchPublicoProducaoHoje } from '@/lib/apresentacao-db'
import { buildRelatorioVisual } from '@/lib/relatorio-visual'
import type { ActivityLike, ActivityStatus } from '@/lib/adherence'

// Não reaproveita CardRelatorioVisual (o card de exportar PNG) de propósito:
// aquele componente é fundo claro, largura fixa 600px, pensado pra virar
// imagem — errado pro contexto de TV (fundo escuro, tela cheia). Reaproveita
// só o cálculo (buildRelatorioVisual), que é a parte que importa não duplicar.
export default function SlideProducaoVisual({ token, projetoId }: { token: string; projetoId: string | null }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['apresentacao-publica-producao-hoje', token, projetoId],
    queryFn: () => fetchPublicoProducaoHoje(token, projetoId!),
    enabled: !!projetoId,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  if (!projetoId) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-950 text-white/40">Slide sem projeto vinculado.</div>
  }
  if (isLoading) return null

  const activities: ActivityLike[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    discipline: null,
    area: r.area,
    stage: r.stage,
    foreman: r.foreman,
    planned_date: r.planned_date,
    planned_pct: 100,
    status: r.status as ActivityStatus,
    is_extra: r.is_extra,
    observation: null,
    inativa: r.inativa,
    foraDoPlano: r.fora_do_plano,
  }))

  const relatorio = buildRelatorioVisual(activities)

  return (
    <div className="w-full h-full flex flex-col p-10 bg-gray-950 text-white overflow-hidden">
      <div className="flex items-end justify-between mb-8">
        <h1 className="text-3xl font-bold">Produção de Hoje</h1>
        {relatorio.aderenciaPct != null && (
          <span className="text-2xl font-bold tabular-nums text-white/70">
            {relatorio.aderenciaPct}% <span className="text-sm text-white/40 font-normal">({relatorio.concluidas}/{relatorio.totalPlanejadas})</span>
          </span>
        )}
      </div>

      {relatorio.totalAtividades === 0 ? (
        <p className="text-white/50 text-lg">Nenhuma atividade programada para hoje.</p>
      ) : (
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 overflow-y-auto">
          {relatorio.areas.map((area) => (
            <div key={area.nome} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-semibold text-white/80 mb-2">{area.nome}</h2>
              <ul className="space-y-1.5">
                {area.itens.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    {item.status === 'concluida' ? (
                      <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    ) : item.status === 'nao_concluida' ? (
                      <XCircle size={14} className="text-red-400 shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0" />
                    )}
                    <span className="truncate">{item.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
