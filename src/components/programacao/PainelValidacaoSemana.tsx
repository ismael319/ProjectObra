import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Undo2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSubmissoesSemana } from '@/lib/validacao/programacao'
import {
  useValidacaoEtapas,
  useValidacaoResponsaveis,
  useConfirmacoes,
  useDecidir,
  useDesfazerDecisao,
} from '@/lib/validacao/validacao-db'
import {
  computeValidacaoStatus,
  agruparPorRegistro,
  ROTULO_STATUS,
  type ValidacaoStatus,
} from '@/lib/validacao/status'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const CORES_STATUS: Record<ValidacaoStatus, string> = {
  pendente: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  parcial: 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50',
  aprovado: 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-50',
  rejeitado: 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-50',
}

/**
 * Confirmação da programação da semana, uma linha por engenheiro.
 *
 * A etapa do engenheiro é `escopo_proprio`: só o dono confirma a própria — não
 * adianta estar na lista de responsáveis. A da coordenação segue a regra normal
 * de responsáveis cadastrados.
 */
export default function PainelValidacaoSemana({ weekId }: { weekId: string }) {
  const { user, userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const { data: submissoes = [] } = useSubmissoesSemana(weekId)
  const { data: etapas = [] } = useValidacaoEtapas(organizacaoId)
  const { data: responsaveis = [] } = useValidacaoResponsaveis(organizacaoId)
  const decidir = useDecidir()
  const desfazer = useDesfazerDecisao()

  const [rejeitando, setRejeitando] = useState<{ id: string; etapa: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  const etapasProgramacao = useMemo(
    () => etapas.filter((e) => e.entidade === 'programacao' && e.ativo).sort((a, b) => a.ordem - b.ordem),
    [etapas],
  )

  const ids = useMemo(() => submissoes.map((s) => s.id), [submissoes])
  const { data: confirmacoes = [] } = useConfirmacoes('programacao', ids)
  const porRegistro = useMemo(() => agruparPorRegistro(confirmacoes), [confirmacoes])

  const souResponsavelPor = (etapaId: string) =>
    responsaveis.some((r) => r.etapa_id === etapaId && r.usuario_id === user?.id)

  async function aplicar(
    submissaoId: string,
    etapaChave: string,
    decisao: 'confirmado' | 'rejeitado',
    observacao?: string,
  ) {
    try {
      await decidir.mutateAsync({
        entidade: 'programacao',
        registroIds: [submissaoId],
        etapaChave,
        decisao,
        observacao,
      })
      setRejeitando(null)
      setMotivo('')
      toast.success(decisao === 'confirmado' ? 'Programação confirmada' : 'Programação rejeitada')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(
        /row-level security|violates/i.test(msg)
          ? 'Você não pode decidir esta etapa — a confirmação do engenheiro só pode ser feita por ele mesmo.'
          : `Não foi possível registrar: ${msg}`,
      )
    }
  }

  if (submissoes.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground mb-1">
          <ShieldCheck size={16} className="text-blue-600" />
          Validação da programação
        </div>
        Nenhum engenheiro desta semana está associado a um usuário. Faça a associação em
        Validações → Programação Semanal.
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium">
        <ShieldCheck size={16} className="text-blue-600" />
        Validação da programação
      </div>

      <ul className="divide-y">
        {submissoes.map((s) => {
          const decisoes = porRegistro.get(s.id) ?? []
          const status = computeValidacaoStatus(etapasProgramacao, decisoes)
          const souODono = s.engenheiro_usuario_id === user?.id
          return (
            <li key={s.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate">
                  {s.foreman_nome}
                  {souODono && <span className="text-muted-foreground"> (você)</span>}
                </span>
                {/* Motivo visível: o engenheiro precisa saber o que reprogramar
                    sem passar o mouse no badge. */}
                {decisoes
                  .filter((d) => d.decisao === 'rejeitado' && d.observacao)
                  .map((d) => (
                    <p key={d.id} className="text-xs text-red-700 dark:text-red-400">
                      {d.observacao}
                    </p>
                  ))}
              </div>

              <span className={`rounded px-2 py-0.5 text-xs font-medium ${CORES_STATUS[status]}`}>
                {ROTULO_STATUS[status]}
              </span>

              <div className="flex flex-wrap items-center gap-1">
                {etapasProgramacao.map((e) => {
                  const d = decisoes.find((x) => x.etapa_chave === e.chave)
                  const podeDecidir = e.escopo_proprio ? souODono : souResponsavelPor(e.id)
                  const minha = d?.usuario_id === user?.id

                  if (d) {
                    return (
                      <span key={e.chave} className="flex items-center gap-1">
                        <Badge
                          variant={d.decisao === 'confirmado' ? 'secondary' : 'destructive'}
                          title={d.observacao ?? e.nome}
                        >
                          {e.nome} {d.decisao === 'confirmado' ? '✓' : '✕'}
                        </Badge>
                        {minha && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            title="Desfazer minha decisão"
                            onClick={async () => {
                              try {
                                await desfazer.mutateAsync(d.id)
                                toast.success('Decisão desfeita')
                              } catch (err) {
                                toast.error(
                                  `Não foi possível desfazer: ${err instanceof Error ? err.message : err}`,
                                )
                              }
                            }}
                          >
                            <Undo2 size={13} />
                          </Button>
                        )}
                      </span>
                    )
                  }

                  if (!podeDecidir) {
                    return (
                      <Badge key={e.chave} variant="outline" className="opacity-60">
                        {e.nome}
                      </Badge>
                    )
                  }

                  return (
                    <span key={e.chave} className="flex items-center gap-1">
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={decidir.isPending}
                        onClick={() => aplicar(s.id, e.chave, 'confirmado')}
                      >
                        <CheckCircle2 size={14} className="mr-1" />
                        {e.nome}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        title={`Rejeitar — ${e.nome}`}
                        onClick={() => setRejeitando({ id: s.id, etapa: e.chave })}
                      >
                        <XCircle size={14} />
                      </Button>
                    </span>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog open={!!rejeitando} onOpenChange={(aberto) => !aberto && setRejeitando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar programação</AlertDialogTitle>
            <AlertDialogDescription>
              Diga o que precisa ser corrigido — o engenheiro vai ler esse texto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: faltou programar a concretagem da laje do bloco B"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivo('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivo.trim()}
              onClick={(ev) => {
                ev.preventDefault()
                if (rejeitando) aplicar(rejeitando.id, rejeitando.etapa, 'rejeitado', motivo)
              }}
            >
              Rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
