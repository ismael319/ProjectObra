import { useEffect, useRef, useState } from 'react'
import { Loader2, Download, FileText, Share2, Image } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProjects } from '@/lib/project-store'
import { getActivitiesInDateRange } from '@/lib/programacao-db'
import { buildRelatorioVisual, buildMatrizSemanal, type RelatorioVisual, type MatrizSemanal } from '@/lib/relatorio-visual'
import { downloadNodeAsPng, downloadNodeAsPdf, shareNodeAsPng, canShareFiles } from '@/lib/png-export'
import { parseISODateStr } from '@/lib/iso-week'
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
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !alvo) return
    setLoading(true)
    setRelatorio(null)
    setMatriz(null)
    const promise =
      alvo.tipo === 'semana'
        ? getActivitiesInDateRange(alvo.weekDays[0], alvo.weekDays[6]).then((a) => setMatriz(buildMatrizSemanal(a, alvo.weekDays)))
        : getActivitiesInDateRange(alvo.data, alvo.data).then((a) => setRelatorio(buildRelatorioVisual(a)))
    promise
      .then(() => setEmitidoAs(formatHora(new Date())))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao carregar atividades'))
      .finally(() => setLoading(false))
  }, [open, alvo])

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
    if (!cardRef.current) return
    setExporting('pdf')
    try {
      await downloadNodeAsPdf(cardRef.current, `${baseFilename}.pdf`)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image size={18} /> {tipoLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex justify-center py-2">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="animate-spin text-gray-400" size={28} />
            </div>
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

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
