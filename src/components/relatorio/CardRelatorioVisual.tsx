import { forwardRef } from 'react'
import type { RelatorioVisual } from '@/lib/relatorio-visual'

interface Props {
  codigo: string
  nomeProjeto: string
  gestor?: string
  tipo: string
  dataLabel: string
  emitidoAs: string
  relatorio: RelatorioVisual
}

// Imagem compartilhável (capturada via html2canvas em ProgramacaoVisual.tsx) que
// substitui o texto corrido mandado hoje pro WhatsApp com o fechamento/programação
// do dia. Largura fixa (não responsiva) — é pensada pra virar PNG, não pra tela.
const CardRelatorioVisual = forwardRef<HTMLDivElement, Props>(function CardRelatorioVisual(
  { codigo, nomeProjeto, gestor, tipo, dataLabel, emitidoAs, relatorio },
  ref,
) {
  const { areas, concluidas, naoConcluidas, aderenciaPct, totalAtividades } = relatorio

  return (
    <div ref={ref} className="w-[600px] bg-[#f3efe9] p-6 space-y-4 font-sans">
      <div className="rounded-2xl bg-[#0f1b3d] text-white px-6 py-5">
        <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
          {codigo} · {nomeProjeto}
          {gestor ? ` · Gestor: ${gestor.toUpperCase()}` : ''}
        </p>
        <h1 className="text-2xl font-bold mt-1">{tipo}</h1>
        <p className="text-sm text-white/70 mt-1">
          {dataLabel} · Emitido às {emitidoAs}
        </p>
      </div>

      {totalAtividades === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500">
          Nenhuma atividade programada para este período.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Concluídas" value={String(concluidas)} tone="emerald" />
            <StatBox label="Não concluídas" value={String(naoConcluidas)} tone="red" />
            <StatBox label="Aderência" value={aderenciaPct != null ? `${aderenciaPct}%` : '—'} tone="neutral" />
          </div>

          <div className="space-y-4">
            {areas.map((area) => (
              <div key={area.nome} className="rounded-2xl bg-white p-5">
                <h2 className="font-bold text-[#0f1b3d] mb-2">{area.nome}</h2>
                <div className="divide-y divide-gray-100">
                  {area.itens.map((item) => {
                    const s = statusVisual(item)
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2">
                        <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${s.bg} ${s.color}`}>
                          {s.symbol}
                        </span>
                        <span className="text-sm text-gray-800 flex-1">
                          {item.nome}
                          {item.isExtra && <span className="text-gray-400 font-normal"> (extra)</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-[11px] text-gray-400 pt-1">
        ProjectObra · gerado automaticamente a partir da programação diária
      </p>
    </div>
  )
})

export default CardRelatorioVisual

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'neutral' }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    neutral: 'text-[#0f1b3d]',
  }
  return (
    <div className="rounded-2xl bg-white py-4 text-center">
      <p className={`text-2xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function statusVisual(item: { status: string; isExtra: boolean }): { symbol: string; bg: string; color: string } {
  if (item.isExtra) return { symbol: '+', bg: 'bg-amber-100', color: 'text-amber-600' }
  switch (item.status) {
    case 'concluida':
      return { symbol: '✓', bg: 'bg-emerald-100', color: 'text-emerald-600' }
    case 'nao_concluida':
      return { symbol: '✗', bg: 'bg-red-100', color: 'text-red-600' }
    case 'parcial':
      return { symbol: '~', bg: 'bg-amber-100', color: 'text-amber-600' }
    default:
      return { symbol: '·', bg: 'bg-gray-100', color: 'text-gray-400' }
  }
}
