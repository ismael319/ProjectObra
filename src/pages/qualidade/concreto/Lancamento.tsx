import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { todayISO, computeCarga } from "./lib/concreto-utils";
import { useFornecedoresConcreto, useTracosConcreto } from "./lib/catalog";
import { enqueue, listPending, remove as removePending, drain } from "./lib/offline-queue";
import { useOnlineStatus, isNetworkError } from "@/lib/offline-query";
import { DestinoRow, novoDestino, type DestinoForm } from "./components/DestinoRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Wifi, WifiOff, RefreshCw } from "lucide-react";

type FormState = {
  data: string;
  fornecedor_id: string | null;
  traco_id: string | null;
  quantidade_m3: number | "";
  peso_balanca_kg: number | null;
  preco_unitario: number | null;
  nota_fiscal: string;
  destinos: DestinoForm[];
};

const emptyForm = (keep?: Partial<FormState>): FormState => ({
  data: keep?.data ?? todayISO(),
  fornecedor_id: null,
  traco_id: null,
  quantidade_m3: "",
  peso_balanca_kg: null,
  preco_unitario: null,
  nota_fiscal: "",
  destinos: [novoDestino()],
});

export default function ConcretoLancamentoPage() {
  const qc = useQueryClient();
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId);
  const { data: tracos = [] } = useTracosConcreto(organizacaoId);

  const fornecedorSelecionado = useMemo(
    () => fornecedores.find((f) => f.id === form.fornecedor_id) ?? null,
    [fornecedores, form.fornecedor_id],
  );
  const tracoSelecionado = useMemo(
    () => tracos.find((t) => t.id === form.traco_id) ?? null,
    [tracos, form.traco_id],
  );
  const tipoOrigem = fornecedorSelecionado?.tipo ?? null;

  const preview = useMemo(() => {
    if (!tipoOrigem || !tracoSelecionado || !form.quantidade_m3) return null;
    return computeCarga({
      data: form.data,
      tipo_origem: tipoOrigem,
      traco: tracoSelecionado,
      quantidade_m3: Number(form.quantidade_m3),
      peso_balanca_kg: form.peso_balanca_kg,
      preco_unitario: form.preco_unitario,
    });
  }, [tipoOrigem, tracoSelecionado, form.quantidade_m3, form.data, form.peso_balanca_kg, form.preco_unitario]);

  function handleFornecedorChange(v: string | null) {
    const fornecedor = fornecedores.find((f) => f.id === v) ?? null;
    setForm((p) => ({
      ...p,
      fornecedor_id: v,
      // Campos que só fazem sentido pra um tipo de origem não sobrevivem à
      // troca de fornecedor — evita mandar peso de balança numa carga
      // externa ou preço "esquecido" numa carga própria.
      peso_balanca_kg: fornecedor?.tipo === "propria" ? p.peso_balanca_kg : null,
      preco_unitario: fornecedor?.tipo === "externa" ? p.preco_unitario : null,
      nota_fiscal: fornecedor?.tipo === "externa" ? p.nota_fiscal : "",
    }));
  }

  function handleTracoChange(v: string | null) {
    const traco = tracos.find((t) => t.id === v) ?? null;
    setForm((p) => ({
      ...p,
      traco_id: v,
      // Preço de referência do traço pré-preenche o preço da carga externa —
      // usuário pode sobrescrever se o preço negociado for outro.
      preco_unitario: tipoOrigem === "externa" ? traco?.preco_unitario_m3 ?? null : p.preco_unitario,
    }));
  }

  function updateDestino(key: string, novo: DestinoForm) {
    setForm((p) => ({ ...p, destinos: p.destinos.map((d) => (d.key === key ? novo : d)) }));
  }

  function adicionarDestino() {
    setForm((p) => ({ ...p, destinos: [...p.destinos, novoDestino()] }));
  }

  function removerDestino(key: string) {
    setForm((p) => ({ ...p, destinos: p.destinos.filter((d) => d.key !== key) }));
  }

  const { data: doDia, refetch } = useQuery({
    queryKey: ["cargas-concreto-dia", form.data, organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas_concreto")
        .select("*")
        .eq("organizacao_id", organizacaoId!)
        .eq("data", form.data);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => (b.criado_em ?? "").localeCompare(a.criado_em ?? ""));
    },
    enabled: !!organizacaoId,
  });

  const fornecedorNomePorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);
  const tracoNomePorId = useMemo(() => new Map(tracos.map((t) => [t.id, t.nome])), [tracos]);

  const online = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);

  const { data: pendentes = [], refetch: refetchPendentes } = useQuery({
    queryKey: ["cargas-concreto-pendentes"],
    queryFn: () => listPending(),
    networkMode: "always",
  });
  const pendentesDoDia = useMemo(
    () => pendentes.filter((p) => p.payload.data === form.data),
    [pendentes, form.data],
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await drain();
      if (result.synced.length > 0) {
        toast.success(`${result.synced.length} carga(s) sincronizada(s)`);
        refetch();
        qc.invalidateQueries({ queryKey: ["cargas-concreto-dia"] });
      }
      if (result.errored.length > 0) {
        toast.error(`${result.errored.length} carga(s) com erro — revise na lista`);
      }
      refetchPendentes();
    } finally {
      setSyncing(false);
    }
  }, [refetch, refetchPendentes, qc]);

  useEffect(() => {
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  const insertMut = useMutation({
    mutationFn: async (f: FormState) => {
      const fornecedor = fornecedores.find((x) => x.id === f.fornecedor_id);
      const traco = tracos.find((x) => x.id === f.traco_id);
      if (!fornecedor || !traco) throw new Error("Selecione fornecedor e traço");
      const origem = fornecedor.tipo;
      const quantidade = Number(f.quantidade_m3);

      const computed = computeCarga({
        data: f.data,
        tipo_origem: origem,
        traco,
        quantidade_m3: quantidade,
        peso_balanca_kg: origem === "propria" ? f.peso_balanca_kg : null,
        preco_unitario: origem === "externa" ? f.preco_unitario : null,
      });

      const id = crypto.randomUUID();
      const payload = {
        id,
        organizacao_id: organizacaoId,
        data: f.data,
        fornecedor_id: fornecedor.id,
        tipo_origem: origem,
        traco_id: traco.id,
        quantidade_m3: quantidade,
        peso_bruto_teorico_kg: computed.peso_bruto_teorico_kg,
        peso_balanca_kg: computed.peso_balanca_kg,
        perda_kg: computed.perda_kg,
        perda_pct: computed.perda_pct,
        preco_unitario: computed.preco_unitario,
        preco_total: computed.preco_total,
        nota_fiscal: origem === "externa" ? (f.nota_fiscal || null) : null,
        ano_mes: computed.ano_mes,
        ano_semana: computed.ano_semana,
        validado: false,
        validado_em: null,
        criado_por: user?.id ?? null,
        criado_por_nome: user?.email ?? null,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      };

      const destinosValidos = f.destinos
        .filter((d) => !!d.setor_id)
        .map((d) => ({
          id: crypto.randomUUID(),
          organizacao_id: organizacaoId,
          carga_id: id,
          setor_id: d.setor_id,
          area_id: d.area_id,
          etapa_concreto_id: d.etapa_concreto_id,
          quantidade_m3_aplicada: d.quantidade_m3_aplicada ?? quantidade,
          observacao: d.observacao || null,
        }));

      // `id` gerado sempre (mesmo online) é a chave de idempotência — se o
      // envio "aparentemente" falhar por rede mas na verdade já tiver
      // chegado no servidor, o retry (imediato ou via fila) usa o mesmo id e
      // o upsert com ignoreDuplicates absorve a duplicata sem violar RLS.
      // Mesmo padrão de apontamento/lib/offline-queue.ts.
      if (!navigator.onLine) {
        await enqueue(payload, destinosValidos);
        return { queued: true };
      }

      const { error: cargaError, status: cargaStatus } = await supabase
        .from("cargas_concreto")
        .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
      if (cargaError) {
        if (isNetworkError(cargaError, cargaStatus)) {
          await enqueue(payload, destinosValidos);
          return { queued: true };
        }
        throw cargaError;
      }

      if (destinosValidos.length > 0) {
        const { error: destinosError, status: destinosStatus } = await supabase
          .from("destinos_carga")
          .upsert(destinosValidos, { onConflict: "id", ignoreDuplicates: true });
        if (destinosError) {
          if (isNetworkError(destinosError, destinosStatus)) {
            // A carga já chegou no servidor — reenfileirar o item inteiro é
            // seguro porque o upsert da carga é idempotente (só os destinos
            // efetivamente entram no retry).
            await enqueue(payload, destinosValidos);
            return { queued: true };
          }
          throw destinosError;
        }
      }

      return { queued: false };
    },
    // Sem isso, o React Query nem chama mutationFn offline — mesmo motivo já
    // documentado em apontamento/Lancamento.tsx.
    networkMode: "always",
    onSuccess: (r) => {
      toast.success(r.queued ? "Salvo no dispositivo — será enviado quando houver conexão" : "Carga registrada");
      setForm((p) => emptyForm({ data: p.data }));
      refetch();
      qc.invalidateQueries({ queryKey: ["cargas-concreto-dia"] });
      refetchPendentes();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cargas_concreto").delete().eq("id", id);
      if (error) throw error;
    },
    networkMode: "always",
    onSuccess: () => { toast.success("Removido"); refetch(); qc.invalidateQueries({ queryKey: ["cargas-concreto-dia"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePendingMut = useMutation({
    mutationFn: (id: string) => removePending(id),
    networkMode: "always",
    onSuccess: () => { toast.success("Removido do dispositivo"); refetchPendentes(); },
  });

  const rows = useMemo(() => {
    const pendingRows = pendentesDoDia.map((p) => ({
      ...p.payload,
      _pending: true as const,
      _queueId: p.id,
      _status: p.status,
      _lastError: p.lastError,
    }));
    const serverRows = (doDia ?? []).map((r: any) => ({ ...r, _pending: false as const }));
    return [...pendingRows, ...serverRows];
  }, [pendentesDoDia, doDia]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fornecedor_id || !form.traco_id || !form.data) {
      toast.error("Preencha data, fornecedor e traço");
      return;
    }
    if (!form.quantidade_m3 || Number(form.quantidade_m3) <= 0) {
      toast.error("Informe a quantidade em m³");
      return;
    }
    insertMut.mutate(form);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          {online ? (
            <Wifi className="h-4 w-4 text-emerald-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-amber-600" />
          )}
          <span className={online ? "text-muted-foreground" : "font-medium text-amber-600"}>
            {online ? "Online" : "Offline — os lançamentos ficam salvos no aparelho"}
          </span>
          {pendentes.length > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              {pendentes.length} pendente(s) de envio
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={sync}
          disabled={!online || syncing || pendentes.length === 0}
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar agora
        </Button>
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Nova carga de concreto</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lance uma carga por vez. Você pode adicionar várias para o mesmo dia.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} required />
            </div>

            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <Combobox
                options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
                value={form.fornecedor_id}
                onChange={handleFornecedorChange}
                placeholder="Selecione o fornecedor"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Traço *</Label>
              <Combobox
                options={tracos.map((t) => ({ value: t.id, label: `${t.nome} (${t.fck_mpa} MPa)` }))}
                value={form.traco_id}
                onChange={handleTracoChange}
                placeholder="Selecione o traço"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Quantidade (m³) *</Label>
              <Input
                type="number"
                step="any"
                min={0}
                value={form.quantidade_m3}
                onChange={(e) => setForm((p) => ({ ...p, quantidade_m3: e.target.value === "" ? "" : Number(e.target.value) }))}
              />
            </div>

            {tipoOrigem === "propria" && (
              <div className="space-y-1.5">
                <Label>Peso na balança (kg)</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={form.peso_balanca_kg ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, peso_balanca_kg: e.target.value === "" ? null : Number(e.target.value) }))}
                />
              </div>
            )}

            {tipoOrigem === "externa" && (
              <>
                <div className="space-y-1.5">
                  <Label>Preço unitário (R$/m³)</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={form.preco_unitario ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, preco_unitario: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nota fiscal</Label>
                  <Input value={form.nota_fiscal} onChange={(e) => setForm((p) => ({ ...p, nota_fiscal: e.target.value }))} />
                </div>
              </>
            )}

            {tipoOrigem === "propria" && tracoSelecionado && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
                <p className="font-medium text-foreground mb-1">Consumo de insumos do traço (por m³)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  <span>Cimento: {tracoSelecionado.consumo_cimento_kg_m3 ?? "—"} kg</span>
                  <span>Brita 0: {tracoSelecionado.consumo_brita00_kg_m3 ?? "—"} kg</span>
                  <span>Brita 1: {tracoSelecionado.consumo_brita01_kg_m3 ?? "—"} kg</span>
                  <span>Pó de brita: {tracoSelecionado.consumo_po_brita_kg_m3 ?? "—"} kg</span>
                  <span>Areia: {tracoSelecionado.consumo_areia_kg_m3 ?? "—"} kg</span>
                  <span>Água: {tracoSelecionado.consumo_agua_l_m3 ?? "—"} l</span>
                  <span>Aditivo 1: {tracoSelecionado.consumo_aditivo1_l_m3 ?? "—"} l</span>
                  <span>Aditivo 2: {tracoSelecionado.consumo_aditivo2_l_m3 ?? "—"} l</span>
                </div>
                {preview && (
                  <p className="mt-2 text-foreground">
                    Peso teórico: <strong>{preview.peso_bruto_teorico_kg?.toFixed(1)} kg</strong>
                  </p>
                )}
              </div>
            )}

            {tipoOrigem === "externa" && preview?.preco_total != null && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Preço total: <strong className="text-foreground">R$ {preview.preco_total.toFixed(2)}</strong>
              </p>
            )}

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Destino da carga</Label>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={adicionarDestino}>
                  <Plus className="h-3 w-3" /> Adicionar outro destino
                </Button>
              </div>
              <div className="space-y-2">
                {form.destinos.map((d, i) => (
                  <DestinoRow
                    key={d.key}
                    destino={d}
                    onChange={(novo) => updateDestino(d.key, novo)}
                    onRemove={form.destinos.length > 1 ? () => removerDestino(d.key) : undefined}
                  />
                ))}
              </div>
              {form.destinos.every((d) => !d.setor_id) && (
                <p className="text-xs text-muted-foreground">Opcional — pode informar depois.</p>
              )}
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setForm(emptyForm())}>Limpar</Button>
              <Button type="submit" disabled={insertMut.isPending}>
                {insertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cargas de {form.data}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {rows.length} carga(s) · Total {rows.reduce((s, r) => s + (r.quantidade_m3 ?? 0), 0)} m³
          </p>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
          {rows.map((r) => (
            <div key={r._pending ? `pending-${r._queueId}` : r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {fornecedorNomePorId.get(r.fornecedor_id) ?? "—"} · {tracoNomePorId.get(r.traco_id) ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.tipo_origem === "propria" ? "Usina própria" : "Fornecedor externo"} · {r.quantidade_m3} m³
                  </div>
                </div>
                <button
                  onClick={() => (r._pending ? removePendingMut.mutate(r._queueId) : delMut.mutate(r.id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {r._pending && r._status === "error" ? (
                  <Chip variant="error">Erro — revise: {r._lastError}</Chip>
                ) : r._pending ? (
                  <Chip variant="pending">Pendente de envio</Chip>
                ) : null}
                {r.tipo_origem === "externa" && r.preco_total != null && (
                  <Chip>R$ {Number(r.preco_total).toFixed(2)}</Chip>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma carga lançada ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Chip({ children, variant }: { children: React.ReactNode; variant?: "pending" | "error" }) {
  const cls =
    variant === "error"
      ? "bg-destructive/10 text-destructive"
      : variant === "pending"
        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
        : "bg-secondary text-secondary-foreground";
  return <span className={`rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}
