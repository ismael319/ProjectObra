import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO, formatBR } from "./lib/date-utils";
import { CHART_COLORS } from "@/lib/chart-colors";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MultiCombobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tooltip as InfoTooltip, TooltipContent as InfoTooltipContent,
  TooltipProvider as InfoTooltipProvider, TooltipTrigger as InfoTooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Download,
  HardHat,
  LineChart as LineChartIcon,
  Loader2,
  RotateCcw,
  Settings2,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPdf } from "./lib/pdf-export";
import { groupSum, type Apontamento, type Aggregate } from "./lib/excel-export";
import { useMediaQuery } from "@/lib/use-media-query";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { fetchWithOfflineCacheDetailed } from "@/lib/offline-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EffortDashboardSkeleton, EffortKpiCard } from "./components/EffortKpiCard";
import { FilterPanel } from "./components/FilterPanel";

const COLORS = CHART_COLORS;
const DASHBOARD_CACHE_MAX_AGE = 30 * 24 * 60 * 60_000;
const EMPTY_APONTAMENTOS: Apontamento[] = [];
const FILTER_CONTROL_CLASS = "min-h-11 sm:min-h-9";
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--popover-foreground)",
};

function buildDashboardCacheKey(name: string, scope: string, values: unknown[]) {
  return `${name}:v1:${scope}:${JSON.stringify(values)}`;
}

function sortFilters(filters: string[][]) {
  return filters.map((items) => [...items].sort());
}

function summarizeFilter(label: string, ids: string[], options: { id: string; nome: string }[]) {
  if (ids.length === 0) return null;
  const firstName = options.find((option) => option.id === ids[0])?.nome ?? `${ids.length} selecionados`;
  return `${label}: ${firstName}${ids.length > 1 ? ` +${ids.length - 1}` : ""}`;
}

// Dimensão por onde os quadros configuráveis do Resumo podem agrupar os
// apontamentos — as mesmas seis usadas nos filtros acima, só que aqui como
// "por onde essa tabela/gráfico enxerga o efetivo" em vez de "o que incluir".
type Dimensao = "empresa" | "lideranca" | "setor" | "area" | "subarea" | "atividade";

const DIMENSAO_LABEL: Record<Dimensao, string> = {
  empresa: "Empresa", lideranca: "Encarregado", setor: "Setor", area: "Área", subarea: "Etapa", atividade: "Atividade",
};

const DIMENSAO_OPCOES: Dimensao[] = ["empresa", "lideranca", "setor", "area", "subarea", "atividade"];

function chaveDimensao(a: Apontamento, dim: Dimensao): string {
  switch (dim) {
    case "empresa": return a.empresa_nome;
    case "lideranca": return a.lideranca_nome;
    case "setor": return a.setor_nome;
    case "area": return a.area_nome ?? "Sem área";
    case "subarea": return a.subarea_nome ?? "Sem etapa";
    case "atividade": return a.atividade_nome;
  }
}

// Quais quadros do Resumo diário aparecem e por qual dimensão cada um agrupa
// — os valores abaixo são exatamente o layout que já existia antes disso virar
// configurável, então quem nunca mexeu continua vendo a mesma tela de sempre.
type QuadrosConfig = {
  kpiRegistros: boolean;
  kpiTotal: boolean;
  kpiPedreiro: boolean;
  kpiServente: boolean;
  kpiCarpinteiro: boolean;
  kpiOutros: boolean;
  graficoBarras: boolean;
  graficoBarrasDimensao: Dimensao;
  graficoPizza: boolean;
  tabelaDetalhe: boolean;
  tabelaDetalheDimensao: Dimensao;
  tabelaDetalheSepararBDR: boolean;
  tabelaArea: boolean;
  tabelaAreaDimensao: Dimensao;
};

const QUADROS_CONFIG_PADRAO: QuadrosConfig = {
  kpiRegistros: true,
  kpiTotal: true,
  kpiPedreiro: true,
  kpiServente: true,
  kpiCarpinteiro: true,
  kpiOutros: true,
  graficoBarras: true,
  graficoBarrasDimensao: "empresa",
  graficoPizza: true,
  tabelaDetalhe: true,
  tabelaDetalheDimensao: "lideranca",
  tabelaDetalheSepararBDR: true,
  tabelaArea: true,
  tabelaAreaDimensao: "area",
};

