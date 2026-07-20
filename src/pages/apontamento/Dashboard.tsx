import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO, formatBR } from "./lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPdf } from "./lib/pdf-export";
import type { Apontamento } from "./lib/excel-export";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export default function DashboardPage() {
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(todayISO());
  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [liderancaIds, setLiderancaIds] = useState<string[]>([]);
  const [setorIds, setSetorIds] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [subareaIds, setSubareaIds] = useState<string[]>([]);
  const [atividadeIds, setAtividadeIds] = useState<string[]>([]);

  const { data: empresas = [] } = useEmpresas(false);
  const { data: liderancas = [] } = useLiderancas(false);
  const { data: setores = [] } = useSetores(false);
  const { data: areas = [] } = useAreas(null, false);
  const { data: subareas = [] } = useSubareas(null, false);
  const { data: atividades = [] } = useAtividades(false);

  const { data: apontamentos = [], isLoading } = useQuery({
    queryKey: ["dashboard", dataInicio, dataFim, empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds],
    queryFn: async () => {
      let q = supabase
        .from("apontamentos_diarios")
        .select("*")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: true });
      if (empresaIds.length > 0) q = q.in("empresa_id", empresaIds);
      if (liderancaIds.length > 0) q = q.in("lideranca_id", liderancaIds);
      if (setorIds.length > 0) q = q.in("setor_id", setorIds);
      if (areaIds.length > 0) q = q.in("area_id", areaIds);
      if (subareaIds.length > 0) q = q.in("subarea_id", subareaIds);
      if (atividadeIds.length > 0) q = q.in("atividade_id", atividadeIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Apontamento[];
    },
  });

  const resumo = useMemo(() => {
    const acc = { pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0, registros: apontamentos.length };
    for (const a of apontamentos) {
      acc.pedreiro += a.pedreiro;
      acc.servente += a.servente;
      acc.carpinteiro += a.carpinteiro;
      acc.qntdd_funcao += a.qntdd_funcao;
      acc.total += a.total;
    }
    return acc;
  }, [apontamentos]);

  const porEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of apontamentos) map.set(a.empresa_nome, (map.get(a.empresa_nome) ?? 0) + a.total);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [apontamentos]);

  const porFuncao = useMemo(() => {
    const items: { name: string; value: number }[] = [];
    if (resumo.pedreiro > 0) items.push({ name: "Pedreiro", value: resumo.pedreiro });
    if (resumo.servente > 0) items.push({ name: "Servente", value: resumo.servente });
    if (resumo.carpinteiro > 0) items.push({ name: "Carpinteiro", value: resumo.carpinteiro });
    if (resumo.qntdd_funcao > 0) items.push({ name: "Outros", value: resumo.qntdd_funcao });
    return items;
  }, [resumo]);

  const handleDownloadPdf = () => {
    if (apontamentos.length === 0) { toast.warning("Nenhum registro para exportar"); return; }
    downloadPdf(apontamentos, dataInicio, dataFim);
    toast.success("PDF gerado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Resumo Diário</h1>
          <p className="text-sm text-muted-foreground">Visão geral dos apontamentos de mão de obra.</p>
        </div>
        <Button onClick={handleDownloadPdf} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar PDF
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Data início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <MultiCombobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={empresaIds} onChange={setEmpresaIds} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Liderança</Label>
              <MultiCombobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaIds} onChange={setLiderancaIds} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <MultiCombobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={setorIds} onChange={setSetorIds} placeholder="Todos" />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <MultiCombobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={areaIds} onChange={setAreaIds} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <MultiCombobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={subareaIds} onChange={setSubareaIds} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <MultiCombobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={atividadeIds} onChange={setAtividadeIds} placeholder="Todas" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Registros</div><div className="mt-1 text-3xl font-bold">{resumo.registros}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total pessoas</div><div className="mt-1 text-3xl font-bold">{resumo.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pedreiros</div><div className="mt-1 text-3xl font-bold">{resumo.pedreiro}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Serventes</div><div className="mt-1 text-3xl font-bold">{resumo.servente}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Carpinteiro + Outros</div><div className="mt-1 text-3xl font-bold">{resumo.carpinteiro + resumo.qntdd_funcao}</div></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Por Empresa</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porEmpresa}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Pessoas" fill="#2563eb" radius={[4, 4, 0, 0]}>
                  {porEmpresa.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Função</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={porFuncao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {porFuncao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}