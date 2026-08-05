import { useState } from 'react'
import { X, Merge, Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { mesclarCargos, type Cargo } from './lib/histograma-db'

interface Props {
  cargos: Cargo[]
  onClose: () => void
  onMesclado: () => void
}

// Junta um cargo duplicado (origem) num cargo "de verdade" (destino) — move
// Planejado/Real de um pro outro (somando quando os dois já têm valor no mesmo
// mês/semana) e apaga o origem. Existe pra corrigir duplicatas criadas por
// importações antigas cujo nome na planilha não bateu com o cargo já cadastrado
// (ver aviso adicionado em handleConfirmarImport, HistogramaMO.tsx).
export default function MesclarCargosDialog({ cargos, onClose, onMesclado }: Props) {
  const [origemId, setOrigemId] = useState<string | null>(null)
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [mesclando, setMesclando] = useState(false)

  const origem = cargos.find((c) => c.id === origemId) ?? null
  const destino = cargos.find((c) => c.id === destinoId) ?? null
  const opcoesDestino = cargos.filter((c) => c.id !== origemId)

  async function handleMesclar() {
    if (!origem || !destino) return
    if (
      !confirm(
        `Mesclar "${origem.nome}" em "${destino.nome}"? Todo o Planejado/Real de "${origem.nome}" é movido pra "${destino.nome}" (somando quando os dois já têm valor no mesmo mês/semana), e "${origem.nome}" é apagado. Essa ação não pode ser desfeita.`,
      )
    )
      return
    setMesclando(true)
    try {
      const r = await mesclarCargos(origem.id, destino.id)
      toast.success(
        `Mesclado — Planejado: ${r.planejadoMovidos} movido(s), ${r.planejadoSomados} somado(s). Real: ${r.realMovidos} movido(s), ${r.realSomados} somado(s).`,
      )
      setOrigemId(null)
      setDestinoId(null)
      onMesclado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setMesclando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Merge size={18} /> Mesclar cargos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pra corrigir um cargo duplicado — junta os valores num só e apaga o outro.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Cargo duplicado (será apagado)</Label>
            <Combobox
              options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              value={origemId}
              onChange={(v) => {
                setOrigemId(v)
                if (v && v === destinoId) setDestinoId(null)
              }}
              placeholder="Selecione o cargo duplicado"
            />
          </div>

          <div className="flex justify-center text-gray-400">
            <ArrowRight size={18} />
          </div>

          <div className="space-y-1.5">
            <Label>Cargo correto (recebe os valores)</Label>
            <Combobox
              options={opcoesDestino.map((c) => ({ value: c.id, label: c.nome }))}
              value={destinoId}
              onChange={setDestinoId}
              placeholder="Selecione o cargo correto"
              disabled={!origemId}
            />
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Quando os dois cargos já têm um valor no mesmo mês (Planejado) ou semana (Real), os dois valores são
            somados — nenhum lançamento se perde.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={handleMesclar} disabled={!origem || !destino || mesclando}>
              {mesclando ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />} Mesclar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
