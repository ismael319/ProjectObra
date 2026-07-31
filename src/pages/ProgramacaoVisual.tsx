import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Loader2, Download, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProjects } from '@/lib/project-store'
import { getActivitiesInDateRange } from '@/lib/programacao-db'
import { buildRelatorioVisual, type RelatorioVisual } from '@/lib/relatorio-visual'
import { downloadNodeAsPng, shareNodeAsPng, canShareFiles } from '@/lib/png-export'
import { toISODateStr, addDays } from '@/lib/iso-week'
import CardRelatorioVisual from '@/components/relatorio/CardRelatorioVisual'

type Modo = 'fechamento' | 'programacao'

function formatDataCompleta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ProgramacaoVisual() {
  const { currentProject } = useProjects()
  const [modo, setModo] = useState<Modo>('fechamento')
  const [data, setData] = useState(() => toISODateStr(new Date()))
  const [loading, setLoading] = useState(true)
  const [relatorio, setRelatorio] = useState<RelatorioVisual | null>(null)
  const [emitidoAs, setEmitidoAs] = useState('')
  const [exporting, setExporting] = useState<'baixar' | 'compartilhar' | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Trocar de modo já sugere a data mais provável (hoje pro Fechamento, amanhã pra
  // Programação) — o usuário ainda pode escolher outra livremente depois.
  const handleModo = (novo: Modo) => {
    setModo(novo)
    setData(toISODateStr(novo === 'programacao' ? addDays(new Date(), 1) : new Date()))
  }

  useEffect(() => {
    setLoading(true)
    getActivitiesInDateRange(data, data)
      .then((activities) => {
        setRelatorio(buildRelatorioVisual(activities))
        setEmitidoAs(formatHora(new Date()))
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao carregar atividades'))
      .finally(() => setLoading(false))
  }, [data])

  const tipo = modo === 'fechamento' ? 'Fechamento das Atividades' : 'Programação do Dia Seguinte'
  const filename = useMemo(
    () => `${modo}-${data}.png`,
    [modo, data],
  )

  const handleBaixar = async () => {
    if (!cardRef.current) return
    setExporting('baixar')
    try {
      await downloadNodeAsPng(cardRef.current, filename)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a imagem')
    } finally {
      setExporting(null)
    }
  }

  const handleCompartilhar = async () => {
    if (!cardRef.current) return
    setExporting('compartilhar')
    try {
      await shareNodeAsPng(cardRef.current, filename, tipo)
    } catch (e: unknown) {
      // AbortError = usuário cancelou o share sheet — não é erro de verdade.
      if (e instanceof Error && e.name !== 'AbortError') toast.error(e.message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Image size={22} /> Programação Visual</h1>
        <p className="text-sm text-muted-foreground">
          Gera uma imagem pronta pra mandar no WhatsApp com o fechamento do dia ou a programação do dia seguinte.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => handleModo('fechamento')}
            className={`px-3 py-1.5 text-sm font-medium transition ${modo === 'fechamento' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Fechamento
          </button>
          <button
            onClick={() => handleModo('programacao')}
            className={`px-3 py-1.5 text-sm font-medium transition ${modo === 'programacao' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Programação
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="block px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleBaixar}
            disabled={loading || !relatorio || exporting !== null}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting === 'baixar' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar imagem
          </button>
          {canShareFiles() && (
            <button
              onClick={handleCompartilhar}
              disabled={loading || !relatorio || exporting !== null}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exporting === 'compartilhar' ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              Compartilhar
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center overflow-x-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        ) : relatorio ? (
          <div className="shadow-xl rounded-2xl overflow-hidden">
            <CardRelatorioVisual
              ref={cardRef}
              codigo={currentProject?.codigo ?? '—'}
              nomeProjeto={currentProject?.nome ?? '—'}
              gestor={currentProject?.gestor}
              tipo={tipo}
              dataLabel={formatDataCompleta(data)}
              emitidoAs={emitidoAs}
              relatorio={relatorio}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
