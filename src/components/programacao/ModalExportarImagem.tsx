import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Download, FileText, Share2, Image, MessageSquareText, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProjects } from '@/lib/project-store'
import { getActivitiesInDateRange } from '@/lib/programacao-db'
import { buildRelatorioVisual, buildMatrizSemanal, type RelatorioVisual, type MatrizSemanal } from '@/lib/relatorio-visual'
import { buildTextoRelatorioVisual } from '@/lib/relatorio-texto'
import { downloadNodeAsPng, shareNodeAsPng, canShareFiles, canShareText, shareText } from '@/lib/png-export'
import { downloadMatrizSemanalPdf } from '@/lib/matriz-semanal-pdf'
import { downloadRelatorioDiaPdf } from '@/lib/relatorio-dia-pdf'
import { parseISODateStr } from '@/lib/iso-week'
import type { WBSActivity } from '@/lib/xml-parser'
import type { LinhaMatriz } from '@/lib/relatorio-visual'
import CardRelatorioVisual from '@/components/relatorio/CardRelatorioVisual'
import CardProgramacaoSemanal from '@/components/relatorio/CardProgramacaoSemanal'

export type AlvoExportacao = { tipo: 'dia'; data: string } | { tipo: 'semana'; weekDays: string[] }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  alvo: AlvoExportacao | null
}

