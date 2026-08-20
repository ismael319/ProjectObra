import { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Loader2, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { parseListaMateriais, type ResultadoParseLista } from '@/lib/suprimentos/entrega-materiais/parse'
import { criarFrente, importarLista } from '@/lib/suprimentos/entrega-materiais/db'
import type { Frente } from '@/lib/suprimentos/entrega-materiais/types'

type Estagio = 'idle' | 'processando' | 'pronto' | 'importando'

interface Props {
  open: boolean
  onClose: () => void
  projetoId: string
  organizacaoId: string
  frentes: Frente[]
  onImportado: (frenteCriada?: Frente) => void
}

export default function EntregaMateriaisUploadModal({ open, onClose, projetoId, organizacaoId, frentes, onImportado }: Props) {
  const [frenteId, setFrenteId] = useState<string | null>(null)
  const [novaFrenteNome, setNovaFrenteNome] = useState('')
  const [criandoFrente, setCriandoFrente] = useState(false)
  const [frentesLocais, setFrentesLocais] = useState<Frente[]>(frentes)

  const [estagio, setEstagio] = useState<Estagio>('idle')
  const [fileName, setFileName] = useState('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResultadoParseLista | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function resetar() {
    setFrenteId(null)
    setNovaFrenteNome('')
    setFrentesLocais(frentes)
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

  async function handleCriarFrente() {
    const nome = novaFrenteNome.trim()
    if (!nome) return
    setCriandoFrente(true)
    try {
      const frente = await criarFrente({ projetoId, organizacaoId, nome })
      setFrentesLocais((prev) => [...prev, frente].sort((a, b) => a.nome.localeCompare(b.nome)))
      setFrenteId(frente.id)
      setNovaFrenteNome('')
      onImportado(frente)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar a frente.')
    } finally {
      setCriandoFrente(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setErro('')
    setResultado(null)
    setEstagio('processando')

    try {
      const r = await parseListaMateriais(file)
      setResultado(r)
      if (!frenteId && !novaFrenteNome.trim() && r.sugestaoFrente) setNovaFrenteNome(r.sugestaoFrente)
      setEstagio('pronto')
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setEstagio('idle')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirmar() {
    if (!resultado || resultado.linhas.length === 0 || !frenteId) return
    setEstagio('importando')
    try {
      const { itensGravados } = await importarLista({
        projetoId,
        organizacaoId,
        frenteId,
        linhas: resultado.linhas,
      })
      toast.success(`${itensGravados} item(ns) gravado(s).`)
      onImportado()
      resetar()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setEstagio('pronto')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar lista de peças</DialogTitle>
          <DialogDescription>
            Envie a planilha (XLSX ou CSV) com Marca/Conjunto, Descrição, Quantidade e Peso Unitário. O arquivo é
            sempre a lista de UMA frente — escolha ou crie a frente abaixo antes de gravar. Reimportar a mesma lista
            corrigida atualiza os itens já existentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {erro && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {erro}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Frente desta lista</Label>
            <Combobox
              options={frentesLocais.map((f) => ({ value: f.id, label: f.nome }))}
              value={frenteId}
              onChange={setFrenteId}
              placeholder="Selecione a frente..."
              emptyText="Nenhuma frente cadastrada."
              disabled={estagio === 'importando'}
            />
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Ou crie uma frente nova"
                value={novaFrenteNome}
                onChange={(e) => setNovaFrenteNome(e.target.value)}
                className="text-sm"
                disabled={estagio === 'importando'}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleCriarFrente} disabled={!novaFrenteNome.trim() || criandoFrente || estagio === 'importando'}>
                <Plus size={14} className="mr-1" /> Criar
              </Button>
            </div>
            {resultado?.sugestaoFrente && novaFrenteNome === resultado.sugestaoFrente && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nome sugerido a partir do arquivo — ajuste se quiser antes de criar.
              </p>
            )}
          </div>

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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-1">
              <p className="font-medium text-gray-900 dark:text-white">{resultado.linhas.length} peça(s) prontas para gravar</p>
              {resultado.linhas.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400">Nenhuma linha válida encontrada — confira os problemas abaixo.</p>
              )}
            </div>
          )}

          {resultado && resultado.problemas.length > 0 && estagio !== 'processando' && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1 max-h-40 overflow-auto">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle size={15} /> {resultado.problemas.length} aviso(s)
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {resultado.problemas.slice(0, 20).map((p, i) => (
                  <li key={i}>
                    Linha {p.linha}
                    {p.campo ? ` (${p.campo})` : ''}: {p.descricao}
                  </li>
                ))}
                {resultado.problemas.length > 20 && <li>...e mais {resultado.problemas.length - 20}.</li>}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={estagio === 'importando'}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!frenteId || !resultado || resultado.linhas.length === 0 || estagio === 'importando' || estagio === 'processando'}
          >
            {estagio === 'importando' ? 'Gravando...' : 'Confirmar importação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
