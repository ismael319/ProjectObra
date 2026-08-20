import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarFrentes, listarProgresso, excluirItem } from '@/lib/suprimentos/entrega-materiais/db'
import { classificarEntrega, STATUS_BADGE, STATUS_LABEL, type StatusEntrega } from '@/lib/suprimentos/entrega-materiais/classify'
import type { Frente, ItemProgresso } from '@/lib/suprimentos/entrega-materiais/types'
import EntregaMateriaisUploadModal from '@/components/suprimentos/EntregaMateriaisUploadModal'
import EntregaMateriaisItemDialog from '@/components/suprimentos/EntregaMateriaisItemDialog'

const FILTROS_STATUS: { id: StatusEntrega | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendente' },
  { id: 'parcial', label: 'Parcial' },
  { id: 'completo', label: 'Completo' },
  { id: 'excedente', label: 'Excedente' },
]

function chipClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-transparent text-muted-foreground border-input hover:bg-muted'
  }`
}

function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function formatarPct(pct: number | null): string {
  if (pct === null) return '—'
  return `${Math.round(pct * 100)}%`
}

export default function EntregaMateriais() {
  const { userProfile } = useAuth()
  const { currentProject } = useProjects()
  const { podeEditar } = usePapelModulo('suprimentos')

  const projetoId = currentProject?.id
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const [frentes, setFrentes] = useState<Frente[]>([])
  const [itens, setItens] = useState<ItemProgresso[]>([])
  const [carregando, setCarregando] = useState(false)
  const [filtroFrente, setFiltroFrente] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusEntrega | 'todos'>('todos')

  const [uploadAberto, setUploadAberto] = useState(false)
  const [itemDialogAberto, setItemDialogAberto] = useState(false)
  const [itemEmEdicao, setItemEmEdicao] = useState<ItemProgresso | null>(null)
  const [itemParaExcluir, setItemParaExcluir] = useState<ItemProgresso | null>(null)

  const carregar = useCallback(async () => {
    if (!projetoId) return
    setCarregando(true)
    try {
      const [f, p] = await Promise.all([listarFrentes(projetoId), listarProgresso(projetoId)])
      setFrentes(f)
      setItens(p)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar a lista de materiais.')
    } finally {
      setCarregando(false)
    }
  }, [projetoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      if (filtroFrente && item.frenteId !== filtroFrente) return false
      if (filtroStatus !== 'todos' && classificarEntrega(item.pctQtdEntregue) !== filtroStatus) return false
      return true
    })
  }, [itens, filtroFrente, filtroStatus])

  const nomeFrentePorId = useMemo(() => new Map(frentes.map((f) => [f.id, f.nome])), [frentes])

  async function handleExcluir() {
    if (!itemParaExcluir) return
    try {
      await excluirItem(itemParaExcluir.id)
      toast.success('Item excluído.')
      setItemParaExcluir(null)
      await carregar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir o item.')
    }
  }

  if (!currentProject) {
    return <div className="text-center py-16 text-gray-500 dark:text-gray-400">Selecione uma obra para ver a entrega de materiais.</div>
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Entrega de Materiais</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Progresso de entrega por peça e por frente.</p>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUploadAberto(true)}>
              <Upload size={16} className="mr-1.5" /> Importar planilha
            </Button>
            <Button onClick={() => { setItemEmEdicao(null); setItemDialogAberto(true) }}>
              <Plus size={16} className="mr-1.5" /> Nova peça
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTROS_STATUS.map((f) => (
            <button key={f.id} className={chipClass(filtroStatus === f.id)} onClick={() => setFiltroStatus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Combobox
            options={frentes.map((f) => ({ value: f.id, label: f.nome }))}
            value={filtroFrente}
            onChange={setFiltroFrente}
            placeholder="Todas as frentes"
            emptyText="Nenhuma frente cadastrada."
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Frente</TableHead>
              <TableHead>Marca/Conjunto</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Dimensões</TableHead>
              <TableHead className="text-right">Qtd. planejada</TableHead>
              <TableHead className="text-right">Qtd. entregue</TableHead>
              <TableHead className="text-right">% qtd.</TableHead>
              <TableHead className="text-right">Peso entregue (kg)</TableHead>
              <TableHead className="text-right">% peso</TableHead>
              <TableHead>Status</TableHead>
              {podeEditar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensFiltrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={podeEditar ? 11 : 10} className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                  {carregando ? 'Carregando...' : 'Nenhuma peça encontrada. Importe a lista inicial ou adicione uma peça.'}
                </TableCell>
              </TableRow>
            )}
            {itensFiltrados.map((item) => {
              const status = classificarEntrega(item.pctQtdEntregue)
              return (
                <TableRow key={item.id}>
                  <TableCell>{nomeFrentePorId.get(item.frenteId) ?? '—'}</TableCell>
                  <TableCell className="font-medium">{item.marcaConjunto}</TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">{item.descricao}</TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">{item.dimensoes ?? '—'}</TableCell>
                  <TableCell className="text-right">{formatarNumero(item.qtdPlanejada)}</TableCell>
                  <TableCell className="text-right">{formatarNumero(item.qtdEntregue)}</TableCell>
                  <TableCell className="text-right">{formatarPct(item.pctQtdEntregue)}</TableCell>
                  <TableCell className="text-right">{formatarNumero(item.pesoEntregueKg)}</TableCell>
                  <TableCell className="text-right">{formatarPct(item.pctPesoEntregue)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                  </TableCell>
                  {podeEditar && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setItemEmEdicao(item); setItemDialogAberto(true) }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setItemParaExcluir(item)}>
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {projetoId && organizacaoId && (
        <>
          <EntregaMateriaisUploadModal
            open={uploadAberto}
            onClose={() => setUploadAberto(false)}
            projetoId={projetoId}
            organizacaoId={organizacaoId}
            frentes={frentes}
            onImportado={(frenteCriada) => {
              if (frenteCriada) setFrentes((prev) => [...prev, frenteCriada].sort((a, b) => a.nome.localeCompare(b.nome)))
              void carregar()
            }}
          />
          <EntregaMateriaisItemDialog
            open={itemDialogAberto}
            onClose={() => setItemDialogAberto(false)}
            projetoId={projetoId}
            organizacaoId={organizacaoId}
            frentes={frentes}
            item={itemEmEdicao}
            onSaved={(frenteCriada) => {
              if (frenteCriada) setFrentes((prev) => [...prev, frenteCriada].sort((a, b) => a.nome.localeCompare(b.nome)))
              void carregar()
            }}
          />
        </>
      )}

      <AlertDialog open={!!itemParaExcluir} onOpenChange={(o) => !o && setItemParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{itemParaExcluir?.marcaConjunto}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
