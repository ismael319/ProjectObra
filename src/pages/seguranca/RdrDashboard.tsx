import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeRdrRecords, type RdrRecord } from "@/lib/firebase-rdr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { FileWarning, CalendarClock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const COLORS = ["#f5c518", "#27ae60", "#3498db", "#e74c3c", "#9b59b6", "#1abc9c", "#e67e22", "#2ecc71"];

function mesKeyAtual(): string {
  return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

export default function RdrDashboard() {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<RdrRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const irParaRegistros = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/dashboard/security/rdr/registros${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const unsub = subscribeRdrRecords((dados) => {
      setRegistros(dados);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const mesAtual = mesKeyAtual();
    const total = registros.length;
    const doMes = registros.filter((r) => r.dataOcorrido?.slice(0, 7) === mesAtual).length;
    const concluidos = registros.filter((r) => r.concluido === "SIM").length;
    const pendentes = registros.filter((r) => r.concluido === "NÃO").length;
    const tx = total > 0 ? Math.round((concluidos / total) * 100) : 0;

    const categorias = new Map<string, number>();
    for (const r of registros) for (const c of r.categorias ?? []) categorias.set(c, (categorias.get(c) ?? 0) + 1);
    const porCategoria = [...categorias.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const tecnicos = new Map<string, { value: number; autorId?: string }>();
    for (const r of registros) {
      if (!r.autorNome) continue;
      const atual = tecnicos.get(r.autorNome) ?? { value: 0, autorId: r.autorId };
      tecnicos.set(r.autorNome, { value: atual.value + 1, autorId: atual.autorId ?? r.autorId });
    }
    const porTecnico = [...tecnicos.entries()]
      .map(([name, { value, autorId }]) => ({ name, value, autorId }))
      .sort((a, b) => b.value - a.value);

    const meses = new Map<string, number>();
    for (const r of registros) {
      if (!r.dataOcorrido) continue;
      const k = r.dataOcorrido.slice(0, 7);
      meses.set(k, (meses.get(k) ?? 0) + 1);
    }
    const porMes = [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([mes, value]) => {
        const [y, m] = mes.split("-");
        return { name: `${m}/${y.slice(2)}`, mes, value };
      });

    return { total, doMes, concluidos, pendentes, tx, porCategoria, porTecnico, porMes };
  }, [registros]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">RDR — Dashboard de Segurança</h1>
        <p className="text-sm text-muted-foreground">
          Desvios de segurança registrados na ferramenta RDR/BDR. {stats.total} registro(s) no total.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Taxa de conclusão</div>
            <div className="mt-1 text-3xl font-bold text-amber-500">{stats.tx}%</div>
          </CardContent>
        </Card>
        <button className="text-left" onClick={() => irParaRegistros({})}>
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-card-hover hover:-translate-y-0.5">
            <CardContent className="pt-6 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Total RDRs</div>
                <div className="mt-1 text-3xl font-bold">{stats.total}</div>
              </div>
              <FileWarning className="h-5 w-5 text-amber-500" />
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ data: "mes" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-card-hover hover:-translate-y-0.5">
            <CardContent className="pt-6 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Este mês</div>
                <div className="mt-1 text-3xl font-bold">{stats.doMes}</div>
              </div>
              <CalendarClock className="h-5 w-5 text-blue-500" />
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ concluido: "SIM" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-card-hover hover:-translate-y-0.5">
            <CardContent className="pt-6 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Concluídos</div>
                <div className="mt-1 text-3xl font-bold">{stats.concluidos}</div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </CardContent>
          </Card>
        </button>
        <button className="text-left" onClick={() => irParaRegistros({ concluido: "NAO" })}>
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-card-hover hover:-translate-y-0.5">
            <CardContent className="pt-6 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Pendentes</div>
                <div className="mt-1 text-3xl font-bold">{stats.pendentes}</div>
              </div>
              <AlertCircle className="h-5 w-5 text-red-500" />
            </CardContent>
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
              <BarChart data={stats.porCategoria} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="value"
                  name="Registros"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { name: string } }) => d.payload && irParaRegistros({ categoria: d.payload.name })}
                >
                  {stats.porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {stats.porCategoria.length === 0 && (
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
              <BarChart data={stats.porTecnico} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="value"
                  name="Registros"
                  fill="#3498db"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { payload?: { autorId?: string } }) => d.payload?.autorId && irParaRegistros({ tecnico: d.payload.autorId })}
                />
              </BarChart>
            </ResponsiveContainer>
            {stats.porTecnico.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução Mensal (últimos 6 meses)</CardTitle>
          <p className="text-xs text-muted-foreground">toque numa barra para filtrar</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.porMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="value"
                name="Registros"
                fill="#f5a623"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(d: { payload?: { mes: string } }) => d.payload && irParaRegistros({ data: "mesExato", mes: d.payload.mes })}
              />
            </BarChart>
          </ResponsiveContainer>
          {stats.porMes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Sem dados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
