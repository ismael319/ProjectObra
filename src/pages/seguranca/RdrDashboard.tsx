import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, FileSpreadsheet, ListFilter } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { useRdrRecords } from "@/lib/rdr/rdr-db";
import { ehDesvio } from "@/lib/rdr/mappers";
import { gerarPdfDashboard, exportarExcelRdr, type DashboardDados } from "@/lib/rdr/exports";
import { MESES_PT } from "@/lib/rdr/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];

function mesLabel(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  const idx = Number(mes) - 1;
  return `${MESES_PT[idx] ?? mes}/${ano}`;
}

export default function RdrDashboard() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const navigate = useNavigate();

  const [anoFiltro, setAnoFiltro] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [exportandoPdf, setExportandoPdf] = useState(false);

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

  const stats = useMemo(() => {
    const reconhecimentos = filtrados.filter((r) => (r.categorias ?? []).includes("Reconhecimento")).length;
    const desvios = filtrados.filter((r) => ehDesvio(r.categorias ?? [])).length;
    const abertos = filtrados.filter((r) => r.concluido !== "SIM").length;
    const finalizados = filtrados.filter((r) => r.concluido === "SIM").length;
    return { total: filtrados.length, reconhecimentos, desvios, abertos, finalizados };
  }, [filtrados]);

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of registros) {
      if (anoFiltro && !r.data_ocorrido?.startsWith(anoFiltro)) continue;
      const key = r.data_ocorrido?.slice(0, 7);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, total]) => ({ mes: mesLabel(key), total }));
  }, [registros, anoFiltro]);

  const porTecnico = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtrados) {
      const nome = r.autor_nome || "—";
      map.set(nome, (map.get(nome) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtrados) {
      for (const c of r.categorias ?? []) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const dadosExport: DashboardDados = useMemo(
    () => ({ registros: filtrados, ...stats, porTecnico: Object.fromEntries(porTecnico.map((p) => [p.nome, p.total])), porCategoria: Object.fromEntries(porCategoria.map((p) => [p.nome, p.total])) }),
    [filtrados, stats, porTecnico, porCategoria],
  );

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
      exportarExcelRdr(filtrados);
    } catch (e) {
      toast.error("Falha ao gerar Excel");
      console.error(e);
    }
  };

  const handleVerPendentes = () =>
    navigate("/dashboard/seguranca/registros", { state: { status: "aberto" } });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard RDR</h1>
          <p className="text-sm text-muted-foreground">Desvios e reconhecimentos do mês</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Registros</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Reconhecimentos</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-green-600">{stats.reconhecimentos}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Desvios</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-amber-600">{stats.desvios}</CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={handleVerPendentes}>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
              Abertos <ListFilter size={13} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-red-600">{stats.abertos}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Registros por mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Registros" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Pie data={porCategoria} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={(entry: any) => entry.nome}>
                  {porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Por técnico</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(260, porTecnico.length * 40)}>
            <BarChart data={porTecnico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" name="Registros" radius={[4, 4, 0, 0]}>
                {porTecnico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
