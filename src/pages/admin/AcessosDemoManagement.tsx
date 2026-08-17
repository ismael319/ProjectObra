import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, Send, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface AcessoDemoRow {
  id: string
  nome_empresa: string
  organizacao_id: string | null
  criado_em: string
  link_expira_em: string
  ativado_em: string | null
  revogado_em: string | null
}

function statusDe(acesso: AcessoDemoRow): { label: string; className: string } {
  if (acesso.revogado_em) return { label: 'Revogado', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' }
  if (new Date(acesso.link_expira_em) < new Date()) return { label: 'Expirado', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' }
  if (acesso.organizacao_id) return { label: 'Em uso', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' }
  return { label: 'Aguardando acesso', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
}

// Gera e gerencia links de acesso demo (/demo/:id) pra empresas prospect —
// quem abre o link entra numa organização isolada e descartável, ver
// resgatar_acesso_demo() na migration de conta demo. Só o Dono da Plataforma
// acessa esta tela (RLS de acessos_demo já barra o resto).
export default function AcessosDemoManagement() {
  const { user, userProfile } = useAuth()
  const isSuperAdmin = userProfile?.is_super_admin ?? false

  const [acessos, setAcessos] = useState<AcessoDemoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [aba, setAba] = useState<'ativos' | 'historico'>('ativos')

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('acessos_demo')
      .select('id, nome_empresa, organizacao_id, criado_em, link_expira_em, ativado_em, revogado_em')
      .order('criado_em', { ascending: false })
    if (error) toast.error('Erro ao carregar acessos demo')
    else setAcessos((data as AcessoDemoRow[]) ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (isSuperAdmin) load()
  }, [isSuperAdmin, load])

  // Revogado/Expirado só serve de histórico — sem ação possível (podeAgir já
  // barra os botões) — misturado com Aguardando/Em uso, a lista de quem
  // precisa de atenção agora ficava enterrada embaixo do que já foi
  // encerrado. Separado em abas em vez de apagar a linha: mantém o registro
  // de quais empresas prospect já foram contatadas.
  const { ativos, historico } = useMemo(() => {
    const ativos: AcessoDemoRow[] = []
    const historico: AcessoDemoRow[] = []
    for (const acesso of acessos) {
      const label = statusDe(acesso).label
      if (label === 'Revogado' || label === 'Expirado') historico.push(acesso)
      else ativos.push(acesso)
    }
    return { ativos, historico }
  }, [acessos])

  const linkPublico = (id: string) => `${window.location.origin}/demo/${id}`

  const handleCriarLink = async () => {
    if (!nomeEmpresa.trim()) return
    setIsCreating(true)
    const { data, error } = await supabase
      .from('acessos_demo')
      .insert({ nome_empresa: nomeEmpresa.trim(), criado_por: user?.id })
      .select('id')
      .single()

    if (error || !data) {
      toast.error(`Não foi possível gerar o link: ${error?.message}`)
      setIsCreating(false)
      return
    }

    await navigator.clipboard.writeText(linkPublico(data.id)).then(
      () => toast.success('Link demo gerado e copiado! Vale por 7 dias.'),
      () => toast.success('Link demo gerado! Copie na lista abaixo.'),
    )
    setNomeEmpresa('')
    await load()
    setIsCreating(false)
  }

  const copiarLink = (id: string) => {
    navigator.clipboard.writeText(linkPublico(id)).then(
      () => toast.success('Link copiado.'),
      () => toast.error('Não foi possível copiar o link.'),
    )
  }

  const handleRevogar = async (acesso: AcessoDemoRow) => {
    setRevokingId(acesso.id)
    const agora = new Date().toISOString()
    const { error } = await supabase.from('acessos_demo').update({ revogado_em: agora }).eq('id', acesso.id)
    if (error) {
      toast.error(`Não foi possível revogar: ${error.message}`)
      setRevokingId(null)
      return
    }
    if (acesso.organizacao_id) {
      // Encerra o acesso já em uso — a limpeza de verdade acontece no
      // próximo ciclo do job horário de organizações demo expiradas.
      await supabase.from('organizacoes').update({ demo_expira_em: agora }).eq('id', acesso.organizacao_id)
    }
    toast.success('Link revogado.')
    await load()
    setRevokingId(null)
  }

  if (!isSuperAdmin) return null

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="text-gray-500 dark:text-gray-400" size={24} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Acessos Demo</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gere um link provisório pra uma empresa que vai testar o sistema. Quem abrir o link entra direto numa obra
          de demonstração isolada, sem precisar de cadastro nem aprovação. O link vale por 7 dias; a conta demo em si
          expira e some 72h depois do primeiro acesso.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Nome da empresa prospect"
            value={nomeEmpresa}
            onChange={(e) => setNomeEmpresa(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleCriarLink} disabled={isCreating || !nomeEmpresa.trim()}>
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gerar link demo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-blue-600" size={28} />
        </div>
      ) : acessos.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">Nenhum link demo gerado ainda.</div>
      ) : (
        <Tabs value={aba} onValueChange={(v) => setAba(v as 'ativos' | 'historico')}>
          <TabsList>
            <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({historico.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ativos" className="mt-4">
            <ListaAcessos
              lista={ativos}
              vazio="Nenhum link ativo — todos os gerados já foram usados, expiraram ou foram revogados."
              revokingId={revokingId}
              onCopiar={copiarLink}
              onRevogar={handleRevogar}
            />
          </TabsContent>
          <TabsContent value="historico" className="mt-4">
            <ListaAcessos
              lista={historico}
              vazio="Nenhum link expirado ou revogado ainda."
              revokingId={revokingId}
              onCopiar={copiarLink}
              onRevogar={handleRevogar}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function ListaAcessos({
  lista,
  vazio,
  revokingId,
  onCopiar,
  onRevogar,
}: {
  lista: AcessoDemoRow[]
  vazio: string
  revokingId: string | null
  onCopiar: (id: string) => void
  onRevogar: (acesso: AcessoDemoRow) => void
}) {
  if (lista.length === 0) {
    return <div className="text-center py-12 text-gray-400 dark:text-gray-500">{vazio}</div>
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
      {lista.map((acesso) => {
        const status = statusDe(acesso)
        const podeAgir = !acesso.revogado_em && new Date(acesso.link_expira_em) >= new Date()
        return (
          <div key={acesso.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{acesso.nome_empresa}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Gerado em {new Date(acesso.criado_em).toLocaleDateString('pt-BR')}
                {acesso.ativado_em && ` · ativado em ${new Date(acesso.ativado_em).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>
              {podeAgir && (
                <>
                  <button
                    onClick={() => onCopiar(acesso.id)}
                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Copy size={12} /> Copiar link
                  </button>
                  <button
                    onClick={() => onRevogar(acesso)}
                    disabled={revokingId === acesso.id}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 hover:underline disabled:opacity-50"
                  >
                    Revogar
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
