import { useState } from 'react'
import { toast } from 'sonner'
import { HardDrive, Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useUsoArmazenamento, useArquivosOrfaosPlantas, useLimparArquivosOrfaosPlantas, formatarBytes,
} from '@/lib/armazenamento-db'

// Limiares só de AVISO — não é a cota real do plano do Supabase (não temos
// como consultar isso pela API do projeto) nem bloqueiam upload nenhum.
// Servem só pra colorir a barra e dar um sinal antes de virar problema.
const LIMIAR_AVISO_BYTES = 2 * 1024 ** 3 // 2 GB
const LIMIAR_CRITICO_BYTES = 5 * 1024 ** 3 // 5 GB

interface Props {
  organizacaoId: string | undefined
  /** Mostra o botão de limpar arquivos órfãos de plantas — só faz sentido
   * pra quem tem Edição (mesma regra de quem pode excluir planta). */
  podeLimpar?: boolean
}

export default function UsoArmazenamentoBar({ organizacaoId, podeLimpar = false }: Props) {
  const { data: uso = [], isLoading } = useUsoArmazenamento(organizacaoId)
  const { data: orfaos } = useArquivosOrfaosPlantas(podeLimpar ? organizacaoId : undefined)
  const limparMut = useLimparArquivosOrfaosPlantas(organizacaoId)
  const [detalheAberto, setDetalheAberto] = useState(false)

  if (isLoading || uso.length === 0) return null

  const totalBytes = uso.reduce((s, b) => s + b.totalBytes, 0)
  const nivel = totalBytes >= LIMIAR_CRITICO_BYTES ? 'critico' : totalBytes >= LIMIAR_AVISO_BYTES ? 'aviso' : 'ok'
  const corBarra = nivel === 'critico' ? 'bg-red-500' : nivel === 'aviso' ? 'bg-amber-500' : 'bg-blue-500'
  const corTexto = nivel === 'critico' ? 'text-red-600 dark:text-red-400' : nivel === 'aviso' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
  // Barra sempre mostra algo de progresso visual mesmo sem uma cota real —
  // usa o limiar crítico como "cheio" pra dar noção de proporção.
  const pctBarra = Math.min(100, (totalBytes / LIMIAR_CRITICO_BYTES) * 100)

  const BUCKET_LABELS: Record<string, string> = { 'mapa-plantas': 'Plantas (Gestão à Vista)', 'rdr-fotos': 'Fotos de RDR' }

  const handleLimpar = async () => {
    if (!orfaos || orfaos.arquivos.length === 0) return
    try {
      await limparMut.mutateAsync(orfaos.arquivos.map((a) => a.path))
      toast.success(`${orfaos.arquivos.length} arquivo(s) não usado(s) removido(s) — ${formatarBytes(orfaos.totalBytes)} liberados.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao limpar arquivos')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-sm">
      <button onClick={() => setDetalheAberto((v) => !v)} className="w-full flex items-center gap-2">
        <HardDrive size={15} className="text-gray-400 shrink-0" />
        <span className="text-gray-600 dark:text-gray-300 font-medium">Armazenamento</span>
        <span className={`ml-auto font-semibold tabular-nums ${corTexto}`}>{formatarBytes(totalBytes)}</span>
        {detalheAberto ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all ${corBarra}`} style={{ width: `${pctBarra}%` }} />
      </div>

      {nivel !== 'ok' && (
        <p className={`mt-1.5 text-xs ${corTexto}`}>
          {nivel === 'critico' ? 'Uso alto — ' : 'Uso crescendo — '}
          considere revisar plantas antigas ou arquivadas.
        </p>
      )}

      {detalheAberto && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
          {uso.map((b) => (
            <div key={b.bucketId} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{BUCKET_LABELS[b.bucketId] ?? b.bucketId} · {b.totalArquivos} arquivo(s)</span>
              <span className="tabular-nums">{formatarBytes(b.totalBytes)}</span>
            </div>
          ))}

          {podeLimpar && orfaos && orfaos.arquivos.length > 0 && (
            <div className="pt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {orfaos.arquivos.length} arquivo(s) sem planta associada (sobra de exclusão) — {formatarBytes(orfaos.totalBytes)}.
              </p>
              <button
                onClick={handleLimpar}
                disabled={limparMut.isPending}
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              >
                {limparMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
