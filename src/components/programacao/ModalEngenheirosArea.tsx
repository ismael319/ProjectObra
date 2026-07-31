import { useEffect, useMemo, useState } from 'react'
import { Loader2, UserCog, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { useAreas, useSetores } from '@/pages/apontamento/lib/catalog'
import {
  listEngenheirosArea,
  upsertEngenheiroArea,
  upsertAreaVinculada,
  deleteEngenheiroArea,
  type EngenheiroArea,
} from '@/lib/programacao-db'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projetoId: string | null
  /** Nomes de área (nível 2 da EDT) que existem de fato no(s) cronograma(s) ativo(s) —
   * a lista principal de linhas vem daqui; áreas já cadastradas mas que não aparecem
   * mais no cronograma (ex.: cronograma trocado) também aparecem, marcadas à parte. */
  areasDoCronograma: string[]
}

export default function ModalEngenheirosArea({ open, onOpenChange, projetoId, areasDoCronograma }: Props) {
  const [loading, setLoading] = useState(false)
  const [existentes, setExistentes] = useState<EngenheiroArea[]>([])
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [savingArea, setSavingArea] = useState<string | null>(null)

  const { data: setores = [] } = useSetores()
  const { data: areas = [] } = useAreas()
  const setorNomePorId = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores])
  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a.id, label: `${a.nome} (${setorNomePorId.get(a.setor_id) ?? '?'})` })),
    [areas, setorNomePorId],
  )

  useEffect(() => {
    if (!open || !projetoId) return
    setLoading(true)
    listEngenheirosArea(projetoId)
      .then((rows) => {
        setExistentes(rows)
        setRascunho(Object.fromEntries(rows.map((r) => [r.area_nome, r.engenheiro ?? ''])))
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [open, projetoId])

  const existentesPorArea = useMemo(() => new Map(existentes.map((e) => [e.area_nome, e])), [existentes])

  // Áreas do cronograma primeiro (ordem já alfabética), seguidas de áreas cadastradas
  // que não aparecem mais no cronograma ativo (não descarta o que já foi digitado).
  const orfas = existentes.map((e) => e.area_nome).filter((n) => !areasDoCronograma.includes(n))
  const todasAreas = [...areasDoCronograma, ...orfas]

  const handleSalvarEngenheiro = async (areaNome: string) => {
    if (!projetoId) return
    const valor = (rascunho[areaNome] ?? '').trim()
    const atual = existentesPorArea.get(areaNome)
    if (valor === (atual?.engenheiro ?? '')) return // nada mudou

    setSavingArea(areaNome)
    try {
      if (valor === '' && atual && !atual.area_id) {
        // Sem engenheiro e sem área vinculada — não sobra motivo pra linha existir.
        await deleteEngenheiroArea(atual.id)
        setExistentes((prev) => prev.filter((e) => e.id !== atual.id))
      } else {
        await upsertEngenheiroArea(projetoId, areaNome, valor)
        setExistentes(await listEngenheirosArea(projetoId))
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingArea(null)
    }
  }

  const handleSelecionarArea = async (areaNome: string, areaId: string | null) => {
    if (!projetoId) return
    const atual = existentesPorArea.get(areaNome)
    if (areaId === null && atual && !(rascunho[areaNome] ?? '').trim()) {
      // Sem área vinculada e sem engenheiro — não sobra motivo pra linha existir.
      setSavingArea(areaNome)
      try {
        await deleteEngenheiroArea(atual.id)
        setExistentes((prev) => prev.filter((e) => e.id !== atual.id))
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      } finally {
        setSavingArea(null)
      }
      return
    }
    setSavingArea(areaNome)
    try {
      await upsertAreaVinculada(projetoId, areaNome, areaId)
      setExistentes(await listEngenheirosArea(projetoId))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingArea(null)
    }
  }

  const handleRemover = async (areaNome: string) => {
    const atual = existentesPorArea.get(areaNome)
    if (!atual) return
    setSavingArea(areaNome)
    try {
      await deleteEngenheiroArea(atual.id)
      setExistentes((prev) => prev.filter((e) => e.id !== atual.id))
      setRascunho((prev) => ({ ...prev, [areaNome]: '' }))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover')
    } finally {
      setSavingArea(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog size={18} />
            Engenheiro e Área por área do cronograma
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Cadastre 1x, por área (nível 2 da EDT): qual engenheiro responde por ela e qual Área "de verdade" do
          cadastro (Setor→Área→Etapa) ela representa. Os dois são aplicados automaticamente na importação de
          atividades, sem precisar confirmar de novo toda semana.
        </p>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : todasAreas.length === 0 ? (
            <p className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
              Nenhuma área encontrada — carregue um cronograma no projeto primeiro.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {todasAreas.map((areaNome) => {
                const isOrfa = orfas.includes(areaNome)
                const atual = existentesPorArea.get(areaNome)
                return (
                  <div key={areaNome} className="flex items-center gap-2 py-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm text-gray-900 dark:text-white truncate">{areaNome}</p>
                      {isOrfa && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Não está no cronograma ativo</p>
                      )}
                    </div>
                    <div className="w-64">
                      <Combobox
                        options={areaOptions}
                        value={atual?.area_id ?? null}
                        onChange={(v) => handleSelecionarArea(areaNome, v)}
                        placeholder="Área do cadastro"
                      />
                    </div>
                    <input
                      value={rascunho[areaNome] ?? ''}
                      onChange={(e) => setRascunho((prev) => ({ ...prev, [areaNome]: e.target.value }))}
                      onBlur={() => handleSalvarEngenheiro(areaNome)}
                      placeholder="Nome do engenheiro"
                      className="w-48 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {savingArea === areaNome ? (
                      <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />
                    ) : atual ? (
                      <button
                        onClick={() => handleRemover(areaNome)}
                        title="Remover"
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <div className="w-[26px] shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
