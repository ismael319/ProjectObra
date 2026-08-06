import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useAreas } from "@/pages/apontamento/lib/catalog";
import { useFornecedoresConcreto } from "./lib/catalog";
import { downloadNodeAsPdf, downloadNodeAsPng } from "@/lib/png-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

type Carga = { id: string; data: string; ano_mes: string | null; fornecedor_id: string; quantidade_m3: number | string };
type Destino = { carga_id: string; area_id: string | null; quantidade_m3_aplicada: number | string };

function formatAnoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${mes}/${ano}`;
}

// O PostgREST devolve colunas numeric como string (não number) — converter com
// Number() antes de qualquer soma, senão "6.5" + "12.3" vira "06.512.3".
function m3(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Cargas antigas podem ter ano_mes NULL ou vazio (coluna criada depois dos
// dados) — deriva o mês/ano da data quando vier sem preenchimento.
function mesDe(c: Carga): string | null {
  return c.ano_mes || (c.data ? c.data.slice(0, 7) : null);
}

// Sem isso, o Supabase corta a resposta em 1000 linhas por chamada, sem erro
// — organizações com mais cargas que isso (comum depois de importar
// histórico) perdiam dados do dashboard em silêncio. Mesmo padrão já usado
// em qualidade/concreto/lib/excel-export.ts.
async function listarPaginado<T>(tabela: string, colunas: string, organizacaoId: string): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .eq("organizacao_id", organizacaoId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export default function ConcretoDashboard() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);
  const [projetoFiltro, setProjetoFiltro] = useState<string[]>([]); // area_ids
  const [usinaFiltro, setUsinaFiltro] = useState<string | null>(null); // fornecedor_id

  const capturaRef = useRef<HTMLDivElement>(null);
  const [exportando, setExportando] = useState<"imagem" | "pdf" | null>(null);

  const { data: fornecedores = [] } = useFornecedoresConcreto(organizacaoId);
  const { data: areas = [] } = useAreas();

  const { data: cargas = [], isLoading } = useQuery({
    queryKey: ["cargas-concreto-dashboard", organizacaoId],
    queryFn: () => listarPaginado<Carga>("cargas_concreto", "id,data,ano_mes,fornecedor_id,quantidade_m3", organizacaoId!),
    enabled: !!organizacaoId,
  });

  const { data: destinos = [] } = useQuery({
    queryKey: ["destinos-carga-dashboard", organizacaoId],
    queryFn: () => listarPaginado<Destino>("destinos_carga", "carga_id,area_id,quantidade_m3_aplicada", organizacaoId!),
    enabled: !!organizacaoId,
  });

  const fornecedorNomePorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);
  const areaNomePorId = useMemo(() => new Map(areas.map((a) => [a.id, a.nome])), [areas]);

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const c of cargas) {
      const ano = mesDe(c)?.slice(0, 4);
      if (ano) set.add(ano);
    }
    return [...set].sort();
  }, [cargas]);

  // Uma carga pode ter mais de um destino (área) — precisa do conjunto de
  // áreas de cada carga pra filtrar por Projeto, já que área não é campo
  // direto de cargas_concreto.
  const areaIdsPorCarga = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const d of destinos) {
      if (!d.area_id) continue;
      if (!map.has(d.carga_id)) map.set(d.carga_id, new Set());
      map.get(d.carga_id)!.add(d.area_id);
    }
    return map;
  }, [destinos]);

  // Ano/Usina/Projeto filtram os gráficos de mês/usina/área — "Volume total"
  // ignora o filtro de ano de propósito, já que o gráfico inteiro é sobre
  // comparar anos (mas respeita Usina/Projeto — ver porAno).
  // Vários projetos selecionados: a carga entra se tiver destino em QUALQUER
  // um deles (OU, não E) — mesmo critério de todo filtro multi-seleção do app.
  const bateProjeto = (cargaId: string) =>
    projetoFiltro.length === 0 || projetoFiltro.some((id) => areaIdsPorCarga.get(cargaId)?.has(id));

  const cargasFiltradas = useMemo(
    () =>
      cargas.filter((c) => {
        if (anoFiltro && !mesDe(c)?.startsWith(anoFiltro)) return false;
        if (usinaFiltro && c.fornecedor_id !== usinaFiltro) return false;
        if (!bateProjeto(c.id)) return false;
        return true;
      }),
    [cargas, anoFiltro, usinaFiltro, projetoFiltro, areaIdsPorCarga],
  );

  const idsCargasFiltradas = useMemo(() => new Set(cargasFiltradas.map((c) => c.id)), [cargasFiltradas]);

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) {
      const chave = mesDe(c);
      if (!chave) continue;
      map.set(chave, (map.get(chave) ?? 0) + m3(c.quantidade_m3));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([anoMes, total]) => ({ anoMes: formatAnoMes(anoMes), total }));
  }, [cargasFiltradas]);

  const porUsina = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cargasFiltradas) {
      const nome = fornecedorNomePorId.get(c.fornecedor_id) ?? "Sem fornecedor";
      map.set(nome, (map.get(nome) ?? 0) + m3(c.quantidade_m3));
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [cargasFiltradas, fornecedorNomePorId]);

  const porAno = useMemo(() => {
    const totais: Record<string, number> = {};
    for (const c of cargas) {
      if (usinaFiltro && c.fornecedor_id !== usinaFiltro) continue;
      if (!bateProjeto(c.id)) continue;
      const ano = mesDe(c)?.slice(0, 4);
      if (!ano) continue;
      totais[ano] = (totais[ano] ?? 0) + m3(c.quantidade_m3);
    }
    return [{ nome: "Total", ...totais }];
  }, [cargas, usinaFiltro, projetoFiltro, areaIdsPorCarga]);

  const porArea = useMemo(() => {
    const destinosFiltrados = destinos.filter((d) => idsCargasFiltradas.has(d.carga_id));

    const map = new Map<string, number>();
    for (const d of destinosFiltrados) {
      const nome = d.area_id ? areaNomePorId.get(d.area_id) ?? "Área removida" : "Sem destino informado";
      map.set(nome, (map.get(nome) ?? 0) + m3(d.quantidade_m3_aplicada));
    }

    // Carga sem NENHUM destino registrado não aparece em destinos_carga —
    // soma a diferença pra não sumir do total (mesmo espírito dos alertas de
    // "sem cargo"/"sem setor" no Dashboard de Administração).
    const destinadoPorCarga = new Map<string, number>();
    for (const d of destinosFiltrados) {
      destinadoPorCarga.set(d.carga_id, (destinadoPorCarga.get(d.carga_id) ?? 0) + m3(d.quantidade_m3_aplicada));
    }
    let semDestino = 0;
    for (const c of cargasFiltradas) {
      const destinado = destinadoPorCarga.get(c.id) ?? 0;
      const resto = m3(c.quantidade_m3) - destinado;
      if (resto > 0.001) semDestino += resto;
    }
    if (semDestino > 0.001) {
      map.set("Sem destino informado", (map.get("Sem destino informado") ?? 0) + semDestino);
    }

    const ordenado = [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);

    // Top 9 áreas com mais volume; o restante é somado num item "Outros" só —
    // o gráfico fica legível com o ranking real, sem uma cauda de barras
    // minúsculas.
    if (ordenado.length <= 9) return ordenado;
    const top = ordenado.slice(0, 9);
    const resto = ordenado.slice(9).reduce((s, x) => s + x.total, 0);
    return resto > 0.001 ? [...top, { nome: "Outros", total: resto }] : top;
  }, [destinos, idsCargasFiltradas, cargasFiltradas, areaNomePorId]);

  const volumeTotal = cargasFiltradas.reduce((s, c) => s + m3(c.quantidade_m3), 0);

  async function handleExportar(tipo: "imagem" | "pdf") {
    if (!capturaRef.current) return;
    setExportando(tipo);
    try {
      const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
      if (tipo === "imagem") {
        await downloadNodeAsPng(capturaRef.current, `Dashboard_Concreto_${hoje}.png`, "#ffffff");
      } else {
        await downloadNodeAsPdf(capturaRef.current, `Dashboard_Concreto_${hoje}.pdf`, "#ffffff");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Concreto</h1>
          <p className="text-sm text-muted-foreground">Volume total: {volumeTotal.toLocaleString("pt-BR")} m³</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExportar("imagem")} disabled={exportando !== null}>
              {exportando === "imagem" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar imagem
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExportar("pdf")} disabled={exportando !== null}>
              {exportando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Exportar PDF
            </Button>
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
          <div className="w-full sm:w-48 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Projeto</Label>
            <MultiCombobox
              options={areas.map((a) => ({ value: a.id, label: a.nome }))}
              value={projetoFiltro}
              onChange={setProjetoFiltro}
              placeholder="Todos os projetos"
            />
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Usina</Label>
            <Combobox
              options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              value={usinaFiltro}
              onChange={setUsinaFiltro}
              placeholder="Todas as usinas"
            />
          </div>
        </div>
      </div>

      <div ref={capturaRef} className="space-y-4 bg-background p-2">
      <p className="text-xs text-muted-foreground">
        Concreto — Volume total: <strong className="text-foreground">{volumeTotal.toLocaleString("pt-BR")} m³</strong>
        {" · "}Ano: {anoFiltro ?? "todos"}
        {" · "}Projeto: {projetoFiltro.length > 0 ? projetoFiltro.map((id) => areaNomePorId.get(id) ?? id).join(", ") : "todos"}
        {" · "}Usina: {usinaFiltro ? fornecedorNomePorId.get(usinaFiltro) ?? usinaFiltro : "todas"}
      </p>

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
    </div>
  );
}
