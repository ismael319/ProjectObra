import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO, formatBR, computeApontamento } from "./lib/date-utils";
import { CheckCircle2, Undo2, Loader2, Clock, Pencil, Trash2, Save, X } from "lucide-react";
import { Calendar, CalendarDayButton } from "./ui/calendar";

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
  empresa_nome: string;
  lideranca_nome: string;
  lideranca_tipo: string;
  setor_nome: string;
  area_nome: string | null;
  subarea_nome: string | null;
  atividade_nome: string;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  total: number;
  obs_planejamento: string | null;
  validado: boolean;
  validado_em: string | null;
  criado_em?: string | null;
}

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
    queryKey: ["dias_trabalho", data],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("dias_trabalho")
        .select("horas_dia")
        .eq("data", data)
        .maybeSingle();
      if (error) throw error;
      return row as { horas_dia: number } | null;
    },
    enabled: !!data,
  });

  const { data: apontamentos = [], isFetching } = useQuery({
    queryKey: ["validacao", data],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("apontamentos_diarios")
        .select("*")
        .eq("data", data);
      if (error) throw error;
      return (rows as Apontamento[]).sort((a, b) => (a.criado_em ?? "").localeCompare(b.criado_em ?? ""));
    },
    enabled: !!data,
  });

  const calMonthStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
  const calStart = `${calMonthStr}-01`;
  const calEnd = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: calData = [] } = useQuery({
    queryKey: ["validacao-calendar", calMonthStr],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("apontamentos_diarios")
        .select("data,validado")
        .gte("data", calStart)
        .lte("data", calEnd);
      if (error) throw error;
      return (rows ?? []) as { data: string; validado: boolean }[];
    },
  });

  const calDayStatus = useMemo(() => {
    const map = new Map<string, "pendente" | "validado">();
    for (const r of calData) {
      const existing = map.get(r.data);
      if (existing === "pendente") continue;
      map.set(r.data, r.validado ? "validado" : "pendente");
    }
    return map;
  }, [calData]);

  const todosValidados = apontamentos.length > 0 && apontamentos.every((a) => a.validado);

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
      const { criado_em, atualizado_em, validado, validado_em, id: _id, ...rest } = dados;
      const payload = computeApontamento({
        ...rest,
        pedreiro: Number(rest.pedreiro ?? 0),
        servente: Number(rest.servente ?? 0),
        carpinteiro: Number(rest.carpinteiro ?? 0),
        qntdd_funcao: Number(rest.qntdd_funcao ?? 0),
      });
      const { error } = await supabase.from("apontamentos_diarios").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Apontamento atualizado");
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["validacao", data] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("apontamentos_diarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Apontamento excluído");
      qc.invalidateQueries({ queryKey: ["validacao", data] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const iniciarEdicao = (a: Apontamento) => {
    setDraft({
      atividade_nome: a.atividade_nome,
      empresa_nome: a.empresa_nome,
      lideranca_nome: a.lideranca_nome,
      lideranca_tipo: a.lideranca_tipo,
      setor_nome: a.setor_nome,
      area_nome: a.area_nome,
      subarea_nome: a.subarea_nome,
      pedreiro: a.pedreiro,
      servente: a.servente,
      carpinteiro: a.carpinteiro,
      qntdd_funcao: a.qntdd_funcao,
    });
    setEditandoId(a.id);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setDraft({});
  };

  const validarMut = useMutation({
    mutationFn: async () => {
      const validar = !todosValidados;
      const now = validar ? new Date().toISOString() : null;

      const { error: updErr } = await supabase
        .from("apontamentos_diarios")
        .update({ validado: validar, validado_em: now })
        .eq("data", data);
      if (updErr) throw updErr;

      // Grava a jornada do dia — é o que falta pra "Total pessoas" virar
      // horas-homem de verdade (pessoas × horas trabalhadas) em vez de só
      // contagem de gente, tanto aqui quanto na tela de EAP.
      if (validar) {
        const { error: diaErr } = await supabase
          .from("dias_trabalho")
          .upsert({ data, horas_dia: horasTrab, atualizado_em: new Date().toISOString() });
        if (diaErr) throw diaErr;
      }

      const { data: validados } = await supabase
        .from("apontamentos_diarios")
        .select("atividade_id,atividade_nome,total,data")
        .eq("validado", true);
      if (!validados) throw new Error("Erro ao buscar apontamentos validados");

      const { data: diasTrabalho } = await supabase.from("dias_trabalho").select("data,horas_dia");
      const horasDiaMap = new Map<string, number>((diasTrabalho ?? []).map((d) => [d.data, d.horas_dia]));
      const HORAS_DIA_PADRAO = 8; // fallback pra apontamentos validados antes desta jornada existir

      const { data: itens } = await supabase
        .from("cronograma_itens")
        .select("id,cronograma_id,nome,atividade_id,pai_id,ativo");
      if (!itens) throw new Error("Erro ao buscar itens do cronograma");

      const horasPorAtivId = new Map<string, number>();
      const horasPorNome = new Map<string, number>();
      for (const a of validados) {
        const horasHomem = a.total * (horasDiaMap.get(a.data) ?? HORAS_DIA_PADRAO);
        if (a.atividade_id) {
          horasPorAtivId.set(a.atividade_id, (horasPorAtivId.get(a.atividade_id) ?? 0) + horasHomem);
        }
        horasPorNome.set(a.atividade_nome, (horasPorNome.get(a.atividade_nome) ?? 0) + horasHomem);
      }

      const itensAtivos = (itens ?? []).filter((i) => i.ativo !== false);

      const filhosByPai = new Map<string, typeof itensAtivos>();
      for (const item of itensAtivos) {
        if (item.pai_id) {
          const list = filhosByPai.get(item.pai_id) ?? [];
          list.push(item);
          filhosByPai.set(item.pai_id, list);
        }
      }

      const hhMap = new Map<string, number>();
      function calcHh(item: (typeof itensAtivos)[0]): number {
        const filhos = filhosByPai.get(item.id) ?? [];
        if (filhos.length === 0) {
          let horas = 0;
          if (item.atividade_id) {
            horas = horasPorAtivId.get(item.atividade_id) ?? 0;
          } else {
            horas = horasPorNome.get(item.nome) ?? 0;
          }
          hhMap.set(item.id, horas);
          return horas;
        }
        let total = 0;
        for (const filho of filhos) {
          total += calcHh(filho);
        }
        hhMap.set(item.id, total);
        return total;
      }

      const raizes = itensAtivos.filter((i) => !i.pai_id);
      for (const raiz of raizes) {
        calcHh(raiz);
      }

      for (const [id, hh] of hhMap) {
        await supabase.from("cronograma_itens").update({ hh_consumido: hh }).eq("id", id);
      }
    },
    onSuccess: () => {
      const acao = todosValidados ? "desfeita" : "confirmada";
      toast.success(`Validação ${acao}`);
      qc.invalidateQueries({ queryKey: ["validacao", data] });
      qc.invalidateQueries({ queryKey: ["cronograma_itens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
                              status === "validado" ? "bg-green-500" : "bg-red-500"
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
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Aguardando validação
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Validação concluída
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
                Jornada já validada para este dia: <strong>{diaTrabalho.horas_dia}h</strong> — confirmar de novo substitui pelo valor acima.
              </span>
            )}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apontamentos do dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {apontamentos.map((a) => {
                const emEdicao = editandoId === a.id;
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border p-3 text-sm ${a.validado ? "bg-green-50 border-green-200" : ""}`}
                  >
                    {emEdicao ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Empresa</Label>
                            <Input
                              value={draft.empresa_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, empresa_nome: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Atividade</Label>
                            <Input
                              value={draft.atividade_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, atividade_nome: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Liderança</Label>
                            <Input
                              value={draft.lideranca_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, lideranca_nome: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Tipo liderança</Label>
                            <Input
                              value={draft.lideranca_tipo ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, lideranca_tipo: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Setor</Label>
                            <Input
                              value={draft.setor_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, setor_nome: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Área</Label>
                            <Input
                              value={draft.area_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, area_nome: e.target.value || null }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Subárea</Label>
                            <Input
                              value={draft.subarea_nome ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, subarea_nome: e.target.value || null }))}
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 grid-cols-4">
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
                          <div className="flex items-center gap-1.5">
                            {a.validado ? (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Validado
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )}
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

          <div className="flex justify-end gap-2">
            <Button
              size="lg"
              onClick={() => validarMut.mutate()}
              disabled={validarMut.isPending}
              variant={todosValidados ? "outline" : "default"}
            >
              {validarMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : todosValidados ? (
                <Undo2 className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {todosValidados ? "Desfazer validação" : "Confirmar validação"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
