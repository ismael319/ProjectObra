import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { X, Loader2, ChevronDown, ChevronRight, Save, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, type PapelUsuario } from '@/lib/auth-context'
import UserApprovalManagement from '@/pages/UserApprovalManagement'

interface PlanoRow {
  id: string
  nome: string
}

interface PlanoAtualRow {
  id: string
  plano_id: string
  status: string
}

const PLANO_STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

interface ModuloRow {
  key: string
  nome: string
}

interface OrganizacaoRow {
  id: string
  nome: string
  is_piloto: boolean
  ativo: boolean
  criado_em: string
}

interface MembroRow {
  id: string
  email: string | null
  papel: PapelUsuario | null
  funcao: string | null
}

const PAPEL_LABELS: Record<PapelUsuario, string> = {
  edicao: 'Edição',
  visualizacao: 'Visualização',
  insercao_pontual: 'Inserção Pontual',
}

interface Props {
  organizacao: OrganizacaoRow
  modulosCatalogo: ModuloRow[]
  modulosAtivos: Set<string>
  togglingModulo: string | null
  onToggleModulo: (moduloKey: string, ativoAtualmente: boolean) => void
  onClose: () => void
}

export default function OrganizacaoDetailModal({
  organizacao,
  modulosCatalogo,
  modulosAtivos,
  togglingModulo,
  onToggleModulo,
  onClose,
}: Props) {
  const { user } = useAuth()

  const [nomeAtual, setNomeAtual] = useState(organizacao.nome)
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeEditado, setNomeEditado] = useState(organizacao.nome)
  const [salvandoNome, setSalvandoNome] = useState(false)

  const [planosCatalogo, setPlanosCatalogo] = useState<PlanoRow[]>([])
  const [planoAtual, setPlanoAtual] = useState<PlanoAtualRow | null>(null)
  const [isLoadingPlano, setIsLoadingPlano] = useState(true)
  const [salvandoPlano, setSalvandoPlano] = useState(false)

  const [membros, setMembros] = useState<MembroRow[]>([])
  const [isLoadingMembros, setIsLoadingMembros] = useState(true)
  const [savingPapelId, setSavingPapelId] = useState<string | null>(null)

  const [expandedMembroId, setExpandedMembroId] = useState<string | null>(null)
  // null = sem restrição (vê todos os módulos contratados); Set = allowlist explícita
  const [modulosVisiveis, setModulosVisiveis] = useState<Record<string, Set<string> | null>>({})
  const [savingModulosId, setSavingModulosId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setIsLoadingMembros(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, papel, funcao')
      .eq('organizacao_id', organizacao.id)
      .eq('status_solicitacao', 'aprovado')
      .order('email')

    if (error) {
      toast.error(`Erro ao carregar membros: ${error.message}`)
      setIsLoadingMembros(false)
      return
    }
    const membrosCarregados = (data as MembroRow[]) ?? []
    setMembros(membrosCarregados)

    if (membrosCarregados.length > 0) {
      const { data: restricoes, error: erroRestricoes } = await supabase
        .from('user_modulos_visiveis')
        .select('user_id, modulo_key')
        .in('user_id', membrosCarregados.map((m) => m.id))

      if (!erroRestricoes) {
        const porUsuario: Record<string, Set<string> | null> = {}
        for (const m of membrosCarregados) porUsuario[m.id] = null
        for (const r of (restricoes ?? []) as { user_id: string; modulo_key: string }[]) {
          if (!porUsuario[r.user_id]) porUsuario[r.user_id] = new Set()
          porUsuario[r.user_id]!.add(r.modulo_key)
        }
        setModulosVisiveis(porUsuario)
      }
    }
    setIsLoadingMembros(false)
  }, [organizacao.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const carregarPlano = useCallback(async () => {
    setIsLoadingPlano(true)
    const [planosRes, atualRes] = await Promise.all([
      supabase.from('planos').select('id, nome').eq('status', 'ativo').order('ordem_exibicao'),
      supabase
        .from('organizacao_planos')
        .select('id, plano_id, status')
        .eq('organizacao_id', organizacao.id)
        .is('data_fim', null)
        .maybeSingle(),
    ])
    if (!planosRes.error) setPlanosCatalogo((planosRes.data as PlanoRow[]) ?? [])
    if (!atualRes.error) setPlanoAtual((atualRes.data as PlanoAtualRow | null) ?? null)
    setIsLoadingPlano(false)
  }, [organizacao.id])

  useEffect(() => {
    carregarPlano()
  }, [carregarPlano])

  const handleSalvarNome = async () => {
    const novoNome = nomeEditado.trim()
    if (!novoNome || novoNome === nomeAtual) {
      setEditandoNome(false)
      setNomeEditado(nomeAtual)
      return
    }
    setSalvandoNome(true)
    const { error } = await supabase.from('organizacoes').update({ nome: novoNome }).eq('id', organizacao.id)
    if (error) {
      toast.error(`Não foi possível renomear a empresa: ${error.message}`)
    } else {
      toast.success('Nome da empresa atualizado')
      setNomeAtual(novoNome)
      setEditandoNome(false)
    }
    setSalvandoNome(false)
  }

  const handleTrocarPlano = async (novoPlanoId: string) => {
    setSalvandoPlano(true)
    const hoje = new Date().toISOString().slice(0, 10)
    let ok = true

    if (planoAtual) {
      const { error } = await supabase.from('organizacao_planos').update({ data_fim: hoje }).eq('id', planoAtual.id)
      if (error) {
        toast.error(`Não foi possível trocar o pacote: ${error.message}`)
        ok = false
      }
    }

    if (ok && novoPlanoId) {
      const { error } = await supabase
        .from('organizacao_planos')
        .insert({ organizacao_id: organizacao.id, plano_id: novoPlanoId, status: 'ativo' })
      if (error) {
        toast.error(`Não foi possível atribuir o pacote: ${error.message}`)
        ok = false
      }
    }

    if (ok) toast.success(novoPlanoId ? 'Pacote atualizado' : 'Pacote removido')
    await carregarPlano()
    setSalvandoPlano(false)
  }

  const handleTrocarPapel = async (membro: MembroRow, papel: PapelUsuario) => {
    setSavingPapelId(membro.id)
    const { error } = await supabase.from('user_profiles').update({ papel }).eq('id', membro.id)
    if (error) {
      toast.error(`Não foi possível trocar o nível de acesso: ${error.message}`)
    } else {
      toast.success(`${membro.email ?? 'Usuário'} agora é ${PAPEL_LABELS[papel]}`)
      setMembros((prev) => prev.map((m) => (m.id === membro.id ? { ...m, papel } : m)))
    }
    setSavingPapelId(null)
  }

  const modulosContratados = modulosCatalogo.filter((m) => modulosAtivos.has(m.key))

  const toggleModuloVisivel = (membroId: string, moduloKey: string) => {
    setModulosVisiveis((prev) => {
      const atual = prev[membroId]
      // Primeira vez que mexe: parte de "todos os contratados marcados" (o
      // estado implícito de "sem restrição"), não de um Set vazio.
      const proximo = atual === null || atual === undefined
        ? new Set(modulosContratados.map((m) => m.key))
        : new Set(atual)
      if (proximo.has(moduloKey)) proximo.delete(moduloKey)
      else proximo.add(moduloKey)
      return { ...prev, [membroId]: proximo }
    })
  }

  const handleSalvarModulosVisiveis = async (membroId: string) => {
    const escolhidos = modulosVisiveis[membroId]
    if (escolhidos && escolhidos.size === 0) {
      toast.error('Marque pelo menos um módulo, ou desmarque a restrição inteira.')
      return
    }
    setSavingModulosId(membroId)

    const semRestricao = escolhidos === null || escolhidos === undefined || escolhidos.size === modulosContratados.length

    const { error: erroDelete } = await supabase.from('user_modulos_visiveis').delete().eq('user_id', membroId)
    if (erroDelete) {
      toast.error(`Não foi possível salvar: ${erroDelete.message}`)
      setSavingModulosId(null)
      return
    }

    if (!semRestricao) {
      const { error: erroInsert } = await supabase.from('user_modulos_visiveis').insert(
        [...escolhidos].map((moduloKey) => ({ user_id: membroId, modulo_key: moduloKey, restringido_por: user?.id }))
      )
      if (erroInsert) {
        toast.error(`Não foi possível salvar: ${erroInsert.message}`)
        setSavingModulosId(null)
        return
      }
    }

    setModulosVisiveis((prev) => ({ ...prev, [membroId]: semRestricao ? null : escolhidos }))
    toast.success('Módulos visíveis atualizados')
    setSavingModulosId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div className="min-w-0">
            {editandoNome ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nomeEditado}
                  disabled={salvandoNome}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSalvarNome()
                    if (e.key === 'Escape') { setEditandoNome(false); setNomeEditado(nomeAtual) }
                  }}
                  className="text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-blue-400 focus:outline-none"
                />
                <button onClick={handleSalvarNome} disabled={salvandoNome} className="text-blue-600 hover:text-blue-700 disabled:opacity-50 p-1">
                  {salvandoNome ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                </button>
                <button
                  onClick={() => { setEditandoNome(false); setNomeEditado(nomeAtual) }}
                  disabled={salvandoNome}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditandoNome(true)} className="flex items-center gap-2 group min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{nomeAtual}</h2>
                <Pencil size={14} className="shrink-0 text-gray-300 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
              </button>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Módulos, membros e acesso · {isLoadingMembros ? '…' : `${membros.length} usuário${membros.length !== 1 ? 's' : ''} ativo${membros.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 shrink-0">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Pacote contratado */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Pacote contratado
            </h3>
            {isLoadingPlano ? (
              <div className="flex items-center py-2">
                <Loader2 className="animate-spin text-blue-600" size={18} />
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={planoAtual?.plano_id ?? ''}
                  disabled={salvandoPlano}
                  onChange={(e) => handleTrocarPlano(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-2 py-1.5"
                >
                  <option value="">Nenhum pacote</option>
                  {planosCatalogo.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                {planoAtual && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Status: {PLANO_STATUS_LABELS[planoAtual.status] ?? planoAtual.status}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Módulos contratados */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Módulos contratados
            </h3>
            {modulosCatalogo.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum módulo no catálogo.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {modulosCatalogo.map((m) => {
                  const ativo = modulosAtivos.has(m.key)
                  const toggling = togglingModulo === m.key
                  return (
                    <label key={m.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ativo}
                        disabled={toggling}
                        onChange={() => onToggleModulo(m.key, ativo)}
                        className="w-4 h-4"
                      />
                      {m.nome}
                    </label>
                  )
                })}
              </div>
            )}
          </section>

          {/* Membros */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Membros
            </h3>
            {isLoadingMembros ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-blue-600" size={24} />
              </div>
            ) : membros.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Nenhum membro aprovado nessa empresa ainda.</p>
            ) : (
              <div className="space-y-2">
                {membros.map((membro) => {
                  const expanded = expandedMembroId === membro.id
                  const restricao = modulosVisiveis[membro.id]
                  const semRestricao = restricao === null || restricao === undefined
                  return (
                    <div key={membro.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <button
                          onClick={() => setExpandedMembroId(expanded ? null : membro.id)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          {expanded ? <ChevronDown size={14} className="shrink-0 text-gray-400 dark:text-gray-500" /> : <ChevronRight size={14} className="shrink-0 text-gray-400 dark:text-gray-500" />}
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{membro.email ?? membro.id}</span>
                            {membro.funcao && (
                              <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{membro.funcao}</span>
                            )}
                          </span>
                          {semRestricao ? (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">todos os módulos</span>
                          ) : (
                            <span className="text-[11px] text-blue-600 dark:text-blue-400 shrink-0">{restricao!.size} módulo(s)</span>
                          )}
                        </button>
                        <select
                          value={membro.papel ?? ''}
                          disabled={savingPapelId === membro.id}
                          onChange={(e) => handleTrocarPapel(membro, e.target.value as PapelUsuario)}
                          className="text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-2 py-1.5 shrink-0"
                        >
                          {(Object.keys(PAPEL_LABELS) as PapelUsuario[]).map((p) => (
                            <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
                          ))}
                        </select>
                      </div>

                      {expanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
                          {modulosContratados.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
                              Essa empresa não tem módulos contratados ainda.
                            </p>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-3 py-2">
                                {modulosContratados.map((m) => {
                                  const checked = semRestricao ? true : restricao!.has(m.key)
                                  return (
                                    <label key={m.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleModuloVisivel(membro.id, m.key)}
                                        className="w-3.5 h-3.5"
                                      />
                                      {m.nome}
                                    </label>
                                  )
                                })}
                              </div>
                              <button
                                onClick={() => handleSalvarModulosVisiveis(membro.id)}
                                disabled={savingModulosId === membro.id}
                                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                              >
                                <Save size={12} /> Salvar módulos visíveis
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Solicitações pendentes, histórico e convites — igual ao que a
              própria empresa vê em Gestão de Usuários, só que o Dono pode
              abrir de qualquer empresa daqui, não só a que ele mesmo pertence. */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Solicitações e convites
            </h3>
            <UserApprovalManagement
              organizacaoId={organizacao.id}
              organizacaoPiloto={organizacao.is_piloto}
              embedded
              onAlterado={carregar}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
