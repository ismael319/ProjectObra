// Painel de configuração da Curva S por peso (dia de corte semanal, dia de folga,
// feriados) — compartilhado entre o wizard de Upload de Cronograma (2º passo,
// quando Tipo de Curva S = peso) e o painel expandido de cada cronograma em
// Gerenciar Cronograma (pra editar depois, ex.: cadastrar um feriado novo no meio
// da obra, sem precisar reenviar o XML). Antes vivia só num popover dentro de
// CurvaSPesoView.tsx — a tela de resultado ficou só com o resumo em texto.
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  loadCurvaSConfig,
  saveCurvaSConfig,
  loadCurvaSFeriados,
  addCurvaSFeriado,
  removeCurvaSFeriado,
  type CurvaSFeriado,
} from '@/lib/curva-s-config-store'
import { CURVA_S_CONFIG_PADRAO, DIAS_SEMANA, type CurvaSConfig } from '@/lib/curva-s-peso'
import { useAuth } from '@/lib/auth-context'

interface Props {
  projetoId: string
}

export function CurvaSConfigPanel({ projetoId }: Props) {
  const { userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const [config, setConfig] = useState<CurvaSConfig>(CURVA_S_CONFIG_PADRAO)
  const [feriados, setFeriados] = useState<CurvaSFeriado[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [novoFeriadoData, setNovoFeriadoData] = useState('')
  const [novoFeriadoDescricao, setNovoFeriadoDescricao] = useState('')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    Promise.all([loadCurvaSConfig(projetoId), loadCurvaSFeriados(projetoId)])
      .then(([cfg, fer]) => {
        if (cancelado) return
        setConfig(cfg)
        setFeriados(fer)
      })
      .catch((err) => {
        console.error('[CurvaSConfigPanel] Falha ao carregar configuração:', err)
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => { cancelado = true }
  }, [projetoId])

  const handleSaveConfig = async (next: CurvaSConfig) => {
    if (!organizacaoId) return
    setSaving(true)
    try {
      await saveCurvaSConfig(projetoId, organizacaoId, next)
      setConfig(next)
    } catch (err) {
      console.error('[CurvaSConfigPanel] Falha ao salvar configuração:', err)
      toast.error('Não foi possível salvar a configuração.', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleAddFeriado = async () => {
    if (!novoFeriadoData || !organizacaoId) return
    try {
      await addCurvaSFeriado(projetoId, organizacaoId, novoFeriadoData, novoFeriadoDescricao)
      const atualizados = await loadCurvaSFeriados(projetoId)
      setFeriados(atualizados)
      setNovoFeriadoData('')
      setNovoFeriadoDescricao('')
    } catch (err) {
      console.error('[CurvaSConfigPanel] Falha ao adicionar feriado:', err)
      toast.error('Não foi possível adicionar o feriado.', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleRemoveFeriado = async (id: string) => {
    try {
      await removeCurvaSFeriado(id)
      setFeriados((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      console.error('[CurvaSConfigPanel] Falha ao remover feriado:', err)
      toast.error('Não foi possível remover o feriado.', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Carregando configuração da Curva S...</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Dia de corte semanal</span>
          <select
            value={config.diaCorteSemana}
            onChange={(e) => handleSaveConfig({ ...config, diaCorteSemana: Number(e.target.value) })}
            disabled={saving}
            className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {DIAS_SEMANA.map((nome, i) => (
              <option key={i} value={i}>{nome}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Dia de folga semanal</span>
          <select
            value={config.diaFolgaSemanal}
            onChange={(e) => handleSaveConfig({ ...config, diaFolgaSemanal: Number(e.target.value) })}
            disabled={saving}
            className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {DIAS_SEMANA.map((nome, i) => (
              <option key={i} value={i}>{nome}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Excluído da contagem de dias úteis do avanço.</p>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Feriados</span>
        <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
          {feriados.length === 0 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Nenhum feriado cadastrado.</p>
          )}
          {feriados.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-200">
              <span className="truncate">
                {new Date(`${f.data}T00:00:00`).toLocaleDateString('pt-BR')}
                {f.descricao && <span className="text-gray-400 dark:text-gray-500"> — {f.descricao}</span>}
              </span>
              <button onClick={() => handleRemoveFeriado(f.id)} className="shrink-0 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 size={12} className="text-gray-300 dark:text-gray-600 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={novoFeriadoData}
            onChange={(e) => setNovoFeriadoData(e.target.value)}
            className="flex-1 min-w-0 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          />
          <input
            type="text"
            placeholder="Descrição"
            value={novoFeriadoDescricao}
            onChange={(e) => setNovoFeriadoDescricao(e.target.value)}
            className="flex-1 min-w-0 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          />
          <button
            onClick={handleAddFeriado}
            disabled={!novoFeriadoData}
            className="shrink-0 p-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
