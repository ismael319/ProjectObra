import { forwardRef } from 'react'
import type { LinhaMatriz, MatrizSemanal } from '@/lib/relatorio-visual'
import type { ActivityStatus } from '@/lib/adherence'
import type { WBSActivity } from '@/lib/xml-parser'
import { WEEKDAY_LABELS } from '@/lib/iso-week'
import RelatorioHeader from './RelatorioHeader'
import StatBox from './StatBox'
import { COR } from './paleta'

interface Props {
  codigo: string
  nomeProjeto: string
  gestor?: string
  dataLabel: string
  matriz: MatrizSemanal
  /** Resolve a tarefa da linha pro cronograma de origem (início/término reais) —
   * undefined quando não há cronograma carregado pra resolver contra. Extras
   * manuais e importações antigas sem taskUid também não resolvem (retorna null). */
  getDetalhe?: (linha: LinhaMatriz) => WBSActivity | null
}

function formatDataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Imagem compartilhável (capturada via html2canvas) com uma tabela por Engenheiro,
// uma linha por tarefa e uma coluna por dia da semana (SEX→QUI) colorida pelo status
// daquele dia — complementa o card por Área (Fechamento/Programação de um único dia).
// Sempre em paisagem (ver ModalExportarImagem): é uma tabela larga, não cabe bem em
// retrato. Cores em style inline de propósito — ver paleta.ts.
const CardProgramacaoSemanal = forwardRef<HTMLDivElement, Props>(function CardProgramacaoSemanal(
  { codigo, nomeProjeto, gestor, dataLabel, matriz, getDetalhe },
  ref,
) {
  const { weekDays, engenheiros, concluidas, naoConcluidas, aderenciaPct, totalAtividades } = matriz

  return (
    <div ref={ref} className="w-[1100px] p-6 space-y-4 font-sans" style={{ backgroundColor: COR.bg, color: COR.gray900 }}>
      <RelatorioHeader codigo={codigo} nomeProjeto={nomeProjeto} gestor={gestor} tipo="Programação semanal" dataLabel={dataLabel} />

      {engenheiros.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Concluídas" value={String(concluidas)} color={COR.emerald700} />
          <StatBox label="Não concluídas" value={String(naoConcluidas)} color={COR.red700} />
          <StatBox
            label="Aderência"
            value={aderenciaPct != null ? `${aderenciaPct}%` : '—'}
            color={COR.navy}
            detalhe={`${concluidas}/${totalAtividades}`}
          />
        </div>
      )}

      {engenheiros.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: COR.white, color: COR.gray500 }}>
          Nenhuma atividade programada para esta semana.
        </div>
      ) : (
        <div className="space-y-4">
          {engenheiros.map((eng) => (
            <div key={eng.nome} className="rounded-2xl p-5" style={{ backgroundColor: COR.white }}>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: COR.indigo500, color: COR.white }}
                >
                  {iniciais(eng.nome)}
                </span>
                <div>
                  <p className="font-bold" style={{ color: COR.gray900 }}>{eng.nome}</p>
                  <p className="text-xs" style={{ color: COR.gray500 }}>Engenheiro</p>
                </div>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left font-semibold pb-2 pr-2" style={{ color: COR.gray500 }}>TAREFA</th>
                    {getDetalhe && (
                      <>
                        <th className="font-semibold pb-2 px-1 text-center whitespace-nowrap" style={{ color: COR.gray500 }}>Início</th>
                        <th className="font-semibold pb-2 px-1 text-center whitespace-nowrap" style={{ color: COR.gray500 }}>Término</th>
                      </>
                    )}
                    {weekDays.map((d, i) => (
                      <th key={d} className="font-semibold pb-2 px-1 text-center" style={{ color: COR.gray500 }}>
                        <div>{WEEKDAY_LABELS[i]}</div>
                        <div className="font-normal">{formatDiaMes(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eng.linhas.map((linha, i) => {
                    const detalhe = getDetalhe?.(linha) ?? null
                    return (
                      <tr key={linha.taskKey} style={i > 0 ? { borderTop: `1px solid ${COR.gray100}` } : undefined}>
                        <td className="py-2 pr-2" style={{ color: COR.gray800 }}>
                          <span style={{ color: COR.indigo500, fontWeight: 600 }}>{linha.area}</span>
                          {linha.subarea && (
                            <>
                              <span style={{ color: COR.gray400 }}> - </span>
                              <span style={{ color: COR.indigo500, fontWeight: 600 }}>{linha.subarea}</span>
                            </>
                          )}
                          <span style={{ color: COR.gray400 }}> - </span>
                          {linha.nome}
                        </td>
                        {getDetalhe && (
                          <>
                            <td className="px-1 py-2 text-center whitespace-nowrap" style={{ color: COR.gray500 }}>
                              {detalhe ? formatDataCurta(detalhe.start) : '—'}
                            </td>
                            <td className="px-1 py-2 text-center whitespace-nowrap" style={{ color: COR.gray500 }}>
                              {detalhe ? formatDataCurta(detalhe.finish) : '—'}
                            </td>
                          </>
                        )}
                        {weekDays.map((d) => {
                          const status = linha.porDia[d]
                          const cor = corDoStatus(status)
                          return (
                            <td key={d} className="px-1 py-2">
                              {cor && <div className="w-full h-5 rounded-md" style={{ backgroundColor: cor }} />}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-5 text-xs" style={{ color: COR.gray800 }}>
        <Legenda cor={COR.emerald300} label="Concluído" />
        <Legenda cor={COR.amber300} label="Em execução" />
        <Legenda cor={COR.rose300} label="Atrasado" />
        <Legenda cor={COR.gray300} label="Pendente" />
      </div>

      <p className="text-center text-[11px] pt-1" style={{ color: COR.gray400 }}>
        ProjectObra · gerado automaticamente a partir da programação semanal
      </p>
    </div>
  )
})

export default CardProgramacaoSemanal

function Legenda({ cor, label }: { cor: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-md" style={{ backgroundColor: cor }} />
      {label}
    </div>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return partes.length === 1 ? partes[0].slice(0, 2).toUpperCase() : (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function formatDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// pendente (dia dentro do período da atividade, mas sem status marcado ainda) vira um
// quadradinho cinza — sinaliza "ainda por fazer" sem julgar se está atrasado. Já um dia
// sem NENHUMA atividade programada (undefined, fora do intervalo real da tarefa) fica
// sem quadrado nenhum, pra não sugerir que a tarefa "existe" num dia em que ela nem
// estava programada.
function corDoStatus(status: ActivityStatus | undefined): string | null {
  switch (status) {
    case 'concluida':
      return COR.emerald300
    case 'parcial':
      return COR.amber300
    case 'nao_concluida':
      return COR.rose300
    case 'pendente':
      return COR.gray300
    default:
      return null
  }
}
