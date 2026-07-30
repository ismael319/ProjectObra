import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useAreas } from "@/pages/apontamento/lib/catalog";
import { useFornecedoresConcreto } from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

type Carga = { id: string; ano_mes: string; fornecedor_id: string; quantidade_m3: number };
type Destino = { carga_id: string; area_id: string | null; quantidade_m3_aplicada: number };

function formatAnoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

export default function ConcretoDashboard() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId);
  const { data: areas = [] } = useAreas();

  const { data: cargas = [], isLoading } = useQuery({
    queryKey: ["cargas-concreto-dashboard", organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas_concreto")
        .select("id,ano_mes,fornecedor_id,quantidade_m3")
        .eq("organizacao_id", organizacaoId!);
      if (error) throw error;
      return (data ?? []) as Carga[];
    },
    enabled: !!organizacaoId,
  });

  const { data: destinos = [] } = useQuery({
    queryKey: ["destinos-carga-dashboard", organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinos_carga")
        .select("carga_id,area_id,quantidade_m3_aplicada")
        .eq("organizacao_id", organizacaoId!);
      if (error) throw error;
      return (data ?? []) as Destino[];
    },
    enabled: !!organizacaoId,
  });

  const fornecedorNomePorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);
  const areaNomePorId = useMemo(() => new Map(areas.map((a) => [a.id, a.nome])), [areas]);

  const anos = useMemo(
    () => [...new Set(cargas.map((c) => c.ano_mes?.slice(0, 4)).filter(Boolean))].sort(),
    [cargas],
  );

  // O ano filtra os gráficos de mês/usina/área — "Volume total" ignora o
  // filtro de propósito, já que o gráfico inteiro é sobre comparar anos.
  const cargasFiltradas = useMemo(
    () => (anoFiltro ? cargas.filter((c) => c.ano_mes?.startsWith(anoFiltro)) : cargas),
    [cargas, anoFiltro],
  );

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) map.set(c.ano_mes, (map.get(c.ano_mes) ?? 0) + c.quantidade_m3);
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([anoMes, total]) => ({ anoMes: formatAnoMes(anoMes), total }));
  }, [cargasFiltradas]);

  const porUsina = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) {
      const nome = fornecedorNomePorId.get(c.fornecedor_id) ?? "Sem fornecedor";
      map.set(nome, (map.get(nome) ?? 0) + c.quantidade_m3);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [cargasFiltradas, fornecedorNomePorId]);

  const porAno = useMemo(() => {
    const totais: Record<string, number> = {};
    for (const c of cargas) {
      const ano = c.ano_mes?.slice(0, 4);
      if (!ano) continue;
      totais[ano] = (totais[ano] ?? 0) + c.quantidade_m3;
    }
    return [{ nome: "Total", ...totais }];
  }, [cargas]);

  const porArea = useMemo(() => {
    const anoPorCargaId = new Map(cargas.map((c) => [c.id, c.ano_mes?.slice(0, 4)]));
    const destinosFiltrados = anoFiltro
      ? destinos.filter((d) => anoPorCargaId.get(d.carga_id) === anoFiltro)
      : destinos;

    const map = new Map<string, number>();
    for (const d of destinosFiltrados) {
      const nome = d.area_id ? areaNomePorId.get(d.area_id) ?? "Área removida" : "Sem destino informado";
      map.set(nome, (map.get(nome) ?? 0) + d.quantidade_m3_aplicada);
    }

    // Carga sem NENHUM destino registrado não aparece em destinos_carga —
    // soma a diferença pra não sumir do total (mesmo espírito dos alertas de
    // "sem cargo"/"sem setor" no Dashboard de Administração).
    const destinadoPorCarga = new Map<string, number>();
    for (const d of destinosFiltrados) {
      destinadoPorCarga.set(d.carga_id, (destinadoPorCarga.get(d.carga_id) ?? 0) + d.quantidade_m3_aplicada);
    }
    let semDestino = 0;
    for (const c of cargasFiltradas) {
      const destinado = destinadoPorCarga.get(c.id) ?? 0;
      const resto = c.quantidade_m3 - destinado;
      if (resto > 0.001) semDestino += resto;
    }
    if (semDestino > 0.001) {
      map.set("Sem destino informado", (map.get("Sem destino informado") ?? 0) + semDestino);
    }

    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [destinos, cargas, cargasFiltradas, anoFiltro, areaNomePorId]);

  const volumeTotal = cargasFiltradas.reduce((s, c) => s + c.quantidade_m3, 0);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Concreto</h1>
          <p className="text-sm text-muted-foreground">Volume total: {volumeTotal.toLocaleString("pt-BR")} m³</p>
        </div>
        <div className="w-full sm:w-48 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Combobox
            options={anos.map((a) => ({ value: a, label: a }))}
            value={anoFiltro}
            onChange={setAnoFiltro}
            placeholder="Todos os anos"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Volume de concreto/mês (m³)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="anoMes" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" name="m³" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Volume de concreto / Usina (m³)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Pie data={porUsina} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={(entry: any) => `${entry.total.toLocaleString("pt-BR")}`}>
                  {porUsina.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Volume total (m³)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porAno}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {anos.map((ano, i) => (
                  <Bar key={ano} dataKey={ano} name={ano} stackId="total" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Concreto / Área (m³)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(300, porArea.length * 40)}>
            <BarChart data={porArea}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" name="m³" radius={[4, 4, 0, 0]}>
                {porArea.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
