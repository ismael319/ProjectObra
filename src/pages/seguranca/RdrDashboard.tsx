import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, FileText, FileSpreadsheet, ListFilter, AlertTriangle,
  CheckCircle2, CalendarClock, ArrowRight, Target, Clock, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
  AreaChart, Area, Line,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { useRdrRecords, useRdrConfig, useSalvarRdrConfig } from "@/lib/rdr/rdr-db";
import { ehDesvio, formatarData, type RdrRecord } from "@/lib/rdr/mappers";
import { gerarPdfDashboard, exportarExcelRdr, type DashboardDados } from "@/lib/rdr/exports";
import { CATEGORIAS, MESES_PT, MESES_PT_SHORT } from "@/lib/rdr/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];

type FiltroStatus = "todos" | "desvios" | "reconhecimentos" | "concluidos" | "pendentes";

const FILTROS_STATUS: { id: FiltroStatus; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "desvios", label: "Desvios" },
  { id: "reconhecimentos", label: "Reconhecimentos" },
  { id: "concluidos", label: "Concluídos" },
  { id: "pendentes", label: "Pendentes" },
];

function chipClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-transparent text-muted-foreground border-input hover:bg-muted"
  }`;
}

function mesLabel(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  const idx = Number(mes) - 1;
  return `${MESES_PT[idx] ?? mes}/${ano}`;
}

function mesKeyAtual(): string {
  return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

function mesKeyAnterior(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString("en-CA").slice(0, 7);
}

function aplicarStatus(lista: RdrRecord[], filtro: FiltroStatus): RdrRecord[] {
  switch (filtro) {
    case "concluidos":
      return lista.filter((r) => r.concluido === "SIM");
    case "pendentes":
      return lista.filter((r) => r.concluido !== "SIM");
    case "desvios":
      return lista.filter((r) => ehDesvio(r.categorias ?? []));
    case "reconhecimentos":
      return lista.filter((r) => !ehDesvio(r.categorias ?? []));
    default:
      return lista;
  }
}

function DeltaChip({ atual, anterior, inverso = false }: { atual: number; anterior: number; inverso?: boolean }) {
  const diff = atual - anterior;
  if (diff === 0) return <span className="text-xs text-muted-foreground">0 vs mês anterior</span>;
  const positivo = inverso ? diff < 0 : diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positivo ? "text-green-600" : "text-red-600"}`}>
      {positivo ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {diff > 0 ? "+" : ""}{diff} vs mês anterior
    </span>
  );
}

