import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { todayISO, computeApontamento } from "../lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "../lib/catalog";
import { useCatalogWithOfflineFallback } from "./offline-catalog-cache";
import { useCampoAuth } from "./useCampoAuth";
import { useOnlineStatus } from "./useOnlineStatus";
import { enqueue, listQueue, flushQueue, retryOne, type QueueItem } from "./offline-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, WifiOff } from "lucide-react";

type FormState = {
  data: string;
  empresa_id: string | null;
  lideranca_id: string | null;
  setor_id: string | null;
  area_id: string | null;
  subarea_id: string | null;
  atividade_id: string | null;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  obs_planejamento: string;
};

const emptyForm = (keep?: Partial<FormState>): FormState => ({
  data: keep?.data ?? todayISO(),
  empresa_id: keep?.empresa_id ?? null,
  lideranca_id: keep?.lideranca_id ?? null,
  setor_id: null,
  area_id: null,
  subarea_id: null,
  atividade_id: null,
  pedreiro: 0,
  servente: 0,
  carpinteiro: 0,
  qntdd_funcao: 0,
  obs_planejamento: "",
});

function registerBackgroundSync() {
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
  navigator.serviceWorker.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("flush-lancamentos"))
    .catch(() => {});
}

export default function CampoLancamento() {
  const { ready, error, retry } = useCampoAuth();

  if (error) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <Button onClick={retry} className="mt-4">Tentar novamente</Button>
      </FullScreenMessage>
    );
  }

  if (!ready) {
    return (
      <FullScreenMessage>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">Conectando...</p>
      </FullScreenMessage>
    );
  }

  return <CampoLancamentoForm />;
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      {children}
    </div>
  );
}

