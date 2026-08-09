import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO, formatBR } from "./lib/date-utils";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiCombobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tooltip as InfoTooltip, TooltipContent as InfoTooltipContent,
  TooltipProvider as InfoTooltipProvider, TooltipTrigger as InfoTooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { Download, Loader2, CalendarDays, LineChart as LineChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPdf } from "./lib/pdf-export";
import { groupSum, type Apontamento, type Aggregate } from "./lib/excel-export";
import { useMediaQuery } from "@/lib/use-media-query";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

function formatDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ResumoTable({
  titulo, coluna, rows, tooltipFor,
}: {
  titulo: string; coluna: string; rows: Aggregate[]; tooltipFor?: (key: string) => ReactNode;
}) {
  const totalGeral = rows.reduce((s, r) => s + r.total, 0);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>
        <InfoTooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{coluna}</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                    Nenhum registro no período.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const conteudo = tooltipFor?.(r.key);
                  if (!conteudo) {
                    return (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{r.key}</TableCell>
                        <TableCell className="text-right font-semibold">{r.total}</TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <InfoTooltip key={r.key}>
                      <InfoTooltipTrigger asChild>
                        <TableRow>
                          <TableCell className="font-medium">{r.key}</TableCell>
                          <TableCell className="text-right font-semibold">{r.total}</TableCell>
                        </TableRow>
                      </InfoTooltipTrigger>
                      <InfoTooltipContent side="right" align="start" className="max-w-none">
                        {conteudo}
                      </InfoTooltipContent>
                    </InfoTooltip>
                  );
                })
              )}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalGeral}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </InfoTooltipProvider>
      </CardContent>
    </Card>
  );
}

type Aba = "resumo" | "linha-do-tempo";

