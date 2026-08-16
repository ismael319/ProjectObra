import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO, formatBR, computeApontamento } from "./lib/date-utils";
import { useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades } from "./lib/catalog";
import { CheckCircle2, XCircle, Undo2, Loader2, Clock, Pencil, Trash2, Save, X } from "lucide-react";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Assinatura from '@/components/Assinatura'
import { formatarDataAssinatura } from '@/lib/assinatura'
import { useAssinaturas } from '@/lib/assinatura-db'
import { useAuth, usePapelModulo } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import {
  useValidacaoEtapas, useValidacaoResponsaveis, useConfirmacoes, useDecidir, useDesfazerDecisao,
} from "@/lib/validacao/validacao-db";
import {
  computeValidacaoStatus, agruparPorRegistro, ROTULO_STATUS, type ValidacaoStatus,
} from "@/lib/validacao/status";
import { sincronizarHorasHomem } from "./lib/horas-homem";

interface HorasDia {
  inicio: string;
  termino: string;
  almocoInicio: string;
  fimAlmoco: string;
}

function getDefaultHoras(dataStr: string): HorasDia {
  const d = new Date(dataStr + "T12:00:00");
  const dow = d.getDay();
  if (dow === 6) {
    return { inicio: "07:00", termino: "11:00", almocoInicio: "", fimAlmoco: "" };
  }
  if (dow === 0) {
    return { inicio: "", termino: "", almocoInicio: "", fimAlmoco: "" };
  }
  return { inicio: "07:00", termino: "18:00", almocoInicio: "11:00", fimAlmoco: "12:00" };
}

function calcHorasTrab(h: HorasDia): number {
  if (!h.inicio || !h.termino) return 0;
  const toMin = (t: string) => {
    const [hh, mm] = t.split(":").map(Number);
    return hh * 60 + mm;
  };
  const ini = toMin(h.inicio);
  const fim = toMin(h.termino);
  let almoco = 0;
  if (h.almocoInicio && h.fimAlmoco) {
    almoco = toMin(h.fimAlmoco) - toMin(h.almocoInicio);
  }
  return Math.max(0, (fim - ini - almoco) / 60);
}

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

interface Apontamento {
  id: string;
  data: string;
  empresa_id: string;
  empresa_nome: string;
  lideranca_id: string;
  lideranca_nome: string;
  lideranca_tipo: string;
  setor_id: string;
  setor_nome: string;
  area_id: string | null;
  area_nome: string | null;
  subarea_id: string | null;
  subarea_nome: string | null;
  atividade_id: string;
  atividade_nome: string;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  total: number;
  obs_planejamento: string | null;
  validado: boolean;
  validado_em: string | null;
  validacao_status: ValidacaoStatus;
  criado_em?: string | null;
  criado_por?: string | null;
}

const CORES_STATUS: Record<ValidacaoStatus, string> = {
  pendente: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  parcial: "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50",
  aprovado: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-50",
  rejeitado: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-50",
};

// Bolinha do calendário: o dia herda o estado mais "atrasado" dos apontamentos
// dele — um único pendente já deixa o dia pendente.
const PRIORIDADE_DIA: ValidacaoStatus[] = ["rejeitado", "pendente", "parcial", "aprovado"];