function formatDataCompleta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDataComDiaSemana(iso: string): string {
  const nome = parseISODateStr(iso).toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${formatDataCompleta(iso)} · ${nome.charAt(0).toUpperCase()}${nome.slice(1)}`
}

function formatHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Gera a imagem PNG (Fechamento/Programação de um dia, ou a semana por Engenheiro) pra
// compartilhar no WhatsApp — chamada de dentro do card do dia (ModalDetalheDia) e do
// menu Ações (WeekBar). Só reflete os dados reais: dia fechado ou não, o card mostra o
// status de cada atividade como está agora, sem exigir a semana estar bloqueada.
export default function ModalExportarImagem({ open, onOpenChange, alvo }: Props) {
  const { currentProject } = useProjects()
  const [loading, setLoading] = useState(false)
  const [relatorio, setRelatorio] = useState<RelatorioVisual | null>(null)
  const [matriz, setMatriz] = useState<MatrizSemanal | null>(null)
  const [emitidoAs, setEmitidoAs] = useState('')
  const [exporting, setExporting] = useState<'baixar' | 'pdf' | 'compartilhar' | null>(null)
  const [modo, setModo] = useState<'imagem' | 'texto'>('imagem')
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !alvo) return
    setLoading(true)
    setRelatorio(null)
    setMatriz(null)
    setModo('imagem')
    const promise =
      alvo.tipo === 'semana'
        ? getActivitiesInDateRange(alvo.weekDays[0], alvo.weekDays[6]).then((a) => setMatriz(buildMatrizSemanal(a, alvo.weekDays)))
        : getActivitiesInDateRange(alvo.data, alvo.data).then((a) => setRelatorio(buildRelatorioVisual(a)))
    promise
      .then(() => setEmitidoAs(formatHora(new Date())))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao carregar atividades'))
      .finally(() => setLoading(false))
  }, [open, alvo])

  // Mesma informação do card visual, só que como texto com formatação nativa do
  // WhatsApp (*negrito*, emojis de status) — pra enviar direto na conversa sem
  // depender de anexo (imagem comprimida ou PDF que exige abrir fora do app). Só
  // faz sentido pra programação do dia; a semanal continua só como imagem/PDF (a
  // matriz por engenheiro não cabe bem em texto corrido).
  const texto = useMemo(() => {
    if (!alvo || alvo.tipo !== 'dia' || !relatorio) return ''
    return buildTextoRelatorioVisual({
      codigo: currentProject?.codigo ?? '—',
      nomeProjeto: currentProject?.nome ?? '—',
      gestor: currentProject?.gestor,
      tipo: 'Programação',
      dataLabel: formatDataComDiaSemana(alvo.data),
      relatorio,
    })
  }, [alvo, relatorio, currentProject])

  // Índice cronograma+uid -> WBSActivity, mesmo padrão de DailyProgramming.tsx —
  // resolve início/término reais da tarefa (não só os dias dela dentro desta semana)
  // pras colunas extras da matriz semanal, quando há cronograma carregado.
  const cronogramaActivityIndex = useMemo(() => {
    const map = new Map<string, WBSActivity>()
    for (const c of currentProject?.cronogramas || []) {
      if (!c.ativo || !c.dados) continue
      for (const act of c.dados.activities) map.set(`${c.nome}::${act.uid}`, act)
    }
    return map
  }, [currentProject])

  const getDetalhe = (linha: LinhaMatriz): WBSActivity | null => {
    if (!linha.source || !linha.taskUid) return null
    return cronogramaActivityIndex.get(`${linha.source}::${linha.taskUid}`) ?? null
  }

  if (!alvo) return null

  const tipoLabel = alvo.tipo === 'semana' ? 'Programação semanal' : 'Programação'
  const baseFilename = alvo.tipo === 'semana' ? `programacao-semanal-${alvo.weekDays[0]}` : `${alvo.tipo}-${alvo.data}`
  const pronto = alvo.tipo === 'semana' ? !!matriz : !!relatorio

  const handleBaixar = async () => {
    if (!cardRef.current) return
    setExporting('baixar')
    try {
      await downloadNodeAsPng(cardRef.current, `${baseFilename}.png`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a imagem')
    } finally {
      setExporting(null)
    }
  }

  const handleBaixarPdf = async () => {
    setExporting('pdf')
    try {
      if (alvo.tipo === 'semana') {
        if (!matriz) return
        await downloadMatrizSemanalPdf({
          codigo: currentProject?.codigo ?? '—',
          nomeProjeto: currentProject?.nome ?? '—',
          gestor: currentProject?.gestor,
          dataLabel: `${formatDataCompleta(alvo.weekDays[0])} a ${formatDataCompleta(alvo.weekDays[6])}`,
          matriz,
          getDetalhe,
          filename: `${baseFilename}.pdf`,
          percentualAvanco: currentProject?.percentualAvanco,
          dataInicioProjeto: currentProject?.dataInicio,
          dataFimProjeto: currentProject?.dataFimPrevista,
          localizacao: currentProject?.localizacao,
        })
      } else {
        if (!relatorio) return
        await downloadRelatorioDiaPdf({
          codigo: currentProject?.codigo ?? '—',
          nomeProjeto: currentProject?.nome ?? '—',
          gestor: currentProject?.gestor,
          tipo: tipoLabel,
          dataLabel: formatDataComDiaSemana(alvo.data),
          relatorio,
          filename: `${baseFilename}.pdf`,
        })
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar o PDF')
    } finally {
      setExporting(null)
    }
  }

  const handleCompartilhar = async () => {
    if (!cardRef.current) return
    setExporting('compartilhar')
    try {
      await shareNodeAsPng(cardRef.current, `${baseFilename}.png`, tipoLabel)
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') toast.error(e.message)
    } finally {
      setExporting(null)
    }
  }

  const handleCopiarTexto = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Mensagem copiada')
    } catch {
      toast.error('Não foi possível copiar — selecione e copie o texto manualmente')
    }
  }

  const handleEnviarTexto = async () => {
    setExporting('compartilhar')
    try {
      await shareText(texto, tipoLabel)
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') toast.error(e.message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${alvo.tipo === 'semana' ? 'max-w-[1200px]' : 'max-w-4xl'} max-h-[90vh] flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image size={18} /> {tipoLabel}
          </DialogTitle>
        </DialogHeader>

        {alvo.tipo === 'dia' && (
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 -mt-1">
            <button
              onClick={() => setModo('imagem')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                modo === 'imagem'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Image size={13} /> Imagem
            </button>
            <button
              onClick={() => setModo('texto')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                modo === 'texto'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <MessageSquareText size={13} /> Mensagem de texto
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto flex justify-center py-2">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="animate-spin text-gray-400" size={28} />
            </div>
          ) : modo === 'texto' ? (
            <textarea
              readOnly
              value={texto}
              className="w-full min-h-[320px] text-sm px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : alvo.tipo === 'semana' ? (
            matriz && (
              <div className="shadow-xl rounded-2xl overflow-hidden shrink-0">
                <CardProgramacaoSemanal
                  ref={cardRef}
                  codigo={currentProject?.codigo ?? '—'}
                  nomeProjeto={currentProject?.nome ?? '—'}
                  gestor={currentProject?.gestor}
                  dataLabel={`${formatDataCompleta(alvo.weekDays[0])} a ${formatDataCompleta(alvo.weekDays[6])}`}
                  matriz={matriz}
                  getDetalhe={getDetalhe}
                />
              </div>
            )
          ) : (
            relatorio && (
              <div className="shadow-xl rounded-2xl overflow-hidden shrink-0">
                <CardRelatorioVisual
                  ref={cardRef}
                  codigo={currentProject?.codigo ?? '—'}
                  nomeProjeto={currentProject?.nome ?? '—'}
                  gestor={currentProject?.gestor}
                  tipo={tipoLabel}
                  dataLabel={formatDataComDiaSemana(alvo.data)}
                  emitidoAs={emitidoAs}
                  relatorio={relatorio}
                />
              </div>
            )
          )}
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          {modo === 'texto' ? (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Mensagem em texto puro — sem anexo, sem compressão, abre direto na conversa. Envie ou copie e cole no WhatsApp.
            </p>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              O WhatsApp recomprime imagens enviadas como foto, o que pode deixar o texto borrado.{' '}
              {alvo.tipo === 'dia'
                ? <>Prefira a aba <strong>Mensagem de texto</strong>, ou envie o PDF como <strong>documento</strong> (anexo → Documento, não Foto).</>
                : <>Pra manter a qualidade original, envie o PDF como <strong>documento</strong> (anexo → Documento, não Foto).</>}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {modo === 'texto' ? (
              <>
                <button
                  onClick={handleCopiarTexto}
                  disabled={loading || !texto || exporting !== null}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy size={14} /> Copiar mensagem
                </button>
                {canShareText() && (
                  <button
                    onClick={handleEnviarTexto}
                    disabled={loading || !texto || exporting !== null}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {exporting === 'compartilhar' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Enviar mensagem
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleBaixar}
                  disabled={loading || !pronto || exporting !== null}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {exporting === 'baixar' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Baixar imagem
                </button>
                <button
                  onClick={handleBaixarPdf}
                  disabled={loading || !pronto || exporting !== null}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Baixar PDF
                </button>
                {canShareFiles() && (
                  <button
                    onClick={handleCompartilhar}
                    disabled={loading || !pronto || exporting !== null}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {exporting === 'compartilhar' ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                    Compartilhar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
