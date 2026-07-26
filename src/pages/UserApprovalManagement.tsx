import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { UserCog, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, type PapelUsuario } from '@/lib/auth-context'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface SolicitacaoRow {
  id: string
  email: string | null
  papel: PapelUsuario | null
  status_solicitacao: 'pendente' | 'aprovado' | 'rejeitado'
  criado_em: string
}

const PAPEL_LABELS: Record<PapelUsuario, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  engenheiro: 'Engenheiro',
  campo: 'Campo (apontador)',
}

function statusBadge(status: SolicitacaoRow['status_solicitacao']) {
  if (status === 'aprovado') return <Badge variant="secondary">Aprovado</Badge>
  if (status === 'rejeitado') return <Badge variant="destructive">Rejeitado</Badge>
  return <Badge variant="outline">Pendente</Badge>
}

export default function UserApprovalManagement() {
  const { userProfile } = useAuth()
  const isAdmin = userProfile?.papel === 'admin'
  const isGestor = userProfile?.papel === 'gestor'
  const papeisDisponiveis: PapelUsuario[] = isAdmin
    ? ['admin', 'gestor', 'engenheiro', 'campo']
    : ['gestor', 'engenheiro', 'campo']

  const [tab, setTab] = useState<'pendentes' | 'historico'>('pendentes')
  const [rows, setRows] = useState<SolicitacaoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPapel, setSelectedPapel] = useState<Record<string, PapelUsuario>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const query = supabase
      .from('user_profiles')
      .select('id, email, papel, status_solicitacao, criado_em')
      .order('criado_em', { ascending: false })

    const { data, error } = tab === 'pendentes'
      ? await query.eq('status_solicitacao', 'pendente')
      : await query.neq('status_solicitacao', 'pendente')

    if (error) {
      toast.error('Erro ao carregar solicitações')
    } else {
      setRows((data as SolicitacaoRow[]) ?? [])
    }
    setIsLoading(false)
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const handleAprovar = async (row: SolicitacaoRow) => {
    const papel = selectedPapel[row.id] ?? papeisDisponiveis[0]
    setProcessingId(row.id)
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ papel, status_solicitacao: 'aprovado' })
      .eq('id', row.id)
      .select('id')

    if (error) {
      toast.error(`Não foi possível aprovar: ${error.message}`)
    } else if (!data || data.length === 0) {
      toast.error('Esta solicitação já foi decidida por outra pessoa.')
    } else {
      toast.success(`${row.email ?? 'Usuário'} aprovado como ${PAPEL_LABELS[papel]}`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    }
    setProcessingId(null)
  }

  const handleRejeitar = async (row: SolicitacaoRow) => {
    setProcessingId(row.id)
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ status_solicitacao: 'rejeitado' })
      .eq('id', row.id)
      .select('id')

    if (error) {
      toast.error(`Não foi possível rejeitar: ${error.message}`)
    } else if (!data || data.length === 0) {
      toast.error('Esta solicitação já foi decidida por outra pessoa.')
    } else {
      toast.success(`Solicitação de ${row.email ?? 'usuário'} rejeitada`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    }
    setProcessingId(null)
  }

  if (!isAdmin && !isGestor) {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-gray-500 dark:text-gray-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="text-gray-500 dark:text-gray-400" size={24} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Usuários</h1>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pendentes')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'pendentes' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'
          }`}
        >
          Pendentes
        </button>
        <button
          onClick={() => setTab('historico')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'historico' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'
          }`}
        >
          Histórico
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Solicitado em</TableHead>
              <TableHead>Status</TableHead>
              {tab === 'pendentes' && <TableHead>Papel</TableHead>}
              {tab === 'pendentes' && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-6">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-6">
                  Nenhuma solicitação {tab === 'pendentes' ? 'pendente' : 'no histórico'}.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.email ?? '—'}</TableCell>
                <TableCell>{new Date(row.criado_em).toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  {tab === 'pendentes' ? statusBadge(row.status_solicitacao) : (
                    <div className="flex items-center gap-2">
                      {statusBadge(row.status_solicitacao)}
                      {row.papel && <span className="text-xs text-gray-500">{PAPEL_LABELS[row.papel]}</span>}
                    </div>
                  )}
                </TableCell>
                {tab === 'pendentes' && (
                  <TableCell>
                    <select
                      value={selectedPapel[row.id] ?? papeisDisponiveis[0]}
                      onChange={(e) =>
                        setSelectedPapel((prev) => ({ ...prev, [row.id]: e.target.value as PapelUsuario }))
                      }
                      className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {papeisDisponiveis.map((papel) => (
                        <option key={papel} value={papel}>
                          {PAPEL_LABELS[papel]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                )}
                {tab === 'pendentes' && (
                  <TableCell className="text-right">
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
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
