import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO, formatBR, computeApontamento } from "./lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";

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

export default function LancamentoPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const total = form.pedreiro + form.servente + form.carpinteiro + form.qntdd_funcao;

  const { data: empresas = [] } = useEmpresas();
  const { data: liderancas = [] } = useLiderancas();
  const { data: setores = [] } = useSetores();
  const { data: areas = [] } = useAreas(form.setor_id);
  const { data: subareas = [] } = useSubareas(form.area_id);
  const { data: atividades = [] } = useAtividades();

  const liderancaOpts = useMemo(
    () => liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo })),
    [liderancas],
  );

  const { data: doDia, refetch } = useQuery({
    queryKey: ["apontamentos-dia", form.data],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apontamentos_diarios")
        .select("*")
        .eq("data", form.data);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => (b.criado_em ?? "").localeCompare(a.criado_em ?? ""));
    },
  });

  const insertMut = useMutation({
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
      const { error } = await supabase.from("apontamentos_diarios").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Apontamento registrado");
      setForm((p) => emptyForm({ data: p.data, empresa_id: p.empresa_id, lideranca_id: p.lideranca_id }));
      refetch();
      qc.invalidateQueries({ queryKey: ["apontamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("apontamentos_diarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); refetch(); qc.invalidateQueries({ queryKey: ["apontamentos"] }); },
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
    insertMut.mutate(form);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Novo apontamento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lance uma frente de serviço por vez. Você pode adicionar várias para o mesmo dia.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-1.5 sm:col-span-2">
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

            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-3">
              <NumField label="Pedreiro" value={form.pedreiro} onChange={(v) => set("pedreiro", v)} />
              <NumField label="Servente" value={form.servente} onChange={(v) => set("servente", v)} />
              <NumField label="Carpinteiro" value={form.carpinteiro} onChange={(v) => set("carpinteiro", v)} />
              <NumField label="Qntd. função" value={form.qntdd_funcao} onChange={(v) => set("qntdd_funcao", v)} />
              <div className="space-y-1.5">
                <Label>Total</Label>
                <div className="flex h-9 items-center justify-center rounded-md bg-primary/10 px-3 font-semibold text-primary">
                  {total}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.obs_planejamento} onChange={(e) => set("obs_planejamento", e.target.value)} />
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
          <CardTitle className="text-base">Lançamentos de {formatBR(form.data)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {doDia?.length ?? 0} frente(s) · Total {doDia?.reduce((s, r) => s + r.total, 0) ?? 0} pessoa(s)
          </p>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
          {(doDia ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{r.empresa_nome} · {r.atividade_nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.lideranca_nome} ({r.lideranca_tipo}) · {r.setor_nome}
                    {r.area_nome ? ` / ${r.area_nome}` : ""}
                    {r.subarea_nome ? ` / ${r.subarea_nome}` : ""}
                  </div>
                </div>
                <button onClick={() => delMut.mutate(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Chip>Total {r.total}</Chip>
                {r.pedreiro > 0 && <Chip>Pedreiro {r.pedreiro}</Chip>}
                {r.servente > 0 && <Chip>Servente {r.servente}</Chip>}
                {r.carpinteiro > 0 && <Chip>Carpinteiro {r.carpinteiro}</Chip>}
                {r.qntdd_funcao > 0 && <Chip>Outros {r.qntdd_funcao}</Chip>}
              </div>
            </div>
          ))}
          {(doDia?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lançamento ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{children}</span>;
}