export default function ValidacaoPage() {
  const qc = useQueryClient();
  const [data, setData] = useState(todayISO());
  const [horasDia, setHorasDia] = useState<HorasDia>(() => getDefaultHoras(todayISO()));
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Apontamento>>({});
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const [y, m] = todayISO().split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  const { user, userProfile } = useAuth();
  const { papel } = usePapelModulo('engenharia');
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? null;
  const { data: assinaturas } = useAssinaturas(organizacaoId);
  const [etapaChave, setEtapaChave] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [confirmandoRejeicao, setConfirmandoRejeicao] = useState(false);

  const { data: etapas = [] } = useValidacaoEtapas(organizacaoId ?? undefined);
  const { data: responsaveis = [] } = useValidacaoResponsaveis(organizacaoId ?? undefined);
  const decidir = useDecidir();
  const desfazer = useDesfazerDecisao();

  const etapasApontamento = useMemo(
    () => etapas.filter((e) => e.entidade === "apontamento" && e.ativo).sort((a, b) => a.ordem - b.ordem),
    [etapas],
  );

  // As etapas em que EU sou responsável — as únicas que posso decidir.
  const minhasEtapas = useMemo(() => {
    const meus = responsaveis.filter((r) => r.usuario_id === user?.id);
    return etapasApontamento.filter((e) => meus.some((r) => r.etapa_id === e.id));
  }, [responsaveis, etapasApontamento, user?.id]);

  const etapaAtiva = minhasEtapas.find((e) => e.chave === etapaChave) ?? minhasEtapas[0];

  const { data: empresas = [] } = useEmpresas();
  const { data: liderancas = [] } = useLiderancas();
  const { data: setores = [] } = useSetores();
  const { data: areas = [] } = useAreas(draft.setor_id);
  const { data: subareas = [] } = useSubareas(draft.area_id);
  const { data: atividades = [] } = useAtividades();
  const liderancaOpts = useMemo(
    () => liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo })),
    [liderancas],
  );

  const handleDataChange = (novaData: string) => {
    setData(novaData);
    setHorasDia(getDefaultHoras(novaData));
    setEditandoId(null);
  };

  const diaSemana = DIAS_SEMANA[new Date(data + "T12:00:00").getDay()];
  const horasTrab = calcHorasTrab(horasDia);

  // Jornada já salva pra esse dia (se a validação já foi feita antes) — mostrada
  // como referência; os campos de início/término continuam editáveis e, ao
  // confirmar a validação de novo, o valor recalculado substitui o salvo.
  const { data: diaTrabalho } = useQuery({
    queryKey: ["dias_trabalho", organizacaoId, projetoId, data],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("dias_trabalho")
        .select("horas_dia")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .eq("data", data)
        .maybeSingle();
      if (error) throw error;
      return row as { horas_dia: number } | null;
    },
    enabled: !!organizacaoId && !!projetoId && !!data,
  });

  const { data: apontamentos = [], isFetching } = useQuery({
    queryKey: ["validacao", organizacaoId, projetoId, data],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("apontamentos_diarios")
        .select("*")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .eq("data", data);
      if (error) throw error;
      return (rows as Apontamento[]).sort((a, b) => (a.criado_em ?? "").localeCompare(b.criado_em ?? ""));
    },
    enabled: !!organizacaoId && !!projetoId && !!data,
  });

  const calMonthStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
  const calStart = `${calMonthStr}-01`;
  const calEnd = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: calData = [] } = useQuery({
    queryKey: ["validacao-calendar", organizacaoId, projetoId, calMonthStr],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("apontamentos_diarios")
        .select("data,validacao_status")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .gte("data", calStart)
        .lte("data", calEnd);
      if (error) throw error;
      return (rows ?? []) as { data: string; validacao_status: ValidacaoStatus }[];
    },
    enabled: !!organizacaoId && !!projetoId,
  });

  const calDayStatus = useMemo(() => {
    const map = new Map<string, ValidacaoStatus>();
    for (const r of calData) {
      const atual = map.get(r.data);
      const novo = r.validacao_status ?? "pendente";
      if (!atual || PRIORIDADE_DIA.indexOf(novo) < PRIORIDADE_DIA.indexOf(atual)) {
        map.set(r.data, novo);
      }
    }
    return map;
  }, [calData]);

  const ids = useMemo(() => apontamentos.map((a) => a.id), [apontamentos]);
  const { data: confirmacoes = [] } = useConfirmacoes("apontamento", ids);
  const porRegistro = useMemo(() => agruparPorRegistro(confirmacoes), [confirmacoes]);

  // Só faz sentido selecionar o que eu ainda não decidi nesta etapa.
  const selecionaveis = useMemo(() => {
    if (!etapaAtiva) return [];
    return apontamentos.filter(
      (a) => !(porRegistro.get(a.id) ?? []).some((d) => d.etapa_chave === etapaAtiva.chave),
    );
  }, [apontamentos, porRegistro, etapaAtiva]);

  const alternar = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resumo = useMemo(() => {
    const acc = { pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0 };
    for (const a of apontamentos) {
      acc.pedreiro += a.pedreiro;
      acc.servente += a.servente;
      acc.carpinteiro += a.carpinteiro;
      acc.qntdd_funcao += a.qntdd_funcao;
      acc.total += a.total;
    }
    return acc;
  }, [apontamentos]);

  const editarMut = useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: Record<string, unknown> }) => {
      if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra antes de editar apontamentos");
      // Campos que o banco controla e o client não deve mandar de volta.
      // `validado`/`validado_em` costumavam ser um buraco: descartá-los aqui
      // fazia um apontamento já validado continuar validado depois de editado.
      // Agora quem zera isso é o trigger trg_invalidar_validacao_apontamento
      // (20260810020000), que apaga as confirmações quando um campo material
      // muda — descartar aqui virou só higiene de payload.
      const {
        criado_em: _criado_em,
        atualizado_em: _atualizado_em,
        validado: _validado,
        validado_em: _validado_em,
        validacao_status: _validacao_status,
        id: _id,
        ...rest
      } = dados;
      const payload = computeApontamento({
        ...rest,
        pedreiro: Number(rest.pedreiro ?? 0),
        servente: Number(rest.servente ?? 0),
        carpinteiro: Number(rest.carpinteiro ?? 0),
        qntdd_funcao: Number(rest.qntdd_funcao ?? 0),
        organizacao_id: organizacaoId,
        projeto_id: projetoId,
      });
      const { error } = await supabase
        .from("apontamentos_diarios")
        .update(payload)
        .eq("id", id)
        .eq("organizacao_id", organizacaoId)
        .eq("projeto_id", projetoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Apontamento atualizado");
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["validacao", organizacaoId, projetoId, data] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: async (id: string) => {
      if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra antes de excluir apontamentos");
      const { error } = await supabase
        .from("apontamentos_diarios")
        .delete()
        .eq("id", id)
        .eq("organizacao_id", organizacaoId)
        .eq("projeto_id", projetoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Apontamento excluído");
      qc.invalidateQueries({ queryKey: ["validacao", organizacaoId, projetoId, data] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const iniciarEdicao = (a: Apontamento) => {
    setDraft({
      data: a.data,
      atividade_id: a.atividade_id,
      atividade_nome: a.atividade_nome,
      empresa_id: a.empresa_id,
      empresa_nome: a.empresa_nome,
      lideranca_id: a.lideranca_id,
      lideranca_nome: a.lideranca_nome,
      lideranca_tipo: a.lideranca_tipo,
      setor_id: a.setor_id,
      setor_nome: a.setor_nome,
      area_id: a.area_id,
      area_nome: a.area_nome,
      subarea_id: a.subarea_id,
      subarea_nome: a.subarea_nome,
      pedreiro: a.pedreiro,
      servente: a.servente,
      carpinteiro: a.carpinteiro,
      qntdd_funcao: a.qntdd_funcao,
      obs_planejamento: a.obs_planejamento,
    });
    setEditandoId(a.id);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setDraft({});
  };

  // A jornada é propriedade do DIA, não de cada apontamento — por isso virou
  // ação própria quando a validação passou a ser registro a registro. Antes ela
  // era salva de carona no botão "Confirmar validação".
  const salvarJornadaMut = useMutation({
    mutationFn: async () => {
      if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra antes de salvar a jornada");
      const { error } = await supabase
        .from("dias_trabalho")
        .upsert({
          data,
          horas_dia: horasTrab,
          organizacao_id: organizacaoId,
          projeto_id: projetoId,
          atualizado_em: new Date().toISOString(),
        });
      if (error) throw error;
      // A jornada entra na conta de horas-homem: mudou a jornada, a EAP muda.
      await sincronizarHorasHomem(organizacaoId, projetoId);
    },
    onSuccess: () => {
      toast.success(`Jornada de ${horasTrab}h salva para ${formatBR(data)}`);
      qc.invalidateQueries({ queryKey: ["dias_trabalho", organizacaoId, projetoId, data] });
      qc.invalidateQueries({ queryKey: ["cronograma_itens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function aplicar(decisao: "confirmado" | "rejeitado", observacao?: string) {
    if (!etapaAtiva || selecionados.size === 0) return;
    const quantos = selecionados.size;
    try {
      await decidir.mutateAsync({
        entidade: "apontamento",
        registroIds: [...selecionados],
        etapaChave: etapaAtiva.chave,
        decisao,
        observacao,
      });
      setSelecionados(new Set());
      setMotivo("");
      setConfirmandoRejeicao(false);
      toast.success(
        `${quantos} apontamento(s) ${decisao === "confirmado" ? "confirmado(s)" : "rejeitado(s)"}`,
      );
      // O trigger já atualizou `validado` das linhas que fecharam todas as
      // etapas; agora a EAP reflete o novo conjunto de aprovados.
      if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra antes de validar apontamentos");
      await sincronizarHorasHomem(organizacaoId, projetoId);
      qc.invalidateQueries({ queryKey: ["validacao", organizacaoId, projetoId, data] });
      qc.invalidateQueries({ queryKey: ["validacao-calendar", organizacaoId, projetoId, calMonthStr] });
      qc.invalidateQueries({ queryKey: ["cronograma_itens"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        /row-level security|violates/i.test(msg)
          ? "Você não responde por esta etapa de validação."
          : `Não foi possível registrar: ${msg}`,
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Validação Diária</h1>
        <p className="text-sm text-muted-foreground">
          Confirme os apontamentos do dia. Ao confirmar, as horas são registradas na EAP (cronograma).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex items-center gap-3">
              <Label className="whitespace-nowrap">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => handleDataChange(e.target.value)}
                className="max-w-[200px]"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex-1 flex justify-center">
              <Calendar
                mode="single"
                selected={new Date(data + "T12:00:00")}
                month={calMonth}
                onMonthChange={setCalMonth}
                onSelect={(d) => {
                  if (d) handleDataChange(d.toISOString().slice(0, 10));
                }}
                className="rounded-md border scale-[0.85] origin-top-left"
                components={{
                  DayButton: (props) => {
                    const dateStr = props.day.date.toISOString().slice(0, 10);
                    const status = calDayStatus.get(dateStr);
                    return (
                      <div className="relative">
                        <CalendarDayButton {...props} />
                        {status && (
                          <span
                            className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full ${
                              status === "aprovado"
                                ? "bg-green-500"
                                : status === "parcial"
                                  ? "bg-amber-500"
                                  : status === "rejeitado"
                                    ? "bg-red-600"
                                    : "bg-slate-400"
                            }`}
                          />
                        )}
                      </div>
                    );
                  },
                }}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400 inline-block" /> Aguardando conferência
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Falta uma conferência
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Validação concluída
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-600 inline-block" /> Rejeitado
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horas do dia — {diaSemana}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input
                type="time"
                value={horasDia.inicio}
                onChange={(e) => setHorasDia((h) => ({ ...h, inicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Término</Label>
              <Input
                type="time"
                value={horasDia.termino}
                onChange={(e) => setHorasDia((h) => ({ ...h, termino: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início almoço</Label>
              <Input
                type="time"
                value={horasDia.almocoInicio}
                onChange={(e) => setHorasDia((h) => ({ ...h, almocoInicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fim almoço</Label>
              <Input
                type="time"
                value={horasDia.fimAlmoco}
                onChange={(e) => setHorasDia((h) => ({ ...h, fimAlmoco: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={horasTrab > 0 ? "default" : "outline"} className="text-sm">
              <Clock className="mr-1 h-3 w-3" />
              {horasTrab > 0 ? `${horasTrab}h trabalhadas` : "Sem horas definidas"}
            </Badge>
            {horasDia.almocoInicio && horasDia.fimAlmoco && (
              <span className="text-xs text-muted-foreground">
                (almoço {horasDia.almocoInicio}–{horasDia.fimAlmoco})
              </span>
            )}
            {diaTrabalho && diaTrabalho.horas_dia !== horasTrab && (
              <span className="text-xs text-muted-foreground">
                Jornada salva para este dia: <strong>{diaTrabalho.horas_dia}h</strong> — salvar substitui pelo valor acima.
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => salvarJornadaMut.mutate()}
              disabled={salvarJornadaMut.isPending || horasTrab <= 0}
            >
              {salvarJornadaMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Salvar jornada
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Essas horas multiplicam a quantidade de pessoas de cada apontamento e viram horas-homem na EAP.
          </p>
        </CardContent>
      </Card>

      {apontamentos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum apontamento para {formatBR(data)}.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total pessoas</div>
                <div className="mt-1 text-3xl font-bold">{resumo.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Pedreiros</div>
                <div className="mt-1 text-3xl font-bold">{resumo.pedreiro}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Serventes</div>
                <div className="mt-1 text-3xl font-bold">{resumo.servente}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Carpinteiro + Outros</div>
                <div className="mt-1 text-3xl font-bold">{resumo.carpinteiro + resumo.qntdd_funcao}</div>
              </CardContent>
            </Card>
          </div>

          {minhasEtapas.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Você não está cadastrado como responsável por nenhuma etapa de validação do
                apontamento. Peça a quem administra o sistema para incluir você em{" "}
                <span className="font-medium">Validações</span>. Enquanto isso, dá para consultar e
                editar os apontamentos abaixo normalmente.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1 sm:max-w-xs flex-1">
                  <Label>Conferir como</Label>
                  <Combobox
                    options={minhasEtapas.map((e) => ({ value: e.chave, label: e.nome }))}
                    value={etapaAtiva?.chave ?? null}
                    onChange={(v) => { setEtapaChave(v); setSelecionados(new Set()); }}
                    allowClear={false}
                  />
                  {etapaAtiva?.descricao && (
                    <p className="text-xs text-muted-foreground">{etapaAtiva.descricao}</p>
                  )}
                </div>
                {selecionaveis.length > 0 && (
                  <label className="flex items-center gap-2 text-sm pb-2">
                    <Checkbox
                      checked={selecionados.size > 0 && selecionados.size === selecionaveis.length}
                      onCheckedChange={(v) =>
                        setSelecionados(v ? new Set(selecionaveis.map((a) => a.id)) : new Set())
                      }
                    />
                    Selecionar os {selecionaveis.length} que faltam
                  </label>
                )}
              </CardContent>
            </Card>
          )}

          {selecionados.size > 0 && (
            <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
              <span className="text-sm font-medium">{selecionados.size} selecionado(s)</span>
              <Button size="sm" onClick={() => aplicar("confirmado")} disabled={decidir.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmandoRejeicao(true)}
                disabled={decidir.isPending}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Rejeitar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                Limpar seleção
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apontamentos do dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {apontamentos.map((a) => {
                const emEdicao = editandoId === a.id;
                const decisoes = porRegistro.get(a.id) ?? [];
                const minhaDecisao = decisoes.find(
                  (d) => d.etapa_chave === etapaAtiva?.chave && d.usuario_id === user?.id,
                );
                const status = computeValidacaoStatus(etapasApontamento, decisoes);
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border p-3 text-sm ${
                      status === "aprovado"
                        ? "bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800"
                        : status === "rejeitado"
                          ? "bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800"
                          : ""
                    }`}
                  >
                    {emEdicao ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Empresa</Label>
                            <Combobox
                              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
                              value={draft.empresa_id ?? null}
                              onChange={(v) => {
                                const empresa = empresas.find((e) => e.id === v);
                                setDraft((d) => ({ ...d, empresa_id: v ?? undefined, empresa_nome: empresa?.nome ?? d.empresa_nome }));
                              }}
                              placeholder="Selecione a empresa"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Atividade</Label>
                            <Combobox
                              options={atividades.map((a) => ({ value: a.id, label: a.nome }))}
                              value={draft.atividade_id ?? null}
                              onChange={(v) => {
                                const atividade = atividades.find((a) => a.id === v);
                                setDraft((d) => ({ ...d, atividade_id: v ?? undefined, atividade_nome: atividade?.nome ?? d.atividade_nome }));
                              }}
                              placeholder="Selecione a atividade"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs text-muted-foreground">Liderança / Encarregado</Label>
                            <Combobox
                              options={liderancaOpts}
                              value={draft.lideranca_id ?? null}
                              onChange={(v) => {
                                const lider = liderancas.find((l) => l.id === v);
                                setDraft((d) => ({
                                  ...d,
                                  lideranca_id: v ?? undefined,
                                  lideranca_nome: lider?.nome ?? d.lideranca_nome,
                                  lideranca_tipo: lider?.tipo ?? d.lideranca_tipo,
                                }));
                              }}
                              placeholder="Selecione a liderança"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Setor</Label>
                            <Combobox
                              options={setores.map((s) => ({ value: s.id, label: s.nome }))}
                              value={draft.setor_id ?? null}
                              onChange={(v) => {
                                const setor = setores.find((s) => s.id === v);
                                setDraft((d) => ({
                                  ...d,
                                  setor_id: v ?? undefined,
                                  setor_nome: setor?.nome ?? d.setor_nome,
                                  area_id: null,
                                  area_nome: null,
                                  subarea_id: null,
                                  subarea_nome: null,
                                }));
                              }}
                              placeholder="Selecione o setor"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Área</Label>
                            <Combobox
                              options={areas.map((a) => ({ value: a.id, label: a.nome }))}
                              value={draft.area_id ?? null}
                              onChange={(v) => {
                                const area = areas.find((a) => a.id === v);
                                setDraft((d) => ({
                                  ...d,
                                  area_id: v ?? null,
                                  area_nome: area?.nome ?? null,
                                  subarea_id: null,
                                  subarea_nome: null,
                                }));
                              }}
                              placeholder={draft.setor_id ? (areas.length === 0 ? "Sem áreas cadastradas" : "Selecione a área") : "Escolha o setor primeiro"}
                              disabled={!draft.setor_id}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Subárea</Label>
                            <Combobox
                              options={subareas.map((s) => ({ value: s.id, label: s.nome }))}
                              value={draft.subarea_id ?? null}
                              onChange={(v) => {
                                const subarea = subareas.find((s) => s.id === v);
                                setDraft((d) => ({ ...d, subarea_id: v ?? null, subarea_nome: subarea?.nome ?? null }));
                              }}
                              placeholder={draft.area_id ? (subareas.length === 0 ? "Sem subáreas" : "Selecione a subárea") : "Escolha a área primeiro"}
                              disabled={!draft.area_id}
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Pedreiro</Label>
                            <Input
                              type="number"
                              min={0}
                              value={draft.pedreiro ?? 0}
                              onChange={(e) => setDraft((d) => ({ ...d, pedreiro: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Servente</Label>
                            <Input
                              type="number"
                              min={0}
                              value={draft.servente ?? 0}
                              onChange={(e) => setDraft((d) => ({ ...d, servente: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Carpinteiro</Label>
                            <Input
                              type="number"
                              min={0}
                              value={draft.carpinteiro ?? 0}
                              onChange={(e) => setDraft((d) => ({ ...d, carpinteiro: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Outros</Label>
                            <Input
                              type="number"
                              min={0}
                              value={draft.qntdd_funcao ?? 0}
                              onChange={(e) => setDraft((d) => ({ ...d, qntdd_funcao: Number(e.target.value) }))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Observações</Label>
                          <Textarea
                            rows={2}
                            value={draft.obs_planejamento ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, obs_planejamento: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          Total será{" "}
                          <strong>
                            {(draft.pedreiro ?? 0) +
                              (draft.servente ?? 0) +
                              (draft.carpinteiro ?? 0) +
                              (draft.qntdd_funcao ?? 0)}
                          </strong>{" "}
                          pessoas
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => editarMut.mutate({ id: a.id, dados: draft as Record<string, unknown> })}
                            disabled={editarMut.isPending}
                          >
                            {editarMut.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}{" "}
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelarEdicao}>
                            <X className="h-3 w-3" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {etapaAtiva && (
                              <Checkbox
                                className="mt-1"
                                checked={selecionados.has(a.id)}
                                disabled={!!minhaDecisao}
                                onCheckedChange={() => alternar(a.id)}
                              />
                            )}
                            <div>
                              <div className="font-medium">
                                {a.empresa_nome} · {a.atividade_nome}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {a.lideranca_nome} ({a.lideranca_tipo}) · {a.setor_nome}
                                {a.area_nome ? ` / ${a.area_nome}` : ""}
                                {a.subarea_nome ? ` / ${a.subarea_nome}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${CORES_STATUS[status]}`}>
                              {ROTULO_STATUS[status]}
                            </span>
                            {(papel === 'edicao' || a.criado_por === user?.id) && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Editar"
                                  onClick={() => iniciarEdicao(a)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  title="Excluir"
                                  onClick={() => {
                                    if (confirm(`Excluir apontamento de ${a.atividade_nome}?`))
                                      excluirMut.mutate(a.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-secondary px-2 py-0.5">Total {a.total}</span>
                          {a.pedreiro > 0 && (
                            <span className="rounded-full bg-secondary px-2 py-0.5">Pedreiro {a.pedreiro}</span>
                          )}
                          {a.servente > 0 && (
                            <span className="rounded-full bg-secondary px-2 py-0.5">Servente {a.servente}</span>
                          )}
                          {a.carpinteiro > 0 && (
                            <span className="rounded-full bg-secondary px-2 py-0.5">
                              Carpinteiro {a.carpinteiro}
                            </span>
                          )}
                          {a.qntdd_funcao > 0 && (
                            <span className="rounded-full bg-secondary px-2 py-0.5">
                              Outros {a.qntdd_funcao}
                            </span>
                          )}
                        </div>
                        {a.obs_planejamento && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Observações:</span> {a.obs_planejamento}
                          </div>
                        )}
                        {/* Motivo visível, não só no tooltip do badge: quem
                            lançou precisa saber o que corrigir sem caçar. */}
                        {decisoes
                          .filter((d) => d.decisao === "rejeitado" && d.observacao)
                          .map((d) => (
                            <p key={d.id} className="mt-2 text-xs text-red-700 dark:text-red-400">
                              <span className="font-medium">Rejeitado:</span> {d.observacao}
                            </p>
                          ))}
                        {etapasApontamento.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {etapasApontamento.map((e) => {
                              const d = decisoes.find((x) => x.etapa_chave === e.chave);
                              const quem = d ? assinaturas?.get(d.usuario_id) : undefined;
                              return (
                                <span key={e.chave} className="flex items-center gap-1.5">
                                  <Badge
                                    variant={d ? (d.decisao === "confirmado" ? "secondary" : "destructive") : "outline"}
                                    title={d?.observacao ?? e.nome}
                                  >
                                    {e.nome}
                                    {d && (d.decisao === "confirmado" ? " ✓" : " ✕")}
                                  </Badge>
                                  {/* Assinatura de quem decidiu — o badge sozinho
                                      diz a etapa, não a pessoa. */}
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
                              );
                            })}
                            {minhaDecisao && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2"
                                title="Desfazer minha decisão"
                                onClick={async () => {
                                  try {
                                    await desfazer.mutateAsync(minhaDecisao.id);
                                    if (!organizacaoId || !projetoId) throw new Error("Selecione uma obra antes de validar apontamentos");
                                    await sincronizarHorasHomem(organizacaoId, projetoId);
                                    qc.invalidateQueries({ queryKey: ["validacao", organizacaoId, projetoId, data] });
                                    qc.invalidateQueries({ queryKey: ["validacao-calendar", organizacaoId, projetoId, calMonthStr] });
                                    toast.success("Decisão desfeita");
                                  } catch (err) {
                                    toast.error(
                                      `Não foi possível desfazer: ${err instanceof Error ? err.message : err}`,
                                    );
                                  }
                                }}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                        {a.validado && a.validado_em && (
                          <div className="mt-1 text-[11px] text-green-600">
                            Validado em {new Date(a.validado_em).toLocaleString("pt-BR")}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

        </>
      )}

      <AlertDialog open={confirmandoRejeicao} onOpenChange={setConfirmandoRejeicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar {selecionados.size} apontamento(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Diga o que precisa ser corrigido — quem lançou vai ler esse texto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: quantidade de serventes não bate com o efetivo do dia"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivo("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivo.trim()}
              onClick={(e) => {
                // Segura o fechamento pra não perder o texto se o insert falhar.
                e.preventDefault();
                aplicar("rejeitado", motivo);
              }}
            >
              Rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
