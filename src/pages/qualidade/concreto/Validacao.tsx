import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatBR } from '@/lib/utils'
import Assinatura from '@/components/Assinatura'
import { formatarDataAssinatura } from '@/lib/assinatura'
import { useAssinaturas } from '@/lib/assinatura-db'
import { useRastreabilidadeCargas } from './lib/ensaios-catalog'

interface CargaRow {
  id: string
  codigo_rastreabilidade: string | null
  data: string
  numero_carga: string | null
  quantidade_m3: number | null
  validacao_status: ValidacaoStatus
  criado_por_nome: string | null
  fornecedores_concreto: { nome: string } | null
  tracos_concreto: { nome: string; fck_mpa: number | null } | null
  destinos_carga: {
    quantidade_m3_aplicada: number | null
    area_concreto_id: string | null
    areas_concreto: { nome: string } | null
  }[]
}

const CORES_STATUS: Record<ValidacaoStatus, string> = {
  pendente: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  parcial: 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50',
  aprovado: 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-50',
  rejeitado: 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-50',
}

export default function ConcretoValidacao() {
  const { user, userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const { data: assinaturas } = useAssinaturas(organizacaoId)

  // Mesma fonte do calendário de Ensaios (vw_rastreabilidade_concreto, todas
  // as cargas da empresa, sem os filtros da tabela abaixo) — aqui não usa o
  // status de rastreabilidade dela, só data + volume, pra somar por dia.
  const { data: cargasParaCalendario = [] } = useRastreabilidadeCargas(organizacaoId)
  const volumePorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cargasParaCalendario) {
      map.set(c.data, (map.get(c.data) ?? 0) + c.quantidade_m3)
    }
    return map
  }, [cargasParaCalendario])

  const { data: etapas = [] } = useValidacaoEtapas(organizacaoId)
  const { data: responsaveis = [] } = useValidacaoResponsaveis(organizacaoId)
  const decidir = useDecidir()
  const desfazer = useDesfazerDecisao()

  const [etapaChave, setEtapaChave] = useState<string | null>(null)
  const [soPendentes, setSoPendentes] = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [confirmandoRejeicao, setConfirmandoRejeicao] = useState(false)

  const etapasConcreto = useMemo(
    () => etapas.filter((e) => e.entidade === 'carga_concreto' && e.ativo).sort((a, b) => a.ordem - b.ordem),
    [etapas],
  )

  // As etapas em que EU sou responsável — as únicas que posso decidir.
  const minhasEtapas = useMemo(() => {
    const meus = responsaveis.filter((r) => r.usuario_id === user?.id)
    return etapasConcreto.filter((e) => meus.some((r) => r.etapa_id === e.id))
  }, [responsaveis, etapasConcreto, user?.id])

  const etapaAtiva = minhasEtapas.find((e) => e.chave === etapaChave) ?? minhasEtapas[0]

  // Se a etapa recorta por área, só vejo as cargas das minhas áreas. Área nula
  // no cadastro = respondo por todas, e aí não filtro nada.
  const minhasAreas = useMemo(() => {
    if (!etapaAtiva?.escopo_area) return null
    const meus = responsaveis.filter((r) => r.usuario_id === user?.id && r.etapa_id === etapaAtiva.id)
    if (meus.some((r) => r.area_concreto_id === null)) return null
    return meus.map((r) => r.area_concreto_id!).filter(Boolean)
  }, [responsaveis, etapaAtiva, user?.id])

  const { data: cargas = [], isLoading } = useQuery({
    queryKey: ['cargas-concreto-validacao', organizacaoId, soPendentes, dataInicio, dataFim, minhasAreas],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const filtraArea = minhasAreas !== null && minhasAreas.length > 0
      let q = supabase
        .from('cargas_concreto')
        .select(
          `id, codigo_rastreabilidade, data, numero_carga, quantidade_m3, validacao_status, criado_por_nome,
           fornecedores_concreto(nome),
           tracos_concreto(nome, fck_mpa),
           destinos_carga${filtraArea ? '!inner' : ''}(quantidade_m3_aplicada, area_concreto_id, areas_concreto(nome))`,
        )
        .eq('organizacao_id', organizacaoId!)
        .order('data', { ascending: false })
        .limit(200)

      if (soPendentes) q = q.in('validacao_status', ['pendente', 'parcial'])
      if (dataInicio) q = q.gte('data', dataInicio)
      if (dataFim) q = q.lte('data', dataFim)
      if (filtraArea) q = q.in('destinos_carga.area_concreto_id', minhasAreas)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as CargaRow[]
    },
  })

  const ids = useMemo(() => cargas.map((c) => c.id), [cargas])
  const { data: confirmacoes = [] } = useConfirmacoes('carga_concreto', ids)
  const porRegistro = useMemo(() => agruparPorRegistro(confirmacoes), [confirmacoes])

  // Só faz sentido selecionar o que eu ainda não decidi nesta etapa.
  const selecionaveis = useMemo(() => {
    if (!etapaAtiva) return []
    return cargas.filter(
      (c) => !(porRegistro.get(c.id) ?? []).some((d) => d.etapa_chave === etapaAtiva.chave),
    )
  }, [cargas, porRegistro, etapaAtiva])

  const alternar = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function aplicar(decisao: 'confirmado' | 'rejeitado', observacao?: string) {
    if (!etapaAtiva || selecionados.size === 0) return
    try {
      await decidir.mutateAsync({
        entidade: 'carga_concreto',
        registroIds: [...selecionados],
        etapaChave: etapaAtiva.chave,
        decisao,
        observacao,
      })
      toast.success(
        `${selecionados.size} carga(s) ${decisao === 'confirmado' ? 'confirmada(s)' : 'rejeitada(s)'}`,
      )
      setSelecionados(new Set())
      setMotivo('')
      setConfirmandoRejeicao(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // A RLS barra quem não responde pela etapa/área — vale explicar em vez de
      // mostrar o erro cru do Postgres.
      toast.error(
        /row-level security|violates/i.test(msg)
          ? 'Você não responde por esta etapa em alguma das áreas selecionadas.'
          : `Não foi possível registrar: ${msg}`,
      )
    }
  }

  if (minhasEtapas.length === 0) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-xl font-semibold mb-2">Validação de cargas</h1>
        <p className="text-muted-foreground">
          Você não está cadastrado como responsável por nenhuma etapa de validação do concreto.
          Peça a quem administra o sistema para incluir você em{' '}
          <span className="font-medium">Validações</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck size={24} className="text-blue-600" />
          Validação de cargas de concreto
        </h1>
        {etapaAtiva?.descricao && (
          <p className="text-sm text-muted-foreground">{etapaAtiva.descricao}</p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4 items-end">
          <div className="space-y-1">
            <Label>Conferir como</Label>
            <Combobox
              options={minhasEtapas.map((e) => ({ value: e.chave, label: e.nome }))}
              value={etapaAtiva?.chave ?? null}
              onChange={(v) => { setEtapaChave(v); setSelecionados(new Set()) }}
              allowClear={false}
            />
          </div>
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Checkbox checked={soPendentes} onCheckedChange={(v) => setSoPendentes(!!v)} />
            Só o que falta conferir
          </label>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendário de volume</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-2">
            <Calendar
              mode="single"
              selected={dataInicio && dataInicio === dataFim ? new Date(dataInicio + 'T12:00:00') : undefined}
              onSelect={(d) => {
                if (!d) return
                const iso = d.toISOString().slice(0, 10)
                // Clicar de novo no mesmo dia limpa o filtro (volta a mostrar
                // o período/todas as cargas) — mesmo padrão de alternância do
                // calendário de Ensaios.
                if (dataInicio === iso && dataFim === iso) {
                  setDataInicio('')
                  setDataFim('')
                } else {
                  setDataInicio(iso)
                  setDataFim(iso)
                }
              }}
              // Sem origin-top-left (ver Ensaios.tsx) — scale já centra
              // sozinho por padrão.
              className="rounded-md border scale-[0.9]"
              components={{
                DayButton: (props) => {
                  const dateStr = props.day.date.toISOString().slice(0, 10)
                  const volume = volumePorDia.get(dateStr)
                  return (
                    <div className="relative">
                      <CalendarDayButton {...props} />
                      {volume != null && volume > 0 && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] leading-none text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">
                          {volume.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                        </span>
                      )}
                    </div>
                  )
                },
              }}
            />
            <p className="text-xs text-muted-foreground">Volume total de concreto (m³) lançado em cada dia.</p>
          </CardContent>
        </Card>
      </div>

      {selecionados.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
          <span className="text-sm font-medium">{selecionados.size} selecionada(s)</span>
          <Button size="sm" onClick={() => aplicar('confirmado')} disabled={decidir.isPending}>
            <CheckCircle2 size={16} className="mr-1" />
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmandoRejeicao(true)}
            disabled={decidir.isPending}
          >
            <XCircle size={16} className="mr-1" />
            Rejeitar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-4">
          <Loader2 className="animate-spin" size={16} /> Carregando…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selecionaveis.length > 0 && selecionados.size === selecionaveis.length}
                    onCheckedChange={(v) =>
                      setSelecionados(v ? new Set(selecionaveis.map((c) => c.id)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Fornecedor / Traço</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">m³</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Etapas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Nenhuma carga encontrada.
                  </TableCell>
                </TableRow>
              )}
              {cargas.map((c) => {
                const decisoes = porRegistro.get(c.id) ?? []
                const minhaDecisao = decisoes.find(
                  (d) => d.etapa_chave === etapaAtiva?.chave && d.usuario_id === user?.id,
                )
                const status = computeValidacaoStatus(etapasConcreto, decisoes)
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selecionados.has(c.id)}
                        disabled={!!minhaDecisao}
                        onCheckedChange={() => alternar(c.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.codigo_rastreabilidade}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatBR(c.data)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{c.fornecedores_concreto?.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.tracos_concreto?.nome}
                        {c.tracos_concreto?.fck_mpa ? ` — ${c.tracos_concreto.fck_mpa} MPa` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.destinos_carga.map((d) => d.areas_concreto?.nome).filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-right">{c.quantidade_m3}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CORES_STATUS[status]}`}>
                        {ROTULO_STATUS[status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* Motivo visível, não só no tooltip: quem abre a tela
                          depois precisa saber por que a carga travou sem ter
                          que passar o mouse em cada badge. */}
                      {decisoes
                        .filter((d) => d.decisao === 'rejeitado' && d.observacao)
                        .map((d) => (
                          <p key={d.id} className="mb-1 text-xs text-red-700 dark:text-red-400">
                            {d.observacao}
                          </p>
                        ))}
                      <div className="flex flex-wrap items-center gap-1">
                        {etapasConcreto.map((e) => {
                          const d = decisoes.find((x) => x.etapa_chave === e.chave)
                          const quem = d ? assinaturas?.get(d.usuario_id) : undefined
                          return (
                            <span key={e.chave} className="flex items-center gap-1.5">
                              <Badge
                                variant={d ? (d.decisao === 'confirmado' ? 'secondary' : 'destructive') : 'outline'}
                                title={d?.observacao ?? e.nome}
                              >
                                {e.nome}
                                {d && (d.decisao === 'confirmado' ? ' ✓' : ' ✕')}
                              </Badge>
                              {/* Assinatura de quem decidiu — o badge diz a etapa,
                                  não a pessoa. */}
                              {quem && d && (
                                <Assinatura
                                  nome={quem.nome}
                                  estilo={quem.assinatura_estilo}
                                  funcao={quem.funcao}
                                  data={formatarDataAssinatura(d.criado_em)}
                                  tamanho="sm"
                                  className="max-w-[160px]"
                                />
                              )}
                            </span>
                          )
                        })}
                        {minhaDecisao && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Desfazer minha decisão"
                            onClick={async () => {
                              try {
                                await desfazer.mutateAsync(minhaDecisao.id)
                                toast.success('Decisão desfeita')
                              } catch (err) {
                                toast.error(
                                  `Não foi possível desfazer: ${err instanceof Error ? err.message : err}`,
                                )
                              }
                            }}
                          >
                            <Undo2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmandoRejeicao} onOpenChange={setConfirmandoRejeicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar {selecionados.size} carga(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Diga o que precisa ser corrigido — quem lançou vai ler esse texto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: quantidade divergente da nota fiscal"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivo('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivo.trim()}
              onClick={(e) => {
                // O AlertDialogAction fecha o diálogo por padrão; segurar o
                // fechamento evita perder o texto se o insert falhar.
                e.preventDefault()
                aplicar('rejeitado', motivo)
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
