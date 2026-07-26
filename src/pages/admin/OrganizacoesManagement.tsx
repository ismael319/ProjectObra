import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Building2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface OrganizacaoRow {
  id: string
  nome: string
  is_piloto: boolean
  ativo: boolean
  criado_em: string
}

export default function OrganizacoesManagement() {
  const { user, userProfile } = useAuth()
  const isSuperAdmin = userProfile?.is_super_admin ?? false

  const [organizacoes, setOrganizacoes] = useState<OrganizacaoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [emailGestor, setEmailGestor] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('organizacoes')
      .select('id, nome, is_piloto, ativo, criado_em')
      .order('criado_em', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar empresas')
    } else {
      setOrganizacoes((data as OrganizacaoRow[]) ?? [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCriarEmpresa = async () => {
    if (!nomeEmpresa.trim() || !emailGestor.trim()) return
    setIsCreating(true)

    const { data: organizacao, error: erroOrganizacao } = await supabase
      .from('organizacoes')
      .insert({ nome: nomeEmpresa.trim(), criado_por: user?.id })
      .select('id')
      .single()

    if (erroOrganizacao || !organizacao) {
      toast.error(`Não foi possível criar a empresa: ${erroOrganizacao?.message}`)
      setIsCreating(false)
      return
    }

    const { error: erroConvite } = await supabase.from('convites').insert({
      organizacao_id: organizacao.id,
      email: emailGestor.trim(),
      papel_convidado: 'gestor',
      criado_por: user?.id,
    })

    if (erroConvite) {
      toast.error(`Empresa criada, mas não foi possível convidar o gestor: ${erroConvite.message}`)
    } else {
      toast.success(
        `Empresa "${nomeEmpresa.trim()}" criada! Avise ${emailGestor.trim()} para criar conta em /signup com esse email — ele já entra como gestor.`
      )
      setNomeEmpresa('')
      setEmailGestor('')
      load()
    }
    setIsCreating(false)
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-gray-500 dark:text-gray-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="text-gray-500 dark:text-gray-400" size={24} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Empresas Clientes</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cadastre uma nova empresa cliente e convide o email do primeiro gestor dela. Assim que essa pessoa
          criar conta em <span className="font-mono">/signup</span> usando exatamente esse email, ela já entra
          aprovada como gestora, só daquela empresa — sem ver nada da empresa piloto nem de outras.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Nome da empresa"
            value={nomeEmpresa}
            onChange={(e) => setNomeEmpresa(e.target.value)}
            className="flex-1"
          />
          <Input
            type="email"
            placeholder="email-do-gestor@empresa.com"
            value={emailGestor}
            onChange={(e) => setEmailGestor(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleCriarEmpresa} disabled={isCreating || !nomeEmpresa.trim() || !emailGestor.trim()}>
            <Send size={14} /> Criar empresa e convidar
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criada em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-6">Carregando...</TableCell>
              </TableRow>
            )}
            {!isLoading && organizacoes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-6">Nenhuma empresa cadastrada.</TableCell>
              </TableRow>
            )}
            {organizacoes.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.nome}</TableCell>
                <TableCell>
                  {org.is_piloto ? <Badge variant="secondary">Piloto</Badge> : <Badge variant="outline">Cliente</Badge>}
                </TableCell>
                <TableCell>
                  {org.ativo ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="destructive">Inativa</Badge>}
                </TableCell>
                <TableCell>{new Date(org.criado_em).toLocaleString('pt-BR')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
