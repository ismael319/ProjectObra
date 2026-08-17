import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { UserCog, Check, X, Send, Trash2, Pencil, Save, Loader2, Settings2, FolderKanban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { enviarConviteEmail } from '@/lib/convite-email'
import { useAuth, usePapelModulo, type PapelUsuario } from '@/lib/auth-context'
import PapelPorModuloModal from '@/components/PapelPorModuloModal'
import EscopoObrasModal from '@/components/EscopoObrasModal'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface SolicitacaoRow {
  id: string
  email: string | null
  nome: string | null
  papel: PapelUsuario | null
  funcao: string | null
  status_solicitacao: 'pendente' | 'aprovado' | 'rejeitado'
  criado_em: string
}

interface ConviteRow {
  id: string
  email: string
  papel_convidado: PapelUsuario
  criado_em: string
}

export const PAPEL_LABELS: Record<PapelUsuario, string> = {
  edicao: 'Edição',
  visualizacao: 'Visualização',
  insercao_pontual: 'Inserção Pontual',
}

function statusBadge(status: SolicitacaoRow['status_solicitacao']) {
  if (status === 'aprovado') return <Badge variant="secondary">Aprovado</Badge>
  if (status === 'rejeitado') return <Badge variant="destructive">Rejeitado</Badge>
  return <Badge variant="outline">Pendente</Badge>
}

interface Props {
  // Ausente = modo autônomo (rota /dashboard/admin/users): opera na própria
  // empresa do usuário logado, com a checagem normal de papel === 'edicao'.
  // Presente = embutido no "Gerenciar" de uma empresa (Dono da Plataforma
  // gerindo QUALQUER empresa, não só a própria) — a permissão já foi
  // conferida lá fora (isSuperAdmin em OrganizacoesManagement).
  organizacaoId?: string
  organizacaoPiloto?: boolean
  embedded?: boolean
  // Chamado depois de aprovar/rejeitar/editar uma solicitação — deixa quem
  // embute este componente (ex.: o modal de empresa) atualizar sua própria
  // lista de membros sem precisar fechar/reabrir.
  onAlterado?: () => void
}

export default function UserApprovalManagement({ organizacaoId, organizacaoPiloto, embedded = false, onAlterado }: Props = {}) {
  const { user, userProfile } = useAuth()
  const orgAlvo = organizacaoId ?? userProfile?.organizacao_id ?? null
  // "insercao_pontual" só faz sentido na empresa piloto por enquanto — a tela
  // de lançamento (única que esse papel acessa) ainda não é isolada por
  // empresa. E solicitações "órfãs" (sem organizacao_id, de antes do convite
  // por email existir) só aparecem pra quem administra a empresa piloto.
  const orgPiloto = organizacaoId !== undefined ? (organizacaoPiloto ?? false) : (userProfile?.organizacao_piloto ?? false)
  // Papel efetivo NO módulo "sistema" (override, se existir, senão o global)
  // — permite dar a alguém edicao só aqui, sem soltar edicao no resto.
  const { podeEditar: podeEditarSistema } = usePapelModulo('sistema')
  const podeGerenciar = organizacaoId !== undefined ? true : podeEditarSistema || userProfile?.is_super_admin === true
  const papeisBase: PapelUsuario[] = ['edicao', 'visualizacao', 'insercao_pontual']
  const papeisDisponiveis = orgPiloto ? papeisBase : papeisBase.filter((p) => p !== 'insercao_pontual')

  const [tab, setTab] = useState<'pendentes' | 'historico' | 'convidar'>('pendentes')
  const [rows, setRows] = useState<SolicitacaoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPapel, setSelectedPapel] = useState<Record<string, PapelUsuario>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPapel, setEditPapel] = useState<PapelUsuario>('edicao')
  const [editStatus, setEditStatus] = useState<'aprovado' | 'rejeitado'>('aprovado')

  const [convites, setConvites] = useState<ConviteRow[]>([])
  const [isLoadingConvites, setIsLoadingConvites] = useState(true)
  const [conviteEmail, setConviteEmail] = useState('')
  const [convitePapel, setConvitePapel] = useState<PapelUsuario>(papeisDisponiveis[0])
  const [isSendingConvite, setIsSendingConvite] = useState(false)

  const [excluirAlvo, setExcluirAlvo] = useState<SolicitacaoRow | null>(null)
  const [excluirConfirm, setExcluirConfirm] = useState('')
  const [isExcluindo, setIsExcluindo] = useState(false)

  const [papelModuloAlvo, setPapelModuloAlvo] = useState<SolicitacaoRow | null>(null)
  const [escopoObrasAlvo, setEscopoObrasAlvo] = useState<SolicitacaoRow | null>(null)

  const load = useCallback(async () => {
    if (!orgAlvo) return

    if (tab === 'convidar') {
      setIsLoadingConvites(true)
      const { data, error } = await supabase
        .from('convites')
        .select('id, email, papel_convidado, criado_em')
        .eq('organizacao_id', orgAlvo)
        .is('usado_em', null)
        .is('revogado_em', null)
        .gt('expira_em', new Date().toISOString())
        .order('criado_em', { ascending: false })

      if (error) {
        toast.error('Erro ao carregar convites')
      } else {
        setConvites((data as ConviteRow[]) ?? [])
      }
      setIsLoadingConvites(false)
      return
    }

    setIsLoading(true)
    let query = supabase
      .from('user_profiles')
      .select('id, email, nome, papel, funcao, status_solicitacao, criado_em')
      .order('criado_em', { ascending: false })

    if (tab === 'pendentes') {
      query = query.eq('status_solicitacao', 'pendente')
      // Solicitações órfãs (organizacao_id nulo, de antes do sistema de
      // convites) só aparecem pra quem cuida da empresa piloto.
      query = orgPiloto ? query.or(`organizacao_id.eq.${orgAlvo},organizacao_id.is.null`) : query.eq('organizacao_id', orgAlvo)
    } else {
      query = query.neq('status_solicitacao', 'pendente').eq('organizacao_id', orgAlvo)
    }

    const { data, error } = await query

    if (error) {
      toast.error('Erro ao carregar solicitações')
    } else {
      setRows((data as SolicitacaoRow[]) ?? [])
    }
    setIsLoading(false)
  }, [tab, orgAlvo, orgPiloto])

  useEffect(() => {
    load()
  }, [load])

  const handleAprovar = async (row: SolicitacaoRow) => {
    if (!orgAlvo) return
    const papel = selectedPapel[row.id] ?? papeisDisponiveis[0]
    setProcessingId(row.id)
    const { error } = await supabase.rpc('gerenciar_usuario', {
      p_usuario_id: row.id,
      p_status: 'aprovado',
      p_papel: papel,
      p_nome: row.nome,
    })

    if (error) {
      toast.error(`Não foi possível aprovar: ${error.message}`)
    } else {
      toast.success(`${row.email ?? 'Usuário'} aprovado como ${PAPEL_LABELS[papel]}`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      onAlterado?.()
    }
    setProcessingId(null)
  }

  const handleConvidar = async () => {
    if (!conviteEmail.trim() || !orgAlvo) return
    setIsSendingConvite(true)
    const { data, error } = await supabase.rpc('criar_convite', {
      p_email: conviteEmail.trim(),
      p_papel: convitePapel,
      p_organizacao_id: orgAlvo,
    })
    const convite = Array.isArray(data) ? data[0] : data

    if (error) {
      toast.error(`Não foi possível criar o convite: ${error.message}`)
      setIsSendingConvite(false)
      return
    }

    try {
      await enviarConviteEmail({
        conviteId: convite.id,
        token: convite.token,
      })
      toast.success(`Convite enviado para ${conviteEmail.trim()}.`)
    } catch (emailError) {
      toast.warning(
        `Convite criado, mas o email não pôde ser enviado agora: ${(emailError as Error).message}`,
      )
    }

    setConviteEmail('')
    load()
    setIsSendingConvite(false)
  }

  const handleCancelarConvite = async (convite: ConviteRow) => {
    const { error } = await supabase.rpc('revogar_convite', { p_convite_id: convite.id })
    if (error) {
      toast.error(`Não foi possível cancelar: ${error.message}`)
    } else {
      toast.success(`Convite de ${convite.email} cancelado`)
      setConvites((prev) => prev.filter((c) => c.id !== convite.id))
    }
  }

  const handleExcluir = async (row: SolicitacaoRow) => {
    if (!excluirAlvo || excluirConfirm.toLowerCase() !== (excluirAlvo.email ?? '').toLowerCase()) return
    setIsExcluindo(true)
    const { error } = await supabase.rpc('excluir_usuario', { usuario_id: row.id })

    if (error) {
      toast.error(`Não foi possível excluir: ${error.message}`)
    } else {
      toast.success(`Conta de ${row.email ?? 'usuário'} excluída`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setExcluirAlvo(null)
      setExcluirConfirm('')
      onAlterado?.()
    }
    setIsExcluindo(false)
  }

  const handleRejeitar = async (row: SolicitacaoRow) => {
    setProcessingId(row.id)
    const { error } = await supabase.rpc('gerenciar_usuario', {
      p_usuario_id: row.id,
      p_status: 'rejeitado',
      p_papel: null,
      p_nome: row.nome,
    })

    if (error) {
      toast.error(`Não foi possível rejeitar: ${error.message}`)
    } else {
      toast.success(`Solicitação de ${row.email ?? 'usuário'} rejeitada`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      onAlterado?.()
    }
    setProcessingId(null)
  }

  const startEdit = (row: SolicitacaoRow) => {
    setEditingId(row.id)
    setEditNome(row.nome ?? '')
    setEditPapel(row.papel ?? papeisDisponiveis[0])
    setEditStatus(row.status_solicitacao === 'rejeitado' ? 'rejeitado' : 'aprovado')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditNome('')
  }

  const handleSalvarEdicao = async (row: SolicitacaoRow) => {
    setProcessingId(row.id)
    // A constraint do banco exige papel=NULL quando não está aprovado — ao
    // revogar o acesso (rejeitado), o papel some junto.
    const patch: { status_solicitacao: 'aprovado' | 'rejeitado'; papel: PapelUsuario | null; nome: string | null } =
      editStatus === 'aprovado'
        ? { status_solicitacao: 'aprovado', papel: editPapel, nome: editNome.trim() || null }
        : { status_solicitacao: 'rejeitado', papel: null, nome: editNome.trim() || null }

    const { error } = await supabase.rpc('gerenciar_usuario', {
      p_usuario_id: row.id,
      p_status: patch.status_solicitacao,
      p_papel: patch.papel,
      p_nome: patch.nome,
    })

    if (error) {
      toast.error(`Não foi possível salvar: ${error.message}`)
    } else {
      toast.success(`${row.email ?? 'Usuário'} atualizado`)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
      setEditingId(null)
      onAlterado?.()
    }
    setProcessingId(null)
  }

  if (!podeGerenciar) {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-gray-500 dark:text-gray-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : 'max-w-4xl mx-auto space-y-6'}>
      {!embedded && (
        <div className="flex items-center gap-3">
          <UserCog className="text-gray-500 dark:text-gray-400" size={24} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Usuários</h1>
        </div>
      )}

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pendentes')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'pendentes' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Pendentes
        </button>
        <button
          onClick={() => setTab('historico')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'historico' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Histórico
        </button>
        <button
          onClick={() => setTab('convidar')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'convidar' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Convidar
        </button>
      </div>

      {tab === 'convidar' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Convide alguém da sua equipe por email. Um email com o convite chega no endereço informado, e a
              pessoa entra automaticamente aprovada, já no papel escolhido, assim que criar a conta em
              <span className="font-mono">/signup</span> usando exatamente esse email — sem precisar de aprovação
              manual depois.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={conviteEmail}
                onChange={(e) => setConviteEmail(e.target.value)}
                className="flex-1"
              />
              <select
                value={convitePapel}
                onChange={(e) => setConvitePapel(e.target.value as PapelUsuario)}
                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm"
              >
                {papeisDisponiveis.map((papel) => (
                  <option key={papel} value={papel}>
                    {PAPEL_LABELS[papel]}
                  </option>
                ))}
              </select>
              <Button onClick={handleConvidar} disabled={isSendingConvite || !conviteEmail.trim()}>
                <Send size={14} /> Convidar
              </Button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email convidado</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingConvites && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 dark:text-gray-500 py-6">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoadingConvites && convites.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 dark:text-gray-500 py-6">Nenhum convite pendente.</TableCell>
                  </TableRow>
                )}
                {convites.map((convite) => (
                  <TableRow key={convite.id}>
                    <TableCell className="font-medium">{convite.email}</TableCell>
                    <TableCell>{PAPEL_LABELS[convite.papel_convidado]}</TableCell>
                    <TableCell>{new Date(convite.criado_em).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleCancelarConvite(convite)}>
                        <Trash2 size={14} /> Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Solicitado em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 dark:text-gray-500 py-6">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 dark:text-gray-500 py-6">
                  Nenhuma solicitação {tab === 'pendentes' ? 'pendente' : 'no histórico'}.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const isEditing = tab === 'historico' && editingId === row.id
              const isSelf = row.id === user?.id
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {isEditing ? (
                      <Input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        placeholder="Nome do usuário"
                        className="w-44 text-sm"
                      />
                    ) : (
                      <>
                        {row.nome ? (
                          <span className="block">{row.nome}</span>
                        ) : null}
                        <span className={row.nome ? 'block text-xs font-normal text-gray-400 dark:text-gray-500' : ''}>
                          {row.email ?? '—'}
                        </span>
                      </>
                    )}
                    {!isEditing && row.funcao && (
                      <span className="block text-xs font-normal text-gray-400 dark:text-gray-500">{row.funcao}</span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(row.criado_em).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as 'aprovado' | 'rejeitado')}
                        className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="aprovado">Aprovado</option>
                        <option value="rejeitado">Rejeitado (revoga acesso)</option>
                      </select>
                    ) : (
                      statusBadge(row.status_solicitacao)
                    )}
                  </TableCell>
                  <TableCell>
                    {tab === 'pendentes' ? (
                      <select
                        value={selectedPapel[row.id] ?? papeisDisponiveis[0]}
                        onChange={(e) =>
                          setSelectedPapel((prev) => ({ ...prev, [row.id]: e.target.value as PapelUsuario }))
                        }
                        className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-sm"
                      >
                        {papeisDisponiveis.map((papel) => (
                          <option key={papel} value={papel}>
                            {PAPEL_LABELS[papel]}
                          </option>
                        ))}
                      </select>
                    ) : isEditing && editStatus === 'aprovado' ? (
                      <select
                        value={editPapel}
                        onChange={(e) => setEditPapel(e.target.value as PapelUsuario)}
                        className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-sm"
                      >
                        {papeisDisponiveis.map((papel) => (
                          <option key={papel} value={papel}>
                            {PAPEL_LABELS[papel]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.papel && <span className="text-xs text-gray-500 dark:text-gray-400">{PAPEL_LABELS[row.papel]}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {tab === 'pendentes' ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={processingId === row.id}
                          onClick={() => handleAprovar(row)}
                        >
                          <Check size={14} /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={processingId === row.id}
                          onClick={() => handleRejeitar(row)}
                        >
                          <X size={14} /> Rejeitar
                        </Button>
                      </div>
                    ) : isEditing ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="default" disabled={processingId === row.id} onClick={() => handleSalvarEdicao(row)}>
                          <Save size={14} /> Salvar
                        </Button>
                        <Button size="sm" variant="outline" disabled={processingId === row.id} onClick={cancelEdit}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {row.status_solicitacao === 'aprovado' && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Definir as obras que este usuário pode acessar"
                            onClick={() => setEscopoObrasAlvo(row)}
                          >
                            <FolderKanban size={14} /> Obras
                          </Button>
                        )}
                        {row.status_solicitacao === 'aprovado' && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Configurar um papel diferente do padrão em módulos específicos"
                            onClick={() => setPapelModuloAlvo(row)}
                          >
                            <Settings2 size={14} /> Papéis por módulo
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSelf}
                          title={isSelf ? 'Não é permitido editar a própria solicitação' : undefined}
                          onClick={() => startEdit(row)}
                        >
                          <Pencil size={14} /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:border-red-300 disabled:opacity-40"
                          disabled={isSelf}
                          title={isSelf ? 'Não é possível excluir a própria conta' : 'Excluir usuário permanentemente'}
                          onClick={() => {
                            setExcluirConfirm('')
                            setExcluirAlvo(row)
                          }}
                        >
                          <Trash2 size={14} /> Excluir
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      )}

      <AlertDialog open={!!excluirAlvo} onOpenChange={(o) => !o && setExcluirAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta de <strong>{excluirAlvo?.email}</strong> será excluída definitivamente: login, perfil e
              permissões. Apontamentos, registros e demais dados de trabalho são preservados, mas o autor
              fica em branco. Esta ação não pode ser desfeita.
              <br />
              <br />
              Digite o email do usuário para confirmar:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={excluirConfirm}
            onChange={(e) => setExcluirConfirm(e.target.value)}
            placeholder={excluirAlvo?.email ?? ''}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExcluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                excluirConfirm.toLowerCase() !== (excluirAlvo?.email ?? '').toLowerCase() || isExcluindo
              }
              onClick={() => excluirAlvo && handleExcluir(excluirAlvo)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isExcluindo ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Excluindo...
                </>
              ) : (
                'Excluir permanentemente'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {papelModuloAlvo && orgAlvo && (
        <PapelPorModuloModal
          open={!!papelModuloAlvo}
          onOpenChange={(o) => !o && setPapelModuloAlvo(null)}
          usuarioId={papelModuloAlvo.id}
          usuarioEmail={papelModuloAlvo.email}
          papelGlobal={papelModuloAlvo.papel}
          organizacaoId={orgAlvo}
        />
      )}
      {escopoObrasAlvo && orgAlvo && (
        <EscopoObrasModal
          open={!!escopoObrasAlvo}
          onOpenChange={(o) => !o && setEscopoObrasAlvo(null)}
          usuarioId={escopoObrasAlvo.id}
          usuarioEmail={escopoObrasAlvo.email}
          organizacaoId={orgAlvo}
        />
      )}
    </div>
  )
}
