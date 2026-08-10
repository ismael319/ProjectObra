import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import {
  useValidacaoEtapas,
  useValidacaoResponsaveis,
  useUsuariosOrganizacao,
  useAreas,
  useAtualizarEtapa,
  useAdicionarResponsavel,
  useRemoverResponsavel,
  universoDeArea,
} from '@/lib/validacao/validacao-db'
import {
  useForemenDistintos,
  useDeParaEngenheiros,
  useSalvarDePara,
  useRemoverDePara,
} from '@/lib/validacao/programacao'
import type { ValidacaoEntidade, ValidacaoEtapa } from '@/lib/validacao/status'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const ENTIDADES: { key: ValidacaoEntidade; label: string }[] = [
  { key: 'apontamento', label: 'Apontamento de Funcionários' },
  { key: 'carga_concreto', label: 'Cargas de Concreto' },
  { key: 'programacao', label: 'Programação Semanal' },
]

export default function ValidacaoConfig() {
  const { userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('sistema')
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const [entidade, setEntidade] = useState<ValidacaoEntidade>('apontamento')

  const { data: etapas = [], isLoading } = useValidacaoEtapas(organizacaoId)
  const { data: responsaveis = [] } = useValidacaoResponsaveis(organizacaoId)
  const { data: usuarios = [] } = useUsuariosOrganizacao(organizacaoId)
  const { data: areas = [] } = useAreas(organizacaoId, universoDeArea(entidade))

  const etapasDaEntidade = useMemo(
    () => etapas.filter((e) => e.entidade === entidade).sort((a, b) => a.ordem - b.ordem),
    [etapas, entidade],
  )

  if (!podeEditar) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Você não tem permissão para configurar as validações.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck size={24} className="text-blue-600" />
          Validação de lançamentos
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada lançamento só é aprovado depois que todas as etapas ativas forem confirmadas.
          Defina abaixo quem confirma cada etapa.
        </p>
      </header>

      <Tabs value={entidade} onValueChange={(v) => setEntidade(v as ValidacaoEntidade)}>
        <TabsList>
          {ENTIDADES.map((e) => (
            <TabsTrigger key={e.key} value={e.key}>
              {e.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ENTIDADES.map((e) => (
          <TabsContent key={e.key} value={e.key} className="space-y-4 mt-4">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="animate-spin" size={16} /> Carregando…
              </div>
            )}
            {!isLoading && etapasDaEntidade.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Nenhuma etapa configurada para este fluxo.
              </p>
            )}
            {etapasDaEntidade.map((etapa) => (
              <CardEtapa
                key={etapa.id}
                etapa={etapa}
                organizacaoId={organizacaoId}
                responsaveis={responsaveis.filter((r) => r.etapa_id === etapa.id)}
                usuarios={usuarios}
                areas={areas}
              />
            ))}
            {e.key === 'programacao' && (
              <CardDePara organizacaoId={organizacaoId} usuarios={usuarios} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/**
 * De-para entre o nome do engenheiro nas atividades (texto livre) e o usuário.
 *
 * Só existe na programação: é o único fluxo em que o responsável pelo registro
 * é identificado por uma string digitada, sem nenhuma ligação com o login. Sem
 * o mapeamento, o engenheiro não consegue confirmar a programação dele.
 */
function CardDePara({
  organizacaoId,
  usuarios,
}: {
  organizacaoId: string | undefined
  usuarios: { id: string; email: string | null; funcao: string | null }[]
}) {
  const { data: nomes = [], isLoading } = useForemenDistintos(organizacaoId)
  const { data: dePara = [] } = useDeParaEngenheiros(organizacaoId)
  const salvar = useSalvarDePara(organizacaoId)
  const remover = useRemoverDePara(organizacaoId)

  const mapeados = new Map(dePara.map((d) => [d.foreman_nome, d]))
  const semMapear = nomes.filter((n) => !mapeados.has(n)).length

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">Engenheiros das atividades</h2>
        <p className="text-sm text-muted-foreground">
          Nas atividades o engenheiro é um nome digitado, sem ligação com o login. Associe cada
          nome ao usuário correspondente — sem isso, ele não consegue confirmar a própria
          programação.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="animate-spin" size={16} /> Procurando nomes nas atividades…
        </div>
      )}

      {!isLoading && nomes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum engenheiro preenchido nas atividades ainda.
        </p>
      )}

      {semMapear > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            {semMapear} nome(s) sem usuário associado — a programação dessas pessoas fica fora da
            validação.
          </span>
        </div>
      )}

      {nomes.length > 0 && (
        <ul className="divide-y rounded border">
          {nomes.map((nome) => {
            const atual = mapeados.get(nome)
            return (
              <li key={nome} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2">
                <span className="text-sm flex-1 truncate">{nome}</span>
                <div className="sm:w-72">
                  <Combobox
                    options={usuarios.map((u) => ({
                      value: u.id,
                      label: u.funcao ? `${u.email} — ${u.funcao}` : (u.email ?? u.id),
                    }))}
                    value={atual?.usuario_id ?? null}
                    placeholder="Sem usuário associado"
                    onChange={async (v) => {
                      try {
                        if (v) await salvar.mutateAsync({ foreman_nome: nome, usuario_id: v })
                        else if (atual) await remover.mutateAsync(atual.id)
                        toast.success('Associação atualizada')
                      } catch (err) {
                        toast.error(
                          `Não foi possível salvar: ${err instanceof Error ? err.message : err}`,
                        )
                      }
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

interface CardEtapaProps {
  etapa: ValidacaoEtapa
  organizacaoId: string | undefined
  responsaveis: { id: string; usuario_id: string; area_id: string | null; area_concreto_id: string | null }[]
  usuarios: { id: string; email: string | null; funcao: string | null }[]
  areas: { id: string; nome: string }[]
}

function CardEtapa({ etapa, organizacaoId, responsaveis, usuarios, areas }: CardEtapaProps) {
  const atualizarEtapa = useAtualizarEtapa(organizacaoId)
  const adicionar = useAdicionarResponsavel(organizacaoId)
  const remover = useRemoverResponsavel(organizacaoId)

  const [novoUsuario, setNovoUsuario] = useState<string | null>(null)
  const [novaArea, setNovaArea] = useState<string | null>(null)

  const usaAreaConcreto = etapa.entidade === 'carga_concreto'
  const nomeUsuario = (id: string) => usuarios.find((u) => u.id === id)?.email ?? id
  const nomeArea = (id: string) => areas.find((a) => a.id === id)?.nome ?? id

  async function handleAdicionar() {
    if (!novoUsuario) return
    try {
      await adicionar.mutateAsync({
        etapa_id: etapa.id,
        usuario_id: novoUsuario,
        area_id: !usaAreaConcreto ? novaArea : null,
        area_concreto_id: usaAreaConcreto ? novaArea : null,
      })
      setNovoUsuario(null)
      setNovaArea(null)
      toast.success('Responsável adicionado')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // O índice parcial impede o mesmo par usuário+área duas vezes.
      toast.error(
        msg.includes('duplicate key')
          ? 'Esse responsável já está cadastrado para esta área.'
          : `Não foi possível adicionar: ${msg}`,
      )
    }
  }

  async function handleToggleAtivo(ativo: boolean) {
    try {
      await atualizarEtapa.mutateAsync({ id: etapa.id, ativo })
      toast.success(ativo ? 'Etapa ativada' : 'Etapa desativada')
    } catch (err) {
      toast.error(`Não foi possível alterar a etapa: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">{etapa.nome}</h2>
            {etapa.escopo_area && <Badge variant="outline">Por área</Badge>}
            {etapa.escopo_proprio && <Badge variant="outline">Só o dono</Badge>}
            {!etapa.ativo && <Badge variant="secondary">Inativa</Badge>}
          </div>
          {etapa.descricao && (
            <p className="text-sm text-muted-foreground">{etapa.descricao}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">Ativa</span>
          <Switch checked={etapa.ativo} onCheckedChange={handleToggleAtivo} />
        </div>
      </div>

      {etapa.escopo_proprio && (
        <p className="text-sm text-muted-foreground rounded bg-muted p-2">
          Esta etapa é confirmada pelo próprio dono do registro — não há lista de responsáveis a
          cadastrar.
        </p>
      )}

      {!etapa.escopo_proprio && etapa.ativo && responsaveis.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Etapa ativa sem responsável — ninguém consegue confirmar, e os lançamentos deste
            fluxo ficarão parados. Cadastre alguém ou desative a etapa.
          </span>
        </div>
      )}

      {!etapa.escopo_proprio && responsaveis.length > 0 && (
        <ul className="divide-y rounded border">
          {responsaveis.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm truncate">{nomeUsuario(r.usuario_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.area_id || r.area_concreto_id
                    ? nomeArea((r.area_id ?? r.area_concreto_id)!)
                    : 'Todas as áreas'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await remover.mutateAsync(r.id)
                    toast.success('Responsável removido')
                  } catch (err) {
                    toast.error(
                      `Não foi possível remover: ${err instanceof Error ? err.message : err}`,
                    )
                  }
                }}
              >
                <Trash2 size={16} className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className={`flex flex-col sm:flex-row gap-2 items-stretch sm:items-center ${etapa.escopo_proprio ? 'hidden' : ''}`}>
        <div className="flex-1">
          <Combobox
            options={usuarios.map((u) => ({
              value: u.id,
              label: u.funcao ? `${u.email} — ${u.funcao}` : (u.email ?? u.id),
            }))}
            value={novoUsuario}
            onChange={setNovoUsuario}
            placeholder="Escolha um usuário"
          />
        </div>
        {etapa.escopo_area && (
          <div className="flex-1">
            <Combobox
              options={areas.map((a) => ({ value: a.id, label: a.nome }))}
              value={novaArea}
              onChange={setNovaArea}
              placeholder="Todas as áreas"
            />
          </div>
        )}
        <Button onClick={handleAdicionar} disabled={!novoUsuario || adicionar.isPending}>
          <Plus size={16} className="mr-1" />
          Adicionar
        </Button>
      </div>
    </Card>
  )
}