// Preferência pessoal de exibição (não é dado de obra) — guardada só no
// navegador, por usuário, sem precisar de tabela nova no Supabase pra isso.
function quadrosConfigStorageKey(userId: string) {
  return `apontamento-resumo-quadros:v1:${userId}`;
}

function loadQuadrosConfig(userId: string): QuadrosConfig {
  try {
    const raw = localStorage.getItem(quadrosConfigStorageKey(userId));
    if (!raw) return QUADROS_CONFIG_PADRAO;
    return { ...QUADROS_CONFIG_PADRAO, ...JSON.parse(raw) };
  } catch {
    return QUADROS_CONFIG_PADRAO;
  }
}

function saveQuadrosConfig(userId: string, config: QuadrosConfig) {
  try {
    localStorage.setItem(quadrosConfigStorageKey(userId), JSON.stringify(config));
  } catch {
    // localStorage indisponível (modo privado, cota cheia etc.) — a tela
    // continua funcionando, só não lembra a configuração na próxima visita.
  }
}

function CachedDataNotice({ cachedAt }: { cachedAt: number }) {
  const updatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(cachedAt));
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
      Sem conexão: exibindo dados salvos em {updatedAt}.
    </p>
  );
}

function DataUnavailableNotice() {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100">
      Dados indisponíveis para este período e filtro. Conecte-se à internet para carregá-los.
    </p>
  );
}

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

// Balão padrão de detalhe: a quebra por função (pedreiro/servente/carpinteiro/
// outros) que o próprio Aggregate de groupSum já carrega — sem precisar de
// nenhum mapa de detalhe à parte por fora da tabela.
function tooltipPorFuncao(row: Aggregate): ReactNode {
  if (row.pedreiro === 0 && row.servente === 0 && row.carpinteiro === 0 && row.qntdd_funcao === 0) return null;
  return (
    <p>
      Pedreiro {row.pedreiro} · Servente {row.servente} · Carpinteiro {row.carpinteiro} · Outros {row.qntdd_funcao}
    </p>
  );
}

