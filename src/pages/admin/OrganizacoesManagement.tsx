import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Building2, Send, ShieldCheck, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import OrganizacaoCard from './OrganizacaoCard'
import OrganizacaoDetailModal from './OrganizacaoDetailModal'

interface OrganizacaoRow {
  id: string
  nome: string
  is_piloto: boolean
  ativo: boolean
  criado_em: string
}

interface ModuloRow {
  key: string
  nome: string
}

interface DonoRow {
  id: string
  email: string | null
  is_super_admin: boolean
}

export default function OrganizacoesManagement() {
  const { user, userProfile } = useAuth()
  const isSuperAdmin = userProfile?.is_super_admin ?? false

  const [organizacoes, setOrganizacoes] = useState<OrganizacaoRow[]>([])
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloRow[]>([])
  // organizacao_id -> Set de modulo_key ativos
  const [modulosPorOrg, setModulosPorOrg] = useState<Record<string, Set<string>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [emailDono, setEmailDono] = useState('')
  const [modulosNovaEmpresa, setModulosNovaEmpresa] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [togglingModulo, setTogglingModulo] = useState<string | null>(null)
  const [managingOrgId, setManagingOrgId] = useState<string | null>(null)
  // organizacao_id -> contagem, pro selo de pendência no card
  const [pendentesPorOrg, setPendentesPorOrg] = useState<Record<string, number>>({})
  const [convitesPorOrg, setConvitesPorOrg] = useState<Record<string, number>>({})

  // Promover Dono da Plataforma
  const [buscaEmailDono, setBuscaEmailDono] = useState('')
  const [resultadoBusca, setResultadoBusca] = useState<DonoRow | null>(null)
  const [buscandoDono, setBuscandoDono] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const [orgsRes, modulosRes, orgModulosRes, pendentesRes, convitesRes] = await Promise.all([
      supabase.from('organizacoes').select('id, nome, is_piloto, ativo, criado_em').order('criado_em', { ascending: false }),
      supabase.from('modulos').select('key, nome').order('nome'),
      supabase.from('organizacao_modulos').select('organizacao_id, modulo_key').eq('ativo', true),
      supabase.from('user_profiles').select('organizacao_id').eq('status_solicitacao', 'pendente'),
      supabase.from('convites').select('organizacao_id').is('usado_em', null),
    ])

    let orgsCarregadas: OrganizacaoRow[] = []
    if (orgsRes.error) toast.error('Erro ao carregar empresas')
    else {
      orgsCarregadas = (orgsRes.data as OrganizacaoRow[]) ?? []
      setOrganizacoes(orgsCarregadas)
    }

    if (modulosRes.error) toast.error('Erro ao carregar catálogo de módulos')
    else setModulosCatalogo((modulosRes.data as ModuloRow[]) ?? [])

    if (!orgModulosRes.error) {
      const map: Record<string, Set<string>> = {}
      for (const row of (orgModulosRes.data ?? []) as { organizacao_id: string; modulo_key: string }[]) {
        if (!map[row.organizacao_id]) map[row.organizacao_id] = new Set()
        map[row.organizacao_id].add(row.modulo_key)
      }
      setModulosPorOrg(map)
    }

    if (!pendentesRes.error) {
      // Solicitações órfãs (sem empresa ainda, de antes do sistema de
      // convites) contam pra empresa piloto, que é quem as vê/decide.
      const pilotoId = orgsCarregadas.find((o) => o.is_piloto)?.id
      const contagem: Record<string, number> = {}
      for (const row of (pendentesRes.data ?? []) as { organizacao_id: string | null }[]) {
        const orgId = row.organizacao_id ?? pilotoId
        if (orgId) contagem[orgId] = (contagem[orgId] ?? 0) + 1
      }
      setPendentesPorOrg(contagem)
    }

    if (!convitesRes.error) {
      const contagem: Record<string, number> = {}
      for (const row of (convitesRes.data ?? []) as { organizacao_id: string }[]) {
        contagem[row.organizacao_id] = (contagem[row.organizacao_id] ?? 0) + 1
      }
      setConvitesPorOrg(contagem)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCriarEmpresa = async () => {
    if (!nomeEmpresa.trim() || !emailDono.trim()) return
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

    // O primeiro convidado já entra como "edicao" — é quem vai gerenciar os
    // próprios usuários e projetos dali pra frente.
    const { error: erroConvite } = await supabase.from('convites').insert({
      organizacao_id: organizacao.id,
      email: emailDono.trim(),
      papel_convidado: 'edicao',
      criado_por: user?.id,
    })

    if (erroConvite) {
      toast.error(`Empresa criada, mas não foi possível convidar o dono: ${erroConvite.message}`)
      setIsCreating(false)
      return
    }

    if (modulosNovaEmpresa.size > 0) {
      const { error: erroModulos } = await supabase.from('organizacao_modulos').insert(
        [...modulosNovaEmpresa].map((key) => ({ organizacao_id: organizacao.id, modulo_key: key, liberado_por: user?.id }))
      )
      if (erroModulos) toast.error(`Empresa criada, mas não foi possível liberar os módulos: ${erroModulos.message}`)
    }

    toast.success(
      `Empresa "${nomeEmpresa.trim()}" criada! Avise ${emailDono.trim()} para criar conta em /signup com esse email — ele já entra com acesso de Edição nela.`
    )
    setNomeEmpresa('')
    setEmailDono('')
    setModulosNovaEmpresa(new Set())
    load()
    setIsCreating(false)
  }

  const toggleModuloNovaEmpresa = (key: string) => {
    setModulosNovaEmpresa((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleModuloEmpresa = async (organizacaoId: string, moduloKey: string, ativoAtualmente: boolean) => {
    setTogglingModulo(moduloKey)
    if (ativoAtualmente) {
      const { error } = await supabase
        .from('organizacao_modulos')
        .delete()
        .eq('organizacao_id', organizacaoId)
        .eq('modulo_key', moduloKey)
      if (error) toast.error(`Não foi possível revogar o módulo: ${error.message}`)
    } else {
      const { error } = await supabase
        .from('organizacao_modulos')
        .upsert({ organizacao_id: organizacaoId, modulo_key: moduloKey, ativo: true, liberado_por: user?.id })
      if (error) toast.error(`Não foi possível liberar o módulo: ${error.message}`)
    }
    setModulosPorOrg((prev) => {
      const next = { ...prev, [organizacaoId]: new Set(prev[organizacaoId] ?? []) }
      if (ativoAtualmente) next[organizacaoId].delete(moduloKey)
      else next[organizacaoId].add(moduloKey)
      return next
    })
    setTogglingModulo(null)
  }

  const handleBuscarDono = async () => {
    if (!buscaEmailDono.trim()) return
    setBuscandoDono(true)
    setResultadoBusca(null)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, is_super_admin')
      .ilike('email', buscaEmailDono.trim())
      .maybeSingle()
    if (error) {
      toast.error(`Erro ao buscar usuário: ${error.message}`)
    } else if (!data) {
      toast.error('Nenhum usuário encontrado com esse email.')
    } else {
      setResultadoBusca(data as DonoRow)
    }
    setBuscandoDono(false)
  }

  const handleTogglePlatformOwner = async () => {
    if (!resultadoBusca) return
    const novoValor = !resultadoBusca.is_super_admin
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_super_admin: novoValor })
      .eq('id', resultadoBusca.id)
    if (error) {
      toast.error(`Não foi possível atualizar: ${error.message}`)
      return
    }
    toast.success(novoValor ? `${resultadoBusca.email} agora é Dono da Plataforma` : `${resultadoBusca.email} deixou de ser Dono da Plataforma`)
    setResultadoBusca({ ...resultadoBusca, is_super_admin: novoValor })
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-gray-500 dark:text-gray-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="text-gray-500 dark:text-gray-400" size={24} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Empresas Clientes</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cadastre uma nova empresa cliente e convide o email do dono dela. Assim que essa pessoa criar conta em{' '}
          <span className="font-mono">/signup</span> usando exatamente esse email, ela já entra aprovada como admin
          (dona) daquela empresa — sem ver nada da empresa piloto nem de outras.
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
            placeholder="email-do-dono@empresa.com"
            value={emailDono}
            onChange={(e) => setEmailDono(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleCriarEmpresa} disabled={isCreating || !nomeEmpresa.trim() || !emailDono.trim()}>
            <Send size={14} /> Criar empresa e convidar
          </Button>
        </div>
        {modulosCatalogo.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Módulos liberados pra essa empresa (pode ajustar depois)</p>
            <div className="flex flex-wrap gap-3">
              {modulosCatalogo.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modulosNovaEmpresa.has(m.key)}
                    onChange={() => toggleModuloNovaEmpresa(m.key)}
                    className="w-3.5 h-3.5"
                  />
                  {m.nome}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-blue-600" size={28} />
        </div>
      ) : organizacoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">Nenhuma empresa cadastrada.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {organizacoes.map((org) => (
            <OrganizacaoCard
              key={org.id}
              organizacao={org}
              modulosCatalogo={modulosCatalogo}
              modulosAtivos={modulosPorOrg[org.id] ?? new Set()}
              pendentes={pendentesPorOrg[org.id] ?? 0}
              convitesPendentes={convitesPorOrg[org.id] ?? 0}
              onGerenciar={() => setManagingOrgId(org.id)}
            />
          ))}
        </div>
      )}

      {managingOrgId && (() => {
        const managingOrg = organizacoes.find((o) => o.id === managingOrgId)
        if (!managingOrg) return null
        return (
          <OrganizacaoDetailModal
            organizacao={managingOrg}
            modulosCatalogo={modulosCatalogo}
            modulosAtivos={modulosPorOrg[managingOrg.id] ?? new Set()}
            togglingModulo={togglingModulo}
            onToggleModulo={(moduloKey, ativoAtualmente) => toggleModuloEmpresa(managingOrg.id, moduloKey, ativoAtualmente)}
            onClose={() => { setManagingOrgId(null); load() }}
          />
        )
      })()}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-gray-500 dark:text-gray-400" size={18} />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Donos da Plataforma</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pode existir mais de um Dono da Plataforma. Busque o email de um usuário já cadastrado pra conceder ou
          revogar esse acesso — é quem cria/gerencia empresas clientes e libera os módulos delas.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="email@usuario.com"
            value={buscaEmailDono}
            onChange={(e) => setBuscaEmailDono(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleBuscarDono} disabled={buscandoDono || !buscaEmailDono.trim()}>
            <Search size={14} /> Buscar
          </Button>
        </div>
        {resultadoBusca && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{resultadoBusca.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {resultadoBusca.is_super_admin ? 'É Dono da Plataforma' : 'Não é Dono da Plataforma'}
              </p>
            </div>
            <Button
              size="sm"
              variant={resultadoBusca.is_super_admin ? 'destructive' : 'default'}
              onClick={handleTogglePlatformOwner}
            >
              {resultadoBusca.is_super_admin ? 'Revogar' : 'Conceder'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
