import { forwardRef } from 'react'
import type { RelatorioVisual } from '@/lib/relatorio-visual'
import RelatorioHeader from './RelatorioHeader'
import StatBox from './StatBox'
import { COR } from './paleta'

interface Props {
  codigo: string
  nomeProjeto: string
  gestor?: string
  tipo: string
  dataLabel: string
  emitidoAs: string
  relatorio: RelatorioVisual
}

// Imagem compartilhável (capturada via html2canvas) que substitui o texto corrido
// mandado hoje pro WhatsApp com o fechamento/programação do dia. Largura fixa (não
// responsiva) — é pensada pra virar PNG, não pra tela. Cores em style inline de
// propósito (ver paleta.ts) — html2canvas não sabe interpretar oklch(), que é como o
// Tailwind v4 resolve as classes de cor nomeadas (bg-emerald-100 etc.).
const CardRelatorioVisual = forwardRef<HTMLDivElement, Props>(function CardRelatorioVisual(
  { codigo, nomeProjeto, gestor, tipo, dataLabel, emitidoAs, relatorio },
  ref,
) {
  const { areas, concluidas, naoConcluidas, aderenciaPct, totalAtividades } = relatorio

  return (
    <div ref={ref} className="w-[600px] p-6 space-y-4 font-sans" style={{ backgroundColor: COR.bg, color: COR.gray900 }}>
      <RelatorioHeader
        codigo={codigo}
        nomeProjeto={nomeProjeto}
        gestor={gestor}
        tipo={tipo}
        dataLabel={`${dataLabel} · Emitido às ${emitidoAs}`}
      />

      {totalAtividades === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: COR.white, color: COR.gray500 }}>
          Nenhuma atividade programada para este período.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Concluídas" value={String(concluidas)} color={COR.emerald700} />
            <StatBox label="Não concluídas" value={String(naoConcluidas)} color={COR.red700} />
            <StatBox label="Aderência" value={aderenciaPct != null ? `${aderenciaPct}%` : '—'} color={COR.navy} />
          </div>

          <div className="space-y-4">
            {areas.map((area) => (
              <div key={area.nome} className="rounded-2xl p-5" style={{ backgroundColor: COR.white }}>
                <h2 className="font-bold mb-2" style={{ color: COR.navy }}>{area.nome}</h2>
                <div>
                  {area.itens.map((item, i) => {
                    const s = statusVisual(item)
                    return (
                      <div
                        key={item.id}
                        className="py-2"
                        style={i > 0 ? { borderTop: `1px solid ${COR.gray100}` } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: s.bg, color: s.color }}
                          >
                            {s.symbol}
                          </span>
                          <span className="text-sm flex-1" style={{ color: COR.gray800 }}>
                            {item.nome}
                            {item.isExtra && <span style={{ color: COR.gray400, fontWeight: 400 }}> (extra)</span>}
                          </span>
                        </div>
                        {item.subetapas.length > 0 && (
                          <div className="ml-8 mt-1 space-y-0.5">
                            {item.subetapas.map((sub, si) => (
                              <div key={si} className="flex items-center gap-2 text-xs" style={{ color: COR.gray500 }}>
                                <span
                                  className="w-3.5 h-3.5 shrink-0 rounded-full flex items-center justify-center font-bold"
                                  style={
                                    sub.concluida
                                      ? { backgroundColor: COR.emerald100, color: COR.emerald600, fontSize: '9px' }
                                      : { backgroundColor: COR.gray100, color: COR.gray400, fontSize: '9px' }
                                  }
                                >
                                  {sub.concluida ? '✓' : '·'}
                                </span>
                                <span>{sub.nome}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-[11px] pt-1" style={{ color: COR.gray400 }}>
        ProjectObra · gerado automaticamente a partir da programação diária
      </p>
    </div>
  )
})

export default CardRelatorioVisual

function statusVisual(item: { status: string; isExtra: boolean }): { symbol: string; bg: string; color: string } {
  if (item.isExtra) return { symbol: '+', bg: COR.amber100, color: COR.amber600 }
  switch (item.status) {
    case 'concluida':
      return { symbol: '✓', bg: COR.emerald100, color: COR.emerald600 }
    case 'nao_concluida':
      return { symbol: '✗', bg: COR.red100, color: COR.red600 }
    case 'parcial':
      return { symbol: '~', bg: COR.amber100, color: COR.amber600 }
    default:
      return { symbol: '·', bg: COR.gray100, color: COR.gray400 }
  }
}