function ResumoTable({
  titulo, coluna, rows, isMobile, tooltipFor,
}: {
  titulo: string; coluna: string; rows: Aggregate[]; isMobile: boolean; tooltipFor?: (row: Aggregate) => ReactNode;
}) {
  const totalGeral = rows.reduce((s, r) => s + r.total, 0);

  if (isMobile) {
    return (
      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{titulo}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <div className="border-t px-4 py-10 text-center">
              <ClipboardList className="mx-auto size-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">Nenhum registro no período.</p>
            </div>
          ) : (
            <div className="divide-y border-t">
              {rows.map((row) => {
                const content = tooltipFor?.(row);
                if (!content) {
                  return (
                    <div key={row.key} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{row.key}</span>
                      <span className="shrink-0 text-lg font-bold tabular-nums">{row.total}</span>
                    </div>
                  );
                }
                return (
                  <Collapsible key={row.key}>
                    <CollapsibleTrigger asChild>
                      <button type="button" className="group flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left">
                        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{row.key}</span>
                        <span className="text-lg font-bold tabular-nums">{row.total}</span>
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        {content}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm font-semibold">
                <span>Total</span>
                <span className="text-lg tabular-nums">{totalGeral}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

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
                  const conteudo = tooltipFor?.(r);
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

function DimensaoSelect({ value, onChange }: { value: Dimensao; onChange: (d: Dimensao) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Dimensao)}>
      <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        {DIMENSAO_OPCOES.map((d) => <SelectItem key={d} value={d}>{DIMENSAO_LABEL[d]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Painel de "Configurar quadros" do Resumo diário — os quadros de sempre
// continuam sendo a proposta (QUADROS_CONFIG_PADRAO), mas aqui dá pra
// esconder qualquer um deles ou trocar por qual dimensão cada tabela/gráfico
// agrupa o efetivo.
function ConfigurarQuadrosDialog({
  open, onOpenChange, config, onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: QuadrosConfig;
  onChange: (config: QuadrosConfig) => void;
}) {
  const set = <K extends keyof QuadrosConfig>(key: K, value: QuadrosConfig[K]) => onChange({ ...config, [key]: value });
  type KpiKey = "kpiRegistros" | "kpiTotal" | "kpiPedreiro" | "kpiServente" | "kpiCarpinteiro" | "kpiOutros";
  const kpiOpcoes: { key: KpiKey; label: string }[] = [
    { key: "kpiRegistros", label: "Registros" },
    { key: "kpiTotal", label: "Total pessoas" },
    { key: "kpiPedreiro", label: "Pedreiros" },
    { key: "kpiServente", label: "Serventes" },
    { key: "kpiCarpinteiro", label: "Carpinteiros" },
    { key: "kpiOutros", label: "Outros" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar quadros do resumo</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Quadros de números</p>
            <div className="grid grid-cols-2 gap-2">
              {kpiOpcoes.map(({ key, label }) => (
                <label key={key} className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox checked={config[key]} onCheckedChange={(v) => set(key, !!v)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
              <Checkbox checked={config.graficoBarras} onCheckedChange={(v) => set("graficoBarras", !!v)} />
              Gráfico de barras
            </label>
            {config.graficoBarras && (
              <div className="space-y-1.5 pl-6">
                <Label className="text-xs text-muted-foreground">Agrupar por</Label>
                <DimensaoSelect value={config.graficoBarrasDimensao} onChange={(d) => set("graficoBarrasDimensao", d)} />
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
              <Checkbox checked={config.graficoPizza} onCheckedChange={(v) => set("graficoPizza", !!v)} />
              Gráfico de pizza (Por Função)
            </label>
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
              <Checkbox checked={config.tabelaDetalhe} onCheckedChange={(v) => set("tabelaDetalhe", !!v)} />
              Tabela de detalhamento
            </label>
            {config.tabelaDetalhe && (
              <div className="space-y-2 pl-6">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Agrupar por</Label>
                  <DimensaoSelect value={config.tabelaDetalheDimensao} onChange={(d) => set("tabelaDetalheDimensao", d)} />
                </div>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox checked={config.tabelaDetalheSepararBDR} onCheckedChange={(v) => set("tabelaDetalheSepararBDR", !!v)} />
                  Separar encarregados próprios (BDR) das empresas terceirizadas
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
              <Checkbox checked={config.tabelaArea} onCheckedChange={(v) => set("tabelaArea", !!v)} />
              Segunda tabela
            </label>
            {config.tabelaArea && (
              <div className="space-y-1.5 pl-6">
                <Label className="text-xs text-muted-foreground">Agrupar por</Label>
                <DimensaoSelect value={config.tabelaAreaDimensao} onChange={(d) => set("tabelaAreaDimensao", d)} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onChange(QUADROS_CONFIG_PADRAO)} className="min-h-11">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar padrão
          </Button>
          <Button onClick={() => onOpenChange(false)} className="min-h-11">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Aba = "resumo" | "linha-do-tempo";

export default function DashboardPage() {
  const [aba, setAba] = useState<Aba>("resumo");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Resumo</h1>
          <p className="text-sm text-muted-foreground">Distribuição de efetivo — apontamentos de mão de obra.</p>
        </div>
        <div className="flex w-full items-center gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          <button
            type="button"
            onClick={() => setAba("resumo")}
            aria-pressed={aba === "resumo"}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors sm:min-h-10 sm:flex-none ${
              aba === "resumo" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Resumo diário
          </button>
          <button
            type="button"
            onClick={() => setAba("linha-do-tempo")}
            aria-pressed={aba === "linha-do-tempo"}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors sm:min-h-10 sm:flex-none ${
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
  const { user, userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? null;
  const projetoId = currentProject?.id ?? null;
  const cacheScope = user && organizacaoId && projetoId ? `${organizacaoId}:${projetoId}:${user.id}` : "pending";
  const cacheReady = !!user && !!organizacaoId && !!projetoId;
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

  const sortedFilters = sortFilters([empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds]);
  const { data: apontamentosResult, isLoading, isError } = useQuery({
    queryKey: ["dashboard", organizacaoId, projetoId, cacheScope, data, ...sortedFilters],
    queryFn: () => fetchWithOfflineCacheDetailed(
      buildDashboardCacheKey("apontamento-dashboard", cacheScope, [data, ...sortedFilters]),
      async () => {
        let q = supabase
          .from("apontamentos_diarios")
          .select("*")
          .eq("organizacao_id", organizacaoId!)
          .eq("projeto_id", projetoId!)
          .eq("data", data)
          .order("data", { ascending: true })
          .retry(false);
        if (empresaIds.length > 0) q = q.in("empresa_id", empresaIds);
        if (liderancaIds.length > 0) q = q.in("lideranca_id", liderancaIds);
        if (setorIds.length > 0) q = q.in("setor_id", setorIds);
        if (areaIds.length > 0) q = q.in("area_id", areaIds);
        if (subareaIds.length > 0) q = q.in("subarea_id", subareaIds);
        if (atividadeIds.length > 0) q = q.in("atividade_id", atividadeIds);
        const { data: rows, error, status } = await q;
        return { data: error ? null : (rows ?? []) as Apontamento[], error, status };
      },
      { maxAgeMs: DASHBOARD_CACHE_MAX_AGE },
    ),
    enabled: cacheReady,
    networkMode: "always",
    retry: false,
    refetchOnReconnect: "always",
  });
  const apontamentos = apontamentosResult?.data ?? EMPTY_APONTAMENTOS;

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

  // Layout dos quadros (quais aparecem, por qual dimensão cada um agrupa) —
  // preferência pessoal salva no navegador; QUADROS_CONFIG_PADRAO reproduz
  // exatamente o que a tela sempre mostrou, então quem nunca abriu "Configurar
  // quadros" não percebe diferença nenhuma.
  const [quadrosConfigOpen, setQuadrosConfigOpen] = useState(false);
  const [quadrosConfig, setQuadrosConfig] = useState<QuadrosConfig>(() => loadQuadrosConfig(user?.id ?? "anon"));
  useEffect(() => {
    if (user?.id) saveQuadrosConfig(user.id, quadrosConfig);
  }, [quadrosConfig, user?.id]);

  const porDimensaoGrafico = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of apontamentos) {
      const k = chaveDimensao(a, quadrosConfig.graficoBarrasDimensao);
      map.set(k, (map.get(k) ?? 0) + a.total);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [apontamentos, quadrosConfig.graficoBarrasDimensao]);
  const porDimensaoGraficoExibicao = useMemo(() => {
    if (!isMobile || porDimensaoGrafico.length <= 5) return porDimensaoGrafico;
    const principais = porDimensaoGrafico.slice(0, 5);
    const outros = porDimensaoGrafico.slice(5).reduce((total, item) => total + item.value, 0);
    return [...principais, { name: "Outros", value: outros }];
  }, [isMobile, porDimensaoGrafico]);

  // Encarregados da BDR (empresa própria) separados do restante das
  // empreiteiras — dois quadros em vez de uma lista só misturada, mais fácil
  // de bater o efetivo próprio contra o terceirizado de relance. Opcional:
  // "Separar por BDR" pode ser desligado em Configurar quadros, virando uma
  // tabela só com todo mundo junto.
  const ehBDR = (a: Apontamento) => a.empresa_nome?.trim().toUpperCase().includes("BDR") ?? false;
  const apontamentosBDR = useMemo(() => apontamentos.filter(ehBDR), [apontamentos]);
  const apontamentosOutrasEmpresas = useMemo(() => apontamentos.filter((a) => !ehBDR(a)), [apontamentos]);

  const tabelaDetalhePrincipal = useMemo(() => {
    const base = quadrosConfig.tabelaDetalheSepararBDR ? apontamentosBDR : apontamentos;
    return groupSum(base, (a) => chaveDimensao(a, quadrosConfig.tabelaDetalheDimensao)).sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
  }, [apontamentos, apontamentosBDR, quadrosConfig.tabelaDetalheDimensao, quadrosConfig.tabelaDetalheSepararBDR]);
  const tabelaDetalheOutras = useMemo(
    () => groupSum(apontamentosOutrasEmpresas, (a) => chaveDimensao(a, quadrosConfig.tabelaDetalheDimensao)).sort((a, b) => b.total - a.total),
    [apontamentosOutrasEmpresas, quadrosConfig.tabelaDetalheDimensao]
  );

  const tabelaArea = useMemo(
    () => groupSum(apontamentos, (a) => chaveDimensao(a, quadrosConfig.tabelaAreaDimensao)).sort((a, b) => a.key.localeCompare(b.key, "pt-BR")),
    [apontamentos, quadrosConfig.tabelaAreaDimensao]
  );

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
  const activeFilterCount = [empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds]
    .filter((items) => items.length > 0).length;
  const filterSummary = [
    summarizeFilter("Empresa", empresaIds, empresas),
    summarizeFilter("Liderança", liderancaIds, liderancas),
    summarizeFilter("Setor", setorIds, setores),
    summarizeFilter("Área", areaIds, areas),
    summarizeFilter("Etapa", subareaIds, subareas),
    summarizeFilter("Atividade", atividadeIds, atividades),
  ].filter((item) => item !== null).join(" · ");
  const clearFilters = () => {
    setEmpresaIds([]);
    setLiderancaIds([]);
    setSetorIds([]);
    setAreaIds([]);
    setSubareaIds([]);
    setAtividadeIds([]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-muted-foreground">Visão geral dos apontamentos de mão de obra em {formatBR(data)}.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setQuadrosConfigOpen(true)} className="min-h-11 w-full sm:w-auto">
            <Settings2 className="h-4 w-4" />
            Configurar quadros
          </Button>
          <Button onClick={handleDownloadPdf} disabled={isLoading || isError} className="min-h-11 w-full sm:w-auto">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      <ConfigurarQuadrosDialog
        open={quadrosConfigOpen}
        onOpenChange={setQuadrosConfigOpen}
        config={quadrosConfig}
        onChange={setQuadrosConfig}
      />

      {apontamentosResult?.source === "cache" && <CachedDataNotice cachedAt={apontamentosResult.cachedAt} />}

      <FilterPanel isMobile={isMobile} activeCount={activeFilterCount} summary={filterSummary} onClear={clearFilters}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="resumo-data">Data</Label>
              <Input id="resumo-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <MultiCombobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={empresaIds} onChange={setEmpresaIds} placeholder="Todas" ariaLabel="Filtrar por empresa" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Liderança</Label>
              <MultiCombobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaIds} onChange={setLiderancaIds} placeholder="Todas" ariaLabel="Filtrar por liderança" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <MultiCombobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={setorIds} onChange={setSetorIds} placeholder="Todos" ariaLabel="Filtrar por setor" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <MultiCombobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={areaIds} onChange={setAreaIds} placeholder="Todas" ariaLabel="Filtrar por área" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <MultiCombobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={subareaIds} onChange={setSubareaIds} placeholder="Todas" ariaLabel="Filtrar por etapa" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <MultiCombobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={atividadeIds} onChange={setAtividadeIds} placeholder="Todas" ariaLabel="Filtrar por atividade" className={FILTER_CONTROL_CLASS} />
            </div>
          </div>
      </FilterPanel>

      {isLoading ? <EffortDashboardSkeleton kpiCount={6} desktopColumns={6} /> : isError ? <DataUnavailableNotice /> : <>
      {(quadrosConfig.kpiRegistros || quadrosConfig.kpiTotal || quadrosConfig.kpiPedreiro || quadrosConfig.kpiServente || quadrosConfig.kpiCarpinteiro || quadrosConfig.kpiOutros) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
          {quadrosConfig.kpiRegistros && <EffortKpiCard title="Registros" value={resumo.registros} icon={ClipboardList} accent="#2563eb" iconBackgroundClassName="bg-blue-50 dark:bg-blue-500/10" iconClassName="text-blue-600 dark:text-blue-400" />}
          {quadrosConfig.kpiTotal && <EffortKpiCard title="Total pessoas" value={resumo.total} icon={Users} accent="#0891b2" iconBackgroundClassName="bg-cyan-50 dark:bg-cyan-500/10" iconClassName="text-cyan-600 dark:text-cyan-400" />}
          {quadrosConfig.kpiPedreiro && <EffortKpiCard title="Pedreiros" value={resumo.pedreiro} icon={HardHat} accent="#d97706" iconBackgroundClassName="bg-amber-50 dark:bg-amber-500/10" iconClassName="text-amber-600 dark:text-amber-400" />}
          {quadrosConfig.kpiServente && <EffortKpiCard title="Serventes" value={resumo.servente} icon={UserCog} accent="#16a34a" iconBackgroundClassName="bg-green-50 dark:bg-green-500/10" iconClassName="text-green-600 dark:text-green-400" />}
          {quadrosConfig.kpiCarpinteiro && <EffortKpiCard title="Carpinteiros" value={resumo.carpinteiro} icon={Wrench} accent="#7c3aed" iconBackgroundClassName="bg-violet-50 dark:bg-violet-500/10" iconClassName="text-violet-600 dark:text-violet-400" />}
          {quadrosConfig.kpiOutros && <EffortKpiCard title="Outros" value={resumo.qntdd_funcao} icon={Users} accent="#db2777" iconBackgroundClassName="bg-pink-50 dark:bg-pink-500/10" iconClassName="text-pink-600 dark:text-pink-400" />}
        </div>
      )}

      {(quadrosConfig.graficoBarras || (quadrosConfig.graficoPizza && !isMobile)) && (
      <div className="grid gap-6 lg:grid-cols-2">
        {quadrosConfig.graficoBarras && (
        <Card className="rounded-2xl sm:rounded-xl">
          <CardHeader><CardTitle className="text-base">Por {DIMENSAO_LABEL[quadrosConfig.graficoBarrasDimensao]}</CardTitle></CardHeader>
          <CardContent>
            {porDimensaoGraficoExibicao.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Nenhum registro no filtro selecionado.</div>
            ) : <div role="img" aria-label={`Distribuição por ${DIMENSAO_LABEL[quadrosConfig.graficoBarrasDimensao]}: ${porDimensaoGraficoExibicao.map((item) => `${item.name}, ${item.value} pessoas`).join("; ")}`}>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart
                data={porDimensaoGraficoExibicao}
                layout={isMobile ? "vertical" : "horizontal"}
                margin={isMobile ? { top: 0, right: 8, left: 0, bottom: 0 } : undefined}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                {isMobile ? (
                  <>
                    <XAxis type="number" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickCount={4} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={96} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fill: "var(--muted-foreground)" }} />
                  </>
                )}
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "var(--popover-foreground)" }} />
                <Bar dataKey="value" name="Pessoas" fill="#2563eb" radius={isMobile ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
                  {porDimensaoGraficoExibicao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
              </ResponsiveContainer>
            </div>}
          </CardContent>
        </Card>
        )}

        {!isMobile && quadrosConfig.graficoPizza && <Card>
          <CardHeader><CardTitle className="text-base">Por Função</CardTitle></CardHeader>
          <CardContent>
            {porFuncao.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Nenhuma função no filtro selecionado.</div>
            ) : <div role="img" aria-label={`Distribuição por função: ${porFuncao.map((item) => `${item.name}, ${item.value} pessoas`).join("; ")}`}>
              <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={porFuncao}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={{ fill: "var(--foreground)", fontSize: 12 }}
                  labelLine={{ stroke: "var(--muted-foreground)" }}
                >
                  {porFuncao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "var(--popover-foreground)" }} />
                <Legend formatter={(value) => <span className="text-foreground">{value}</span>} />
              </PieChart>
              </ResponsiveContainer>
            </div>}
          </CardContent>
        </Card>}
      </div>
      )}

      {(quadrosConfig.tabelaDetalhe || quadrosConfig.tabelaArea) && (
      <div className="grid gap-6 lg:grid-cols-2">
        {quadrosConfig.tabelaDetalhe && (
          <ResumoTable
            titulo={quadrosConfig.tabelaDetalheSepararBDR ? `${DIMENSAO_LABEL[quadrosConfig.tabelaDetalheDimensao]} — Próprios (BDR)` : `Por ${DIMENSAO_LABEL[quadrosConfig.tabelaDetalheDimensao]}`}
            coluna={DIMENSAO_LABEL[quadrosConfig.tabelaDetalheDimensao]}
            rows={tabelaDetalhePrincipal}
            isMobile={isMobile}
            tooltipFor={tooltipPorFuncao}
          />
        )}

        <div className="space-y-6">
          {quadrosConfig.tabelaArea && (
            <ResumoTable
              titulo={`Por ${DIMENSAO_LABEL[quadrosConfig.tabelaAreaDimensao]}`}
              coluna={DIMENSAO_LABEL[quadrosConfig.tabelaAreaDimensao]}
              rows={tabelaArea}
              isMobile={isMobile}
              tooltipFor={tooltipPorFuncao}
            />
          )}
          {quadrosConfig.tabelaDetalhe && quadrosConfig.tabelaDetalheSepararBDR && (
            <ResumoTable
              titulo={`${DIMENSAO_LABEL[quadrosConfig.tabelaDetalheDimensao]} — Terceirizados`}
              coluna={DIMENSAO_LABEL[quadrosConfig.tabelaDetalheDimensao]}
              rows={tabelaDetalheOutras}
              isMobile={isMobile}
              tooltipFor={tooltipPorFuncao}
            />
          )}
        </div>
      </div>
      )}
      </>}
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
  const { user, userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? null;
  const projetoId = currentProject?.id ?? null;
  const cacheScope = user && organizacaoId && projetoId ? `${organizacaoId}:${projetoId}:${user.id}` : "pending";
  const cacheReady = !!user && !!organizacaoId && !!projetoId;
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

  const sortedFilters = sortFilters([empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds]);
  const { data: apontamentosResult, isLoading, isError } = useQuery({
    queryKey: ["linha-do-tempo", organizacaoId, projetoId, cacheScope, dataInicio, dataFim, ...sortedFilters],
    queryFn: () => fetchWithOfflineCacheDetailed(
      buildDashboardCacheKey("apontamento-timeline", cacheScope, [dataInicio, dataFim, ...sortedFilters]),
      async () => {
        let q = supabase
          .from("apontamentos_diarios")
          .select("*")
          .eq("organizacao_id", organizacaoId!)
          .eq("projeto_id", projetoId!)
          .gte("data", dataInicio)
          .lte("data", dataFim)
          .order("data", { ascending: true })
          .retry(false);
        if (empresaIds.length > 0) q = q.in("empresa_id", empresaIds);
        if (liderancaIds.length > 0) q = q.in("lideranca_id", liderancaIds);
        if (setorIds.length > 0) q = q.in("setor_id", setorIds);
        if (areaIds.length > 0) q = q.in("area_id", areaIds);
        if (subareaIds.length > 0) q = q.in("subarea_id", subareaIds);
        if (atividadeIds.length > 0) q = q.in("atividade_id", atividadeIds);
        const { data: rows, error, status } = await q;
        return { data: error ? null : (rows ?? []) as Apontamento[], error, status };
      },
      { maxAgeMs: DASHBOARD_CACHE_MAX_AGE },
    ),
    enabled: cacheReady,
    networkMode: "always",
    retry: false,
    refetchOnReconnect: "always",
  });
  const apontamentos = apontamentosResult?.data ?? EMPTY_APONTAMENTOS;

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
  const activeFilterCount = [empresaIds, liderancaIds, setorIds, areaIds, subareaIds, atividadeIds]
    .filter((items) => items.length > 0).length;
  const filterSummary = [
    summarizeFilter("Empresa", empresaIds, empresas),
    summarizeFilter("Liderança", liderancaIds, liderancas),
    summarizeFilter("Setor", setorIds, setores),
    summarizeFilter("Área", areaIds, areas),
    summarizeFilter("Etapa", subareaIds, subareas),
    summarizeFilter("Atividade", atividadeIds, atividades),
  ].filter((item) => item !== null).join(" · ");
  const clearFilters = () => {
    setEmpresaIds([]);
    setLiderancaIds([]);
    setSetorIds([]);
    setAreaIds([]);
    setSubareaIds([]);
    setAtividadeIds([]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-muted-foreground">Evolução do efetivo de {formatBR(dataInicio)} a {formatBR(dataFim)}.</p>

      {apontamentosResult?.source === "cache" && <CachedDataNotice cachedAt={apontamentosResult.cachedAt} />}

      <FilterPanel isMobile={isMobile} activeCount={activeFilterCount} summary={filterSummary} onClear={clearFilters}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="timeline-data-inicio">Data início</Label>
              <Input id="timeline-data-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timeline-data-fim">Data fim</Label>
              <Input id="timeline-data-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <MultiCombobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={empresaIds} onChange={setEmpresaIds} placeholder="Todas" ariaLabel="Filtrar por empresa" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Encarregado</Label>
              <MultiCombobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaIds} onChange={setLiderancaIds} placeholder="Todos" ariaLabel="Filtrar por encarregado" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <MultiCombobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={setorIds} onChange={setSetorIds} placeholder="Todos" ariaLabel="Filtrar por setor" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <MultiCombobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={areaIds} onChange={setAreaIds} placeholder="Todas" ariaLabel="Filtrar por área" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <MultiCombobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={subareaIds} onChange={setSubareaIds} placeholder="Todas" ariaLabel="Filtrar por etapa" className={FILTER_CONTROL_CLASS} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <MultiCombobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={atividadeIds} onChange={setAtividadeIds} placeholder="Todas" ariaLabel="Filtrar por atividade" className={FILTER_CONTROL_CLASS} />
            </div>
          </div>
      </FilterPanel>

      {isLoading ? <EffortDashboardSkeleton kpiCount={4} /> : isError ? <DataUnavailableNotice /> : <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <EffortKpiCard title="Dias apontados" value={resumoPeriodo.diasComApontamento} icon={CalendarDays} accent="#2563eb" iconBackgroundClassName="bg-blue-50 dark:bg-blue-500/10" iconClassName="text-blue-600 dark:text-blue-400" />
        <EffortKpiCard title="Pessoas-dia" value={resumoPeriodo.totalPessoasDia} icon={Users} accent="#0891b2" iconBackgroundClassName="bg-cyan-50 dark:bg-cyan-500/10" iconClassName="text-cyan-600 dark:text-cyan-400" />
        <EffortKpiCard title="Média diária" value={resumoPeriodo.mediaDiaria} icon={LineChartIcon} accent="#16a34a" iconBackgroundClassName="bg-green-50 dark:bg-green-500/10" iconClassName="text-green-600 dark:text-green-400" />
        <EffortKpiCard title="Pico" value={resumoPeriodo.pico.total} detail={resumoPeriodo.pico.data ? formatBR(resumoPeriodo.pico.data) : "Sem dados"} icon={TrendingUp} accent="#d97706" iconBackgroundClassName="bg-amber-50 dark:bg-amber-500/10" iconClassName="text-amber-600 dark:text-amber-400" />
      </div>

      <Card className="rounded-2xl sm:rounded-xl">
        <CardHeader><CardTitle className="text-base">Efetivo por dia</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : porDia.length === 0 ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Nenhum apontamento no período/filtro selecionado.</div>
          ) : (
            <div role="img" aria-label={`Evolução do efetivo: ${porDia.map((item) => `${formatBR(item.data)}, ${item.total} pessoas`).join("; ")}`}>
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 360}>
              <LineChart data={porDia} margin={isMobile ? { top: 12, right: 8, left: -24, bottom: 0 } : { top: 24, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11, fill: "var(--muted-foreground)" }} interval={isMobile ? intervaloTicks : undefined} />
                <YAxis allowDecimals={false} tick={{ fontSize: isMobile ? 9 : 12, fill: "var(--muted-foreground)" }} tickCount={isMobile ? 4 : 5} />
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
            </div>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  );
}
