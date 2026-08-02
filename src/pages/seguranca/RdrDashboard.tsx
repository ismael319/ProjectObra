import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, FileText, FileSpreadsheet, ListFilter, AlertTriangle,
  CheckCircle2, CalendarClock, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { useRdrRecords } from "@/lib/rdr/rdr-db";
import { ehDesvio, formatarData } from "@/lib/rdr/mappers";
import { gerarPdfDashboard, exportarExcelRdr, type DashboardDados } from "@/lib/rdr/exports";
import { MESES_PT } from "@/lib/rdr/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function RdrDashboard() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const navigate = useNavigate();

  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const hojeKey = new Date().toLocaleDateString("en-CA");

  const { data: registros = [], isLoading } = useRdrRecords(organizacaoId);

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const r of registros) set.add(r.data_ocorrido?.slice(0, 4));
    return [...set].filter(Boolean).sort().reverse();
  }, [registros]);

  const filtrados = useMemo(() => {
    return registros.filter((r) => {
      if (anoFiltro && !r.data_ocorrido?.startsWith(anoFiltro)) return false;
      if (mesFiltro && r.data_ocorrido?.slice(5, 7) !== String(Number(mesFiltro)).padStart(2, "0")) return false;
      return true;
    });
  }, [registros, anoFiltro, mesFiltro]);

  const dadosFiltrados = useMemo(() => {
    switch (filtroStatus) {
      case "concluidos":
        return filtrados.filter((r) => r.concluido === "SIM");
      case "pendentes":
        return filtrados.filter((r) => r.concluido !== "SIM");
      case "desvios":
        return filtrados.filter((r) => ehDesvio(r.categorias ?? []));
      case "reconhecimentos":
        return filtrados.filter((r) => !ehDesvio(r.categorias ?? []));
      default:
        return filtrados;
    }
  }, [filtrados, filtroStatus]);

  const stats = useMemo(() => {
    const total = dadosFiltrados.length;
    const doMes = dadosFiltrados.filter((r) => r.data_ocorrido?.slice(0, 7) === mesKeyAtual()).length;
    const concluidos = dadosFiltrados.filter((r) => r.concluido === "SIM").length;
    const pendentes = dadosFiltrados.filter((r) => r.concluido !== "SIM").length;
    const reconhecimentos = dadosFiltrados.filter((r) => !ehDesvio(r.categorias ?? [])).length;
    const tx = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    return { total, doMes, concluidos, pendentes, reconhecimentos, desvios: total - reconhecimentos, tx };
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
    return chaves.map((c) => ({ mes: mesLabel(c), chave: c, ...mapa.get(c)! }));
  }, [filtrados]);

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
      porTecnico: Object.fromEntries(porTecnico.map((p) => [p.nome, p.total])),
      porCategoria: Object.fromEntries(porCategoria.map((p) => [p.nome, p.total])),
    }),
    [dadosFiltrados, stats, porTecnico, porCategoria],
  );

  const irParaRegistros = (state: Record<string, string | boolean>) =>
    navigate("/dashboard/seguranca/registros", { state });

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

  const handleExportExcel = () => {
    try {
      exportarExcelRdr(dadosFiltrados);
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
          <div className="w-40 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Combobox
              options={anos.map((a) => ({ value: a, label: a }))}
              value={anoFiltro}
              onChange={setAnoFiltro}
              placeholder="Todos"
            />
          </div>
          <div className="w-40 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mês</Label>
            <Combobox
              options={MESES_PT.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={mesFiltro}
              onChange={setMesFiltro}
              placeholder="Todos"
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
            <CardContent className="text-3xl font-bold">{stats.total}</CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ mes: mesKeyAtual() })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
                Este mês <CalendarClock size={13} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-blue-600">{stats.doMes}</CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ status: "finalizado" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">Concluídos</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-green-600">{stats.concluidos}</CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ status: "aberto" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:border-primary/50 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
                Pendentes <ListFilter size={13} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-red-600">{stats.pendentes}</CardContent>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desvios vs Reconhecimentos (últimos 6 meses)</CardTitle>
          <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
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
            </BarChart>
          </ResponsiveContainer>
          {porMesTipo.every((m) => m.desvios === 0 && m.reconhecimentos === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
          )}
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