function CampoLancamentoForm() {
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [form, setForm] = useState<FormState>(emptyForm());
  const total = form.pedreiro + form.servente + form.carpinteiro + form.qntdd_funcao;

  const empresasQuery = useEmpresas();
  const empresas = useCatalogWithOfflineFallback("empresas", empresasQuery);
  const liderancasQuery = useLiderancas();
  const liderancas = useCatalogWithOfflineFallback("liderancas", liderancasQuery);
  const setoresQuery = useSetores();
  const setores = useCatalogWithOfflineFallback("setores", setoresQuery);
  const areasQuery = useAreas(form.setor_id);
  const areas = useCatalogWithOfflineFallback(`areas:${form.setor_id ?? "none"}`, areasQuery);
  const subareasQuery = useSubareas(form.area_id);
  const subareas = useCatalogWithOfflineFallback(`subareas:${form.area_id ?? "none"}`, subareasQuery);
  const atividadesQuery = useAtividades();
  const atividades = useCatalogWithOfflineFallback("atividades", atividadesQuery);

  const liderancaOpts = useMemo(
    () => liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo })),
    [liderancas],
  );

  const { data: queueItems = [] } = useQuery({ queryKey: ["campo-queue"], queryFn: listQueue });
  const pending = queueItems.filter((i) => i.status === "pendente").length;

  const refreshQueue = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["campo-queue"] });
  }, [qc]);

  const runFlush = useCallback(async () => {
    const result = await flushQueue();
    refreshQueue();
    if (result.synced > 0) toast.success(`${result.synced} lançamento(s) sincronizado(s)`);
    if (result.errored > 0) toast.error(`${result.errored} lançamento(s) com erro ao sincronizar`);
  }, [refreshQueue]);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    runFlush();
    const onOnline = () => runFlush();
    window.addEventListener("online", onOnline);
    const interval = setInterval(runFlush, 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [runFlush]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_QUEUE") runFlush();
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [runFlush]);

  const submitMut = useMutation({
    mutationFn: async (f: FormState) => {
      const empresa = empresas.find((e) => e.id === f.empresa_id);
      const lider = liderancas.find((l) => l.id === f.lideranca_id);
      const setor = setores.find((s) => s.id === f.setor_id);
      const area = areas.find((a) => a.id === f.area_id);
      const subarea = subareas.find((s) => s.id === f.subarea_id);
      const atividade = atividades.find((a) => a.id === f.atividade_id);
      if (!empresa || !lider || !setor || !atividade) throw new Error("Selecione todos os campos obrigatórios");
      const payload = computeApontamento({
        data: f.data,
        empresa_id: empresa.id, empresa_nome: empresa.nome,
        lideranca_id: lider.id, lideranca_nome: lider.nome, lideranca_tipo: lider.tipo,
        setor_id: setor.id, setor_nome: setor.nome,
        area_id: area?.id ?? null, area_nome: area?.nome ?? null,
        subarea_id: subarea?.id ?? null, subarea_nome: subarea?.nome ?? null,
        atividade_id: atividade.id, atividade_nome: atividade.nome,
        pedreiro: f.pedreiro, servente: f.servente, carpinteiro: f.carpinteiro, qntdd_funcao: f.qntdd_funcao,
        obs_planejamento: f.obs_planejamento || null,
        validado: false,
      });
      await enqueue(payload);
      registerBackgroundSync();
      runFlush();
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      setForm((p) => emptyForm({ data: p.data, empresa_id: p.empresa_id, lideranca_id: p.lideranca_id }));
      refreshQueue();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa_id || !form.lideranca_id || !form.setor_id || !form.atividade_id || !form.data) {
      toast.error("Preencha data, empresa, liderança, setor e atividade");
      return;
    }
    if (total === 0) {
      toast.error("Informe ao menos 1 pessoa");
      return;
    }
    submitMut.mutate(form);
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <div className="sticky top-0 z-10 bg-background border-b p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">Lançamento de campo</h1>
          <StatusBadge online={online} pending={pending} />
        </div>
        {pending > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Não feche o app nem troque de aparelho até este número chegar a 0.
          </p>
        )}
      </div>

      <div className="p-3 space-y-4 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Novo apontamento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label>Empresa *</Label>
                <Combobox
                  options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
                  value={form.empresa_id}
                  onChange={(v) => set("empresa_id", v)}
                  placeholder="Selecione a empresa"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Liderança / Encarregado *</Label>
                <Combobox
                  options={liderancaOpts}
                  value={form.lideranca_id}
                  onChange={(v) => set("lideranca_id", v)}
                  placeholder="Selecione a liderança"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Setor *</Label>
                <Combobox
                  options={setores.map((s) => ({ value: s.id, label: s.nome }))}
                  value={form.setor_id}
                  onChange={(v) => setForm((p) => ({ ...p, setor_id: v, area_id: null, subarea_id: null }))}
                  placeholder="Selecione o setor"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Área</Label>
                <Combobox
                  options={areas.map((a) => ({ value: a.id, label: a.nome }))}
                  value={form.area_id}
                  onChange={(v) => setForm((p) => ({ ...p, area_id: v, subarea_id: null }))}
                  placeholder={form.setor_id ? (areas.length === 0 ? "Sem áreas cadastradas" : "Selecione a área") : "Escolha o setor primeiro"}
                  disabled={!form.setor_id}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Combobox
                  options={subareas.map((s) => ({ value: s.id, label: s.nome }))}
                  value={form.subarea_id}
                  onChange={(v) => set("subarea_id", v)}
                  placeholder={form.area_id ? (subareas.length === 0 ? "Sem etapas" : "Selecione a etapa") : "Escolha a área primeiro"}
                  disabled={!form.area_id}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Atividade / Frente *</Label>
                <Combobox
                  options={atividades.map((a) => ({ value: a.id, label: a.nome }))}
                  value={form.atividade_id}
                  onChange={(v) => set("atividade_id", v)}
                  placeholder="Selecione a atividade"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumField label="Pedreiro" value={form.pedreiro} onChange={(v) => set("pedreiro", v)} />
                <NumField label="Servente" value={form.servente} onChange={(v) => set("servente", v)} />
                <NumField label="Carpinteiro" value={form.carpinteiro} onChange={(v) => set("carpinteiro", v)} />
                <NumField label="Qntd. função" value={form.qntdd_funcao} onChange={(v) => set("qntdd_funcao", v)} />
              </div>

              <div className="space-y-1.5">
                <Label>Total</Label>
                <div className="flex h-9 items-center justify-center rounded-md bg-primary/10 px-3 font-semibold text-primary">
                  {total}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.obs_planejamento} onChange={(e) => set("obs_planejamento", e.target.value)} />
              </div>

              <Button type="submit" disabled={submitMut.isPending} className="w-full">
                {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Histórico local</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={runFlush}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {queueItems.map((item) => (
              <QueueRow key={item.id} item={item} onRetry={async () => { await retryOne(item.id); refreshQueue(); runFlush(); }} />
            ))}
            {queueItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lançamento ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ online, pending }: { online: boolean; pending: number }) {
  if (!online) {
    return (
      <Badge variant="outline" className="border-red-300 text-red-600 dark:text-red-400 gap-1">
        <WifiOff className="h-3 w-3" /> Offline
      </Badge>
    );
  }
  if (pending > 0) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
        {pending} pendente{pending > 1 ? "s" : ""}
      </Badge>
    );
  }
  return <Badge className="bg-green-600 hover:bg-green-600 text-white">Tudo sincronizado</Badge>;
}

function QueueRow({ item, onRetry }: { item: QueueItem; onRetry: () => void }) {
  const p = item.payload;
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{p.empresa_nome} · {p.atividade_nome}</div>
          <div className="text-xs text-muted-foreground">
            {p.lideranca_nome} · {p.setor_nome} · Total {p.total}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>
      {item.status === "erro" && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-destructive">{item.erro}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>Tentar novamente</Button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: QueueItem["status"] }) {
  if (status === "sincronizado") return <Badge className="bg-green-600 hover:bg-green-600 text-white">Sincronizado</Badge>;
  if (status === "erro") return <Badge variant="destructive">Erro</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pendente</Badge>;
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
      />
    </div>
  );
}