export default function DashboardPage() {
  const [aba, setAba] = useState<Aba>("resumo");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Resumo</h1>
          <p className="text-sm text-muted-foreground">Distribuição de efetivo — apontamentos de mão de obra.</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
          <button
            onClick={() => setAba("resumo")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              aba === "resumo" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Resumo diário
          </button>
          <button
            onClick={() => setAba("linha-do-tempo")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              aba === "linha-do-tempo" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChartIcon className="h-3.5 w-3.5" /> Linha do tempo
          </button>
        </div>
      </div>

      {aba === "resumo" ? <ResumoDiarioTab /> : <LinhaDoTempoTab />}
    </div>
  );
}

// Página 1 — mesmo conteúdo que já existia (visão de um único dia, com
// gráficos e tabelas por empresa/função/encarregado/área).
function ResumoDiarioTab() {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [data, setData] = useState(todayISO());
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
    queryKey: ["dashboard", data, empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds],
    queryFn: async () => {
      let q = supabase
        .from("apontamentos_diarios")
        .select("*")
        .eq("data", data)
        .order("data", { ascending: true });
      if (empresaIds.length > 0) q = q.in("empresa_id", empresaIds);
      if (liderancaIds.length > 0) q = q.in("lideranca_id", liderancaIds);
      if (setorIds.length > 0) q = q.in("setor_id", setorIds);
      if (areaIds.length > 0) q = q.in("area_id", areaIds);
      if (subareaIds.length > 0) q = q.in("subarea_id", subareaIds);
      if (atividadeIds.length > 0) q = q.in("atividade_id", atividadeIds);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as Apontamento[];
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
  const porEmpresaGrafico = isMobile ? porEmpresa.slice(0, 5) : porEmpresa;

  // Encarregados da BDR (empresa própria) separados do restante das
  // empreiteiras — dois quadros em vez de uma lista só misturada, mais fácil
  // de bater o efetivo próprio contra o terceirizado de relance.
  const ehBDR = (a: Apontamento) => a.empresa_nome?.trim().toUpperCase().includes("BDR") ?? false;
  const apontamentosBDR = useMemo(() => apontamentos.filter(ehBDR), [apontamentos]);
  const apontamentosOutrasEmpresas = useMemo(() => apontamentos.filter((a) => !ehBDR(a)), [apontamentos]);

  const porEncarregadoBDR = useMemo(
    () => groupSum(apontamentosBDR, (a) => a.lideranca_nome).sort((a, b) => a.key.localeCompare(b.key, "pt-BR")),
    [apontamentosBDR]
  );
  // Outras empresas: por empresa (nome + quantidade), não por encarregado —
  // BDR já tem o quadro próprio de encarregados ao lado.
  const porEmpresaOutras = useMemo(
    () => groupSum(apontamentosOutrasEmpresas, (a) => a.empresa_nome).sort((a, b) => b.total - a.total),
    [apontamentosOutrasEmpresas]
  );

  const porArea = useMemo(
    () => groupSum(apontamentos, (a) => a.area_nome ?? "Sem área").sort((a, b) => a.key.localeCompare(b.key, "pt-BR")),
    [apontamentos]
  );

  // Detalhe pro balão de cada encarregado: quebra por função (pedreiro/
  // servente/carpinteiro/outros) e por atividade em que ele apareceu.
  const detalheEncarregado = useMemo(() => {
    const map = new Map<string, { pedreiro: number; servente: number; carpinteiro: number; qntdd_funcao: number; atividades: Map<string, number> }>();
    for (const a of apontamentos) {
      const k = a.lideranca_nome;
      if (!map.has(k)) map.set(k, { pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, atividades: new Map() });
      const g = map.get(k)!;
      g.pedreiro += a.pedreiro; g.servente += a.servente; g.carpinteiro += a.carpinteiro; g.qntdd_funcao += a.qntdd_funcao;
      g.atividades.set(a.atividade_nome, (g.atividades.get(a.atividade_nome) ?? 0) + a.total);
    }
    return map;
  }, [apontamentos]);

  // Detalhe pro balão de cada área: quais encarregados tiveram gente
  // apontada ali e quantas pessoas cada um.
  const detalheArea = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const a of apontamentos) {
      const k = a.area_nome ?? "Sem área";
      if (!map.has(k)) map.set(k, new Map());
      const g = map.get(k)!;
      g.set(a.lideranca_nome, (g.get(a.lideranca_nome) ?? 0) + a.total);
    }
    return map;
  }, [apontamentos]);

  const porFuncao = useMemo(() => {
    const items: { name: string; value: number }[] = [];
    if (resumo.pedreiro > 0) items.push({ name: "Pedreiro", value: resumo.pedreiro });
    if (resumo.servente > 0) items.push({ name: "Servente", value: resumo.servente });
    if (resumo.carpinteiro > 0) items.push({ name: "Carpinteiro", value: resumo.carpinteiro });
    if (resumo.qntdd_funcao > 0) items.push({ name: "Outros", value: resumo.qntdd_funcao });
    return items;
  }, [resumo]);

  const handleDownloadPdf = async () => {
    if (apontamentos.length === 0) { toast.warning("Nenhum registro para exportar"); return; }
    await downloadPdf(apontamentos, data, data);
    toast.success("PDF gerado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-muted-foreground">Visão geral dos apontamentos de mão de obra em {formatBR(data)}.</p>
        <Button onClick={handleDownloadPdf} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar PDF
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Registros</div><div className="mt-1 text-3xl font-bold">{resumo.registros}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total pessoas</div><div className="mt-1 text-3xl font-bold">{resumo.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Pedreiros</div><div className="mt-1 text-3xl font-bold">{resumo.pedreiro}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Serventes</div><div className="mt-1 text-3xl font-bold">{resumo.servente}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Carpinteiros</div><div className="mt-1 text-3xl font-bold">{resumo.carpinteiro}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Outros</div><div className="mt-1 text-3xl font-bold">{resumo.qntdd_funcao}</div></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Por Empresa{isMobile && porEmpresa.length > 5 ? " (Top 5)" : ""}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart
                data={porEmpresaGrafico}
                layout={isMobile ? "vertical" : "horizontal"}
                margin={isMobile ? { top: 0, right: 8, left: 0, bottom: 0 } : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" />
                {isMobile ? (
                  <>
                    <XAxis type="number" tick={{ fontSize: 9 }} tickCount={4} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={78} tick={{ fontSize: 9 }} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                  </>
                )}
                <Tooltip />
                <Bar dataKey="value" name="Pessoas" fill="#2563eb" radius={isMobile ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
                  {porEmpresaGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Função</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <PieChart>
                <Pie
                  data={porFuncao}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={isMobile ? 68 : 100}
                  label={isMobile ? false : ({ name, value }) => `${name}: ${value}`}
                >
                  {porFuncao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={isMobile ? { fontSize: 10 } : undefined} iconSize={isMobile ? 8 : 14} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ResumoTable
          titulo="Encarregados BDR"
          coluna="Encarregado"
          rows={porEncarregadoBDR}
          tooltipFor={(key) => {
            const det = detalheEncarregado.get(key);
            if (!det) return null;
            const atividades = [...det.atividades.entries()].sort((a, b) => b[1] - a[1]);
            return (
              <div className="space-y-1.5">
                <div>
                  <p className="font-semibold">Por função</p>
                  <p>Pedreiro {det.pedreiro} · Servente {det.servente} · Carpinteiro {det.carpinteiro} · Outros {det.qntdd_funcao}</p>
                </div>
                <div>
                  <p className="font-semibold">Por atividade</p>
                  <ul className="list-disc pl-4">
                    {atividades.map(([nome, total]) => <li key={nome}>{nome}: {total}</li>)}
                  </ul>
                </div>
              </div>
            );
          }}
        />

        <div className="space-y-6">
          <ResumoTable
            titulo="Funcionários por Área"
            coluna="Área"
            rows={porArea}
            tooltipFor={(key) => {
              const det = detalheArea.get(key);
              if (!det || det.size === 0) return null;
              const encarregados = [...det.entries()].sort((a, b) => b[1] - a[1]);
              return (
                <div>
                  <p className="font-semibold">Encarregados</p>
                  <ul className="list-disc pl-4">
                    {encarregados.map(([nome, total]) => <li key={nome}>{nome}: {total}</li>)}
                  </ul>
                </div>
              );
            }}
          />
          <ResumoTable
            titulo="Outras Empresas"
            coluna="Empresa"
            rows={porEmpresaOutras}
          />
        </div>
      </div>
    </div>
  );
}

type PontoEfetivo = {
  data: string;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  total: number;
  label: string;
};

// Balão do gráfico de linha: a linha em si só mostra o Total, mas passar o
// mouse revela a quebra por função daquele dia.
function EfetivoTooltip({ active, payload }: { active?: boolean; payload?: { payload: PontoEfetivo }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold">{formatBR(d.data)}</p>
      <p className="text-sm font-bold text-primary">Total: {d.total}</p>
      <div className="pt-1.5 border-t space-y-0.5 text-muted-foreground">
        <p>Pedreiro: <span className="font-medium text-foreground">{d.pedreiro}</span></p>
        <p>Servente: <span className="font-medium text-foreground">{d.servente}</span></p>
        <p>Carpinteiro: <span className="font-medium text-foreground">{d.carpinteiro}</span></p>
        <p>Outros: <span className="font-medium text-foreground">{d.qntdd_funcao}</span></p>
      </div>
    </div>
  );
}

// Página 2 — evolução do efetivo dia a dia num período (não só um dia único),
// com o mesmo conjunto de filtros (empresa/liderança/setor/área/etapa/
// atividade) da página de Resumo diário, reaproveitando apontamentos_diarios.
function LinhaDoTempoTab() {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [dataInicio, setDataInicio] = useState(() => isoDaysAgo(29));
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
    queryKey: ["linha-do-tempo", dataInicio, dataFim, empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds],
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
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as Apontamento[];
    },
  });

  // Um ponto na linha do tempo por dia — soma pedreiro/servente/carpinteiro/
  // outros de todos os apontamentos daquele dia já filtrados acima.
  const porDia = useMemo(() => {
    const map = new Map<string, { data: string; pedreiro: number; servente: number; carpinteiro: number; qntdd_funcao: number; total: number }>();
    for (const a of apontamentos) {
      const k = a.data;
      if (!map.has(k)) map.set(k, { data: k, pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0 });
      const g = map.get(k)!;
      g.pedreiro += a.pedreiro;
      g.servente += a.servente;
      g.carpinteiro += a.carpinteiro;
      g.qntdd_funcao += a.qntdd_funcao;
      g.total += a.total;
    }
    return [...map.values()]
      .sort((x, y) => x.data.localeCompare(y.data))
      .map((d) => ({ ...d, label: formatDiaMes(d.data) }));
  }, [apontamentos]);

  const resumoPeriodo = useMemo(() => {
    const diasComApontamento = porDia.length;
    const totalPessoasDia = porDia.reduce((s, d) => s + d.total, 0);
    const pico = porDia.reduce((max, d) => (d.total > max.total ? d : max), { data: "", total: 0 });
    return {
      diasComApontamento,
      totalPessoasDia,
      mediaDiaria: diasComApontamento > 0 ? Math.round(totalPessoasDia / diasComApontamento) : 0,
      pico,
    };
  }, [porDia]);
  const intervaloTicks = isMobile ? Math.max(0, Math.ceil(porDia.length / 5) - 1) : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Evolução do efetivo dia a dia no período selecionado.</p>

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
              <Label>Encarregado</Label>
              <MultiCombobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaIds} onChange={setLiderancaIds} placeholder="Todos" />
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Dias com apontamento</div><div className="mt-1 text-3xl font-bold">{resumoPeriodo.diasComApontamento}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total pessoas-dia</div><div className="mt-1 text-3xl font-bold">{resumoPeriodo.totalPessoasDia}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Média diária</div><div className="mt-1 text-3xl font-bold">{resumoPeriodo.mediaDiaria}</div></CardContent></Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pico</div>
            <div className="mt-1 text-3xl font-bold">{resumoPeriodo.pico.total}</div>
            {resumoPeriodo.pico.data && <div className="text-xs text-muted-foreground">{formatBR(resumoPeriodo.pico.data)}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Efetivo por dia</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : porDia.length === 0 ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Nenhum apontamento no período/filtro selecionado.</div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 360}>
              <LineChart data={porDia} margin={isMobile ? { top: 12, right: 8, left: -24, bottom: 0 } : { top: 24, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11 }} interval={isMobile ? intervaloTicks : undefined} />
                <YAxis allowDecimals={false} tick={{ fontSize: isMobile ? 9 : 12 }} tickCount={isMobile ? 4 : 5} />
                <Tooltip content={<EfetivoTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke={COLORS[0]}
                  strokeWidth={2}
                  dot={{ r: isMobile ? 2 : 3, fill: COLORS[0] }}
                  activeDot={{ r: isMobile ? 4 : 5 }}
                  label={isMobile ? false : { position: "top", fontSize: 11, fill: COLORS[0] }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
