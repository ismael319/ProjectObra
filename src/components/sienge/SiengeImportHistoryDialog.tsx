import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { listarImportacoes, excluirImportacao, type Importacao } from '@/lib/sienge/db'
import type { TipoRelatorio } from '@/lib/sienge/types'

interface Props {
  open: boolean
  onClose: () => void
  projetoId: string
  tipo: TipoRelatorio
  onExcluida: () => void
}

export default function SiengeImportHistoryDialog({ open, onClose, projetoId, tipo, onExcluida }: Props) {
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!open) return
    setCarregando(true)
    listarImportacoes(projetoId, tipo)
      .then(setImportacoes)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Erro ao carregar histórico.'))
      .finally(() => setCarregando(false))
  }, [open, projetoId, tipo])

  async function handleExcluir(id: string) {
    try {
      await excluirImportacao(id)
      setImportacoes((prev) => prev.filter((imp) => imp.id !== id))
      toast.success('Importação excluída.')
      onExcluida()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir importação.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de importações</DialogTitle>
          <DialogDescription>Arquivos importados para este tipo de relatório, nesta obra.</DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {carregando && <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Carregando...</p>}
          {!carregando && importacoes.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Nenhuma importação encontrada.</p>
          )}
          {importacoes.map((imp) => (
            <div key={imp.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{imp.arquivoNome}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(imp.importadoEm).toLocaleString('pt-BR')} · {imp.totalItens} itens
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 shrink-0">
                    <Trash2 size={16} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir esta importação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os {imp.totalItens} itens desta importação serão removidos. Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleExcluir(imp.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