export default function RdrDashboard() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const navigate = useNavigate();

  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [responsavelFiltro, setResponsavelFiltro] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const hojeKey = new Date().toLocaleDateString("en-CA");
  const anoAtual = String(new Date().getFullYear());

  const { data: registros = [], isLoading } = useRdrRecords(organizacaoId);
  const { data: config = [] } = useRdrConfig(organizacaoId);
  const salvarConfig = useSalvarRdrConfig(organizacaoId);

  const configMeta = config.find((c) => c.chave === "meta_mensal_desvios")?.valor ?? "";
  const metaMensal = Number(configMeta) || 0;
  const [metaInput, setMetaInput] = useState("");
  useEffect(() => {
    setMetaInput(configMeta);
  }, [configMeta]);

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const r of registros) set.add(r.data_ocorrido?.slice(0, 4));
    return [...set].filter(Boolean).sort().reverse();
  }, [registros]);

  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of registros) {
      const nome = (r.responsavel_registro ?? r.autor_nome ?? "").trim();
      if (nome) set.add(nome);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros]);

  const base = useMemo(() => {
    return registros.filter((r) => {
      if (responsavelFiltro && (r.responsavel_registro || r.autor_nome) !== responsavelFiltro) return false;
      if (categoriaFiltro && !(r.categorias ?? []).includes(categoriaFiltro)) return false;
      return true;
    });
  }, [registros, responsavelFiltro, categoriaFiltro]);

  const filtrados = useMemo(() => {
    return base.filter((r) => {
      if (anoFiltro && !r.data_ocorrido?.startsWith(anoFiltro)) return false;
      if (mesFiltro && r.data_ocorrido?.slice(5, 7) !== String(Number(mesFiltro)).padStart(2, "0")) return false;
      return true;
    });
  }, [base, anoFiltro, mesFiltro]);

  const dadosFiltrados = useMemo(() => aplicarStatus(filtrados, filtroStatus), [filtrados, filtroStatus]);

  const stats = useMemo(() => {
    const total = dadosFiltrados.length;
    const doMes = dadosFiltrados.filter((r) => r.data_ocorrido?.slice(0, 7) === mesKeyAtual()).length;
    const concluidos = dadosFiltrados.filter((r) => r.concluido === "SIM").length;
    const pendentes = dadosFiltrados.filter((r) => r.concluido !== "SIM").length;
    const reconhecimentos = dadosFiltrados.filter((r) => !ehDesvio(r.categorias ?? [])).length;
    const tx = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    return { total, doMes, concluidos, pendentes, reconhecimentos, desvios: total - reconhecimentos, tx };
  }, [dadosFiltrados]);

  const contagensMes = useMemo(() => {
    const lista = aplicarStatus(base, filtroStatus);
    const contar = (l: RdrRecord[]) => ({
      total: l.length,
      concluidos: l.filter((r) => r.concluido === "SIM").length,
      pendentes: l.filter((r) => r.concluido !== "SIM").length,
      desvios: l.filter((r) => ehDesvio(r.categorias ?? [])).length,
    });
    return {
      atual: contar(lista.filter((r) => r.data_ocorrido?.slice(0, 7) === mesKeyAtual())),
      anterior: contar(lista.filter((r) => r.data_ocorrido?.slice(0, 7) === mesKeyAnterior())),
    };
  }, [base, filtroStatus]);

  const kpiPrazo = useMemo(() => {
    const concluidos = dadosFiltrados.filter((r) => r.concluido === "SIM");
    const noPrazo = concluidos.filter((r) => {
      if (!r.prazo) return true;
      if (!r.concluido_em) return false;
      return r.concluido_em.slice(0, 10) <= r.prazo;
    }).length;
    const tx = concluidos.length > 0 ? Math.round((noPrazo / concluidos.length) * 100) : 0;
    let somaDias = 0;
    let nDias = 0;
    for (const r of concluidos) {
      if (!r.concluido_em || !r.data_ocorrido) continue;
      const dias = (new Date(r.concluido_em).getTime() - new Date(`${r.data_ocorrido}T12:00:00`).getTime()) / 86400000;
      if (Number.isNaN(dias)) continue;
      somaDias += dias;
      nDias += 1;
    }
    return { noPrazo, concluidos: concluidos.length, tx, prazoMedio: nDias > 0 ? Math.round((somaDias / nDias) * 10) / 10 : 0 };
  }, [dadosFiltrados]);

  const porMesTipo = useMemo(() => {
    const agora = new Date();
    const chaves: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      chaves.push(d.toLocaleDateString("en-CA").slice(0, 7));
    }
    const mapa = new Map<string, { desvios: number; reconhecimentos: number }>();
    for (const c of chaves) mapa.set(c, { desvios: 0, reconhecimentos: 0 });
    for (const r of filtrados) {
      const k = r.data_ocorrido?.slice(0, 7);
      if (!k || !mapa.has(k)) continue;
      const item = mapa.get(k)!;
      if (ehDesvio(r.categorias ?? [])) item.desvios += 1;
      else item.reconhecimentos += 1;
    }
    return chaves.map((c) => ({ mes: mesLabel(c), chave: c, meta: metaMensal, ...mapa.get(c)! }));
  }, [filtrados, metaMensal]);

  const acumulado = useMemo(() => {
    const anoAcumulado = anoFiltro ?? anoAtual;
    const lista = aplicarStatus(base, filtroStatus).filter((r) => r.data_ocorrido?.slice(0, 4) === anoAcumulado);
    const mesMax = anoAcumulado === anoAtual ? new Date().getMonth() : 11;
    let desvios = 0;
    let reconhecimentos = 0;
    const resultado: { mes: string; desvios: number; reconhecimentos: number }[] = [];
    for (let i = 0; i <= mesMax; i++) {
      const chave = `${anoAcumulado}-${String(i + 1).padStart(2, "0")}`;
      const mes = lista.filter((x) => x.data_ocorrido?.slice(0, 7) === chave);
      desvios += mes.filter((x) => ehDesvio(x.categorias ?? [])).length;
      reconhecimentos += mes.filter((x) => !ehDesvio(x.categorias ?? [])).length;
      resultado.push({ mes: MESES_PT_SHORT[i], desvios, reconhecimentos });
    }
    return resultado;
  }, [base, filtroStatus, anoFiltro, anoAtual]);

  const reincidencia = useMemo(() => {
    const agora = new Date();
    const janela = new Set<string>();
    for (let i = 5; i >= 0; i--) {
      janela.add(new Date(agora.getFullYear(), agora.getMonth() - i, 1).toLocaleDateString("en-CA").slice(0, 7));
    }
    const porCat = new Map<string, { total: number; meses: Set<string> }>();
    const porLoc = new Map<string, { total: number; meses: Set<string> }>();
    for (const r of aplicarStatus(base, filtroStatus)) {
      const k = r.data_ocorrido?.slice(0, 7);
      if (!k || !janela.has(k)) continue;
      if (ehDesvio(r.categorias ?? [])) {
        for (const c of r.categorias ?? []) {
          if (c === "Reconhecimento") continue;
          const item = porCat.get(c) ?? { total: 0, meses: new Set<string>() };
          item.total += 1;
          item.meses.add(k);
          porCat.set(c, item);
        }
      }
      const loc = r.local?.trim();
      if (loc) {
        const item = porLoc.get(loc) ?? { total: 0, meses: new Set<string>() };
        item.total += 1;
        item.meses.add(k);
        porLoc.set(loc, item);
      }
    }
    const ordenar = (m: Map<string, { total: number; meses: Set<string> }>) =>
      [...m.entries()]
        .map(([nome, v]) => ({ nome, total: v.total, meses: v.meses.size }))
        .sort((a, b) => b.meses - a.meses || b.total - a.total)
        .slice(0, 5);
    return { categorias: ordenar(porCat), locais: ordenar(porLoc) };
  }, [base, filtroStatus]);

  const porTecnico = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dadosFiltrados) {
      const nome = r.autor_nome || "—";
      map.set(nome, (map.get(nome) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [dadosFiltrados]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dadosFiltrados) {
      for (const c of r.categorias ?? []) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [dadosFiltrados]);

  const porLocal = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dadosFiltrados) {
      const loc = r.local?.trim();
      if (!loc) continue;
      map.set(loc, (map.get(loc) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [dadosFiltrados]);

  const pendPorResp = useMemo(() => {
    const map = new Map<string, { pendentes: number; vencidos: number }>();
    for (const r of dadosFiltrados) {
      if (r.concluido === "SIM") continue;
      const nome = (r.responsavel_registro ?? r.autor_nome ?? "—").trim() || "—";
      const item = map.get(nome) ?? { pendentes: 0, vencidos: 0 };
      item.pendentes += 1;
      if (r.prazo && r.prazo < hojeKey) item.vencidos += 1;
      map.set(nome, item);
    }
    return [...map.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.pendentes - a.pendentes).slice(0, 8);
  }, [dadosFiltrados, hojeKey]);

  const vencidos = useMemo(() => {
    const hoje = new Date().toLocaleDateString("en-CA");
    const lista = filtrados
      .filter((r) => r.concluido !== "SIM" && r.prazo && r.prazo < hoje)
      .map((r) => ({
        ...r,
        diasAtraso: Math.max(1, Math.ceil((Date.now() - new Date(`${r.prazo}T12:00:00`).getTime()) / 86400000)),
      }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
    return { total: lista.length, maisUrgente: lista[0] };
  }, [filtrados]);

  const ultimos = useMemo(() => filtrados.slice(0, 6), [filtrados]);

  const dadosExport: DashboardDados = useMemo(
    () => ({
      registros: dadosFiltrados,
      reconhecimentos: stats.reconhecimentos,
      desvios: stats.desvios,
      abertos: stats.pendentes,
      finalizados: stats.concluidos,
      txConclusaoNoPrazo: kpiPrazo.tx,
      prazoMedioDias: kpiPrazo.prazoMedio,
      metaMensal,
      porTecnico: Object.fromEntries(porTecnico.map((p) => [p.nome, p.total])),
      porCategoria: Object.fromEntries(porCategoria.map((p) => [p.nome, p.total])),
      porLocal: Object.fromEntries(porLocal.map((p) => [p.nome, p.total])),
      pendentesPorResponsavel: Object.fromEntries(pendPorResp.map((p) => [p.nome, p.pendentes])),
    }),
    [dadosFiltrados, stats, kpiPrazo, metaMensal, porTecnico, porCategoria, porLocal, pendPorResp],
  );

  const irParaRegistros = (state: Record<string, string | boolean>) =>
    navigate("/dashboard/seguranca/registros", { state });

  const handleMetaSave = async () => {
    if (metaInput === configMeta) return;
    try {
      await salvarConfig.mutateAsync({ chave: "meta_mensal_desvios", valor: metaInput.trim() });
      toast.success("Meta mensal atualizada");
    } catch (e) {
      toast.error("Falha ao salvar a meta");
      console.error(e);
    }
  };

  const handleExportPdf = async () => {
    setExportandoPdf(true);
    try {
      await gerarPdfDashboard(dadosExport);
    } catch (e) {
      toast.error("Falha ao gerar PDF");
      console.error(e);
    } finally {
      setExportandoPdf(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportarExcelRdr(dadosFiltrados, dadosExport);
    } catch (e) {
      toast.error("Falha ao gerar Excel");
      console.error(e);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard RDR</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral dos RDRs cadastrados — {stats.total} de {registros.length} registro(s).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-36 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Combobox
              options={anos.map((a) => ({ value: a, label: a }))}
              value={anoFiltro}
              onChange={setAnoFiltro}
              placeholder="Todos"
            />
          </div>
          <div className="w-full sm:w-32 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mês</Label>
            <Combobox
              options={MESES_PT.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={mesFiltro}
              onChange={setMesFiltro}
              placeholder="Todos"
            />
          </div>
          <div className="w-full sm:w-44 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <Combobox
              options={responsaveis.map((r) => ({ value: r, label: r }))}
              value={responsavelFiltro}
              onChange={setResponsavelFiltro}
              placeholder="Todos"
            />
          </div>
          <div className="w-full sm:w-40 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Combobox
              options={CATEGORIAS.map((c) => ({ value: c, label: c }))}
              value={categoriaFiltro}
              onChange={setCategoriaFiltro}
              placeholder="Todas"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exportandoPdf}>
            {exportandoPdf ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS_STATUS.map((f) => (
          <button key={f.id} className={chipClass(filtroStatus === f.id)} onClick={() => setFiltroStatus(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <Card className={vencidos.total > 0 ? "border-red-500/60 bg-red-500/5" : undefined}>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {vencidos.total > 0 ? (
              <AlertTriangle className="h-8 w-8 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
            )}
            <div>
              <div className={`text-base font-semibold ${vencidos.total > 0 ? "text-red-700" : "text-green-700"}`}>
                {vencidos.total > 0 ? `${vencidos.total} RDR(s) com prazo vencido` : "Nenhum prazo vencido"}
              </div>
              {vencidos.maisUrgente ? (
                <p className="text-sm text-red-600">
                  Mais urgente: {vencidos.maisUrgente.local || "—"} — vencido há {vencidos.maisUrgente.diasAtraso} dia(s)
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {registros.length > 0 ? "Todos os prazos estão em dia." : "Sem registros para avaliar prazos."}
                </p>
              )}
            </div>
          </div>
          {vencidos.total > 0 && (
            <Button variant="destructive" size="sm" onClick={() => irParaRegistros({ status: "vencidos" })}>
              Ver vencidos
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Taxa de conclusão</div>
            <div className="mt-1 text-3xl font-bold text-amber-500">{stats.tx}%</div>
          </CardContent>
        </Card>
        <button className="text-left" onClick={() => irParaRegistros({})}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">Total RDRs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="mt-1">
                <DeltaChip atual={contagensMes.atual.total} anterior={contagensMes.anterior.total} />
              </div>
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ mes: mesKeyAtual() })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
                Este mês <CalendarClock size={13} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.doMes}</div>
              <div className="mt-1">
                <DeltaChip atual={contagensMes.atual.total} anterior={contagensMes.anterior.total} />
              </div>
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ status: "finalizado" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">Concluídos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.concluidos}</div>
              <div className="mt-1">
                <DeltaChip atual={contagensMes.atual.concluidos} anterior={contagensMes.anterior.concluidos} />
              </div>
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ status: "aberto" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
                Pendentes <ListFilter size={13} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.pendentes}</div>
              <div className="mt-1">
                <DeltaChip inverso atual={contagensMes.atual.pendentes} anterior={contagensMes.anterior.pendentes} />
              </div>
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ categoria: "Reconhecimento" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">Reconhecimentos</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-emerald-600">{stats.reconhecimentos}</CardContent>
          </Card>
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
              Conclusão no prazo <CheckCircle2 size={13} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{kpiPrazo.tx}%</div>
            <p className="text-xs text-muted-foreground">{kpiPrazo.noPrazo} de {kpiPrazo.concluidos} concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
              Prazo médio de atendimento <Clock size={13} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{kpiPrazo.prazoMedio} dia(s)</div>
            <p className="text-xs text-muted-foreground">da ocorrência à conclusão</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
              Meta mensal <Target size={13} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {metaMensal > 0 ? `${contagensMes.atual.desvios}/${metaMensal}` : "—"}
            </div>
            {metaMensal > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-orange-500"
                  style={{ width: `${Math.min(100, Math.round((contagensMes.atual.desvios / metaMensal) * 100))}%` }}
                />
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">desvios este mês</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desvios por Categoria</CardTitle>
            <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porCategoria} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="total"
                  name="Registros"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { nome?: string } }) =>
                    d.payload?.nome && irParaRegistros({ categoria: d.payload.nome })
                  }
                >
                  {porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {porCategoria.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">RDR por Responsável (TST)</CardTitle>
            <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porTecnico} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="total"
                  name="Registros"
                  fill="#2563eb"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { nome?: string } }) =>
                    d.payload?.nome && irParaRegistros({ busca: d.payload.nome })
                  }
                />
              </BarChart>
            </ResponsiveContainer>
            {porTecnico.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top locais</CardTitle>
            <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porLocal} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="total"
                  name="Registros"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { nome?: string } }) =>
                    d.payload?.nome && irParaRegistros({ busca: d.payload.nome })
                  }
                >
                  {porLocal.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {porLocal.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pendências por responsável</CardTitle>
            <p className="text-xs text-muted-foreground">toque numa barra para abrir os registros abertos</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pendPorResp} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="pendentes"
                  name="Pendentes"
                  stackId="p"
                  fill="#f59e0b"
                  radius={[0, 0, 4, 4]}
                  cursor="pointer"
                  onClick={(d: { payload?: { nome?: string } }) =>
                    d.payload?.nome && irParaRegistros({ busca: d.payload.nome, status: "aberto" })
                  }
                />
                <Bar
                  dataKey="vencidos"
                  name="Vencidos"
                  stackId="p"
                  fill="#ef4444"
                  radius={[0, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { nome?: string } }) =>
                    d.payload?.nome && irParaRegistros({ busca: d.payload.nome, status: "vencidos" })
                  }
                />
              </BarChart>
            </ResponsiveContainer>
            {pendPorResp.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Sem pendências</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
          <div>
            <CardTitle className="text-base">Desvios vs Reconhecimentos (últimos 6 meses)</CardTitle>
            <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Meta/mês</Label>
            <Input
              type="number"
              min={0}
              value={metaInput}
              onChange={(e) => setMetaInput(e.target.value)}
              onBlur={() => void handleMetaSave()}
              placeholder="0"
              className="w-20"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porMesTipo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="desvios"
                name="Desvios"
                stackId="a"
                fill="#ef4444"
                cursor="pointer"
                onClick={(d: { payload?: { chave?: string } }) =>
                  d.payload?.chave && irParaRegistros({ mes: d.payload.chave })
                }
              />
              <Bar
                dataKey="reconhecimentos"
                name="Reconhecimentos"
                stackId="a"
                fill="#16a34a"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(d: { payload?: { chave?: string } }) =>
                  d.payload?.chave && irParaRegistros({ mes: d.payload.chave })
                }
              />
              {metaMensal > 0 && (
                <Line
                  type="monotone"
                  dataKey="meta"
                  name={`Meta (${metaMensal})`}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
          {porMesTipo.every((m) => m.desvios === 0 && m.reconhecimentos === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução acumulada ({anoFiltro ?? anoAtual})</CardTitle>
          <p className="text-xs text-muted-foreground">acumulado no ano de desvios e reconhecimentos</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={acumulado}>
              <defs>
                <linearGradient id="gDesvios" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gRecon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="desvios" name="Desvios acum." stackId="1" stroke="#ef4444" fill="url(#gDesvios)" />
              <Area type="monotone" dataKey="reconhecimentos" name="Reconhecimentos acum." stackId="1" stroke="#16a34a" fill="url(#gRecon)" />
            </AreaChart>
          </ResponsiveContainer>
          {acumulado.every((m) => m.desvios === 0 && m.reconhecimentos === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reincidência (últimos 6 meses)</CardTitle>
          <p className="text-xs text-muted-foreground">itens que se repetem em meses distintos são destacados</p>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-muted-foreground">Por categoria</div>
            {reincidencia.categorias.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem desvios no período.</p>
            )}
            <ul className="space-y-2">
              {reincidencia.categorias.map((c) => (
                <li key={c.nome} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.nome}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{c.total} reg · {c.meses} {c.meses === 1 ? "mês" : "meses"}</span>
                    {c.meses >= 2 && <Badge variant="destructive">recorrente</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-muted-foreground">Por local</div>
            {reincidencia.locais.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem desvios no período.</p>
            )}
            <ul className="space-y-2">
              {reincidencia.locais.map((l) => (
                <li key={l.nome} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{l.nome}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{l.total} reg · {l.meses} {l.meses === 1 ? "mês" : "meses"}</span>
                    {l.meses >= 2 && <Badge variant="destructive">recorrente</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Últimos registros</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => irParaRegistros({})}>
            Ver todos
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead>Categorias</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ultimos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {ultimos.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatarData(r.data_ocorrido)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.local || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.autor_nome || "—"}</TableCell>
                    <TableCell>
                      <div className="flex max-w-52 flex-wrap gap-1">
                        {(r.categorias ?? []).map((c) => (
                          <Badge key={c} variant={c === "Reconhecimento" ? "default" : "secondary"} className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.prazo ? (
                        <span className={r.concluido !== "SIM" && r.prazo < hojeKey ? "text-red-600 font-medium" : undefined}>
                          {formatarData(r.prazo)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.concluido === "SIM" ? "default" : "destructive"}>
                        {r.concluido === "SIM" ? "Concluído" : "Pendente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
