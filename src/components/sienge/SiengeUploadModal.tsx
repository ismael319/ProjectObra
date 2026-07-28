import { useRef, useState } from 'react'
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { parseArquivoSienge, type ResultadoParse } from '@/lib/sienge/parse'
import { importar } from '@/lib/sienge/db'
import { classificarItem } from '@/lib/sienge/classify'
import { TITULOS_TIPO, type TipoRelatorio } from '@/lib/sienge/types'

type Estagio = 'idle' | 'processando' | 'pronto' | 'importando'

interface Props {
  open: boolean
  onClose: () => void
  projetoId: string
  organizacaoId: string
  userId?: string | null
  onImportado: (tipo: TipoRelatorio) => void
}

export default function SiengeUploadModal({ open, onClose, projetoId, organizacaoId, userId, onImportado }: Props) {
  const [estagio, setEstagio] = useState<Estagio>('idle')
  const [fileName, setFileName] = useState('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResultadoParse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function resetar() {
    setEstagio('idle')
    setFileName('')
    setErro('')
    setResultado(null)
  }

  function handleClose() {
    if (estagio === 'importando') return
    resetar()
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setErro('')
    setResultado(null)
    setEstagio('processando')

    try {
      const r = await parseArquivoSienge(file)
      setResultado(r)
      setEstagio('pronto')
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setEstagio('idle')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirmar() {
    if (!resultado) return
    setEstagio('importando')
    try {
      await importar({
        projetoId,
        organizacaoId,
        userId,
        tipo: resultado.tipo,
        arquivoNome: fileName,
        itens: resultado.itens,
      })

      const classificados = resultado.itens.map((item) => classificarItem(item, resultado.tipo))
      const atrasados = classificados.filter((c) => c.classe !== 'good').length
      const criticos = classificados.filter((c) => c.classe === 'critical').length

      if (atrasados === 0) {
        toast.success(`${resultado.itens.length} itens importados. Nenhum item em atraso.`)
      } else {
        toast.warning(
          `${atrasados} item(ns) em atraso${criticos > 0 ? `, ${criticos} crítico(s)` : ''}. Confira o painel.`
        )
      }

      onImportado(resultado.tipo)
      resetar()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setEstagio('pronto')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar relatório do Sienge</DialogTitle>
          <DialogDescription>
            Envie o arquivo XLSX ou CSV exportado do Sienge (Relação de Solicitações, Pedido de Compra ou Relação de
            Contratos).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {erro && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {erro}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
            disabled={estagio === 'processando' || estagio === 'importando'}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={estagio === 'processando' || estagio === 'importando'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:cursor-not-allowed"
          >
            {estagio === 'processando' ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Processando {fileName}...
              </>
            ) : fileName ? (
              <>
                <FileSpreadsheet size={18} className="text-blue-500" /> {fileName}
              </>
            ) : (
              <>
                <Upload size={18} /> Selecionar arquivo XLSX ou CSV
              </>
            )}
          </button>

          {resultado && estagio !== 'processando' && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
              <p className="font-medium text-gray-900 dark:text-white">{TITULOS_TIPO[resultado.tipo]}</p>
              <p className="text-gray-500 dark:text-gray-400">{resultado.itens.length} itens encontrados</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={estagio === 'importando'}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!resultado || estagio === 'importando' || estagio === 'processando'}>
            {estagio === 'importando' ? 'Importando...' : 'Confirmar importação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
