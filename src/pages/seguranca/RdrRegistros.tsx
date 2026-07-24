import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subscribeRdrRecords, RDR_CATEGORIAS, type RdrRecord } from "@/lib/firebase-rdr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2 } from "lucide-react";

type FiltroData = "todas" | "hoje" | "ontem" | "semana" | "mes" | "mesExato";

const PERIODOS: { id: FiltroData; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "semana", label: "7 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mesExato", label: "Mês específico" },
];

function chipClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-transparent text-muted-foreground border-input hover:bg-muted"
  }`;
}

export default function RdrRegistros() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [registros, setRegistros] = useState<RdrRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroData, setFiltroData] = useState<FiltroData>(() => {
    const d = searchParams.get("data");
    return (PERIODOS.some((p) => p.id === d) ? d : "todas") as FiltroData;
  });
  const [filtroMes, setFiltroMes] = useState(() => searchParams.get("mes") ?? "");
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(() => searchParams.get("categoria"));
  const [filtroTecnico, setFiltroTecnico] = useState<string | null>(() => searchParams.get("tecnico"));
  const [filtroConcluido, setFiltroConcluido] = useState<"todos" | "SIM" | "NÃO">(() => {
    const c = searchParams.get("concluido");
    return c === "NAO" ? "NÃO" : c === "SIM" ? "SIM" : "todos";
  });

  useEffect(() => {
    const unsub = subscribeRdrRecords((dados) => {
      setRegistros(dados);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const hojeKey = new Date().toLocaleDateString("en-CA");
  const ontemKey = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const semanaKey = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");
  const mesKey = hojeKey.slice(0, 7);

  const tecnicos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of registros) if (r.autorId && r.autorNome) map.set(r.autorId, r.autorNome);
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [registros]);

  const filtrados = useMemo(() => registros.filter((r) => {
    if (filtroTecnico && r.autorId !== filtroTecnico) return false;
    if (filtroCategoria && !(r.categorias ?? []).includes(filtroCategoria)) return false;
    if (filtroData === "hoje" && r.dataOcorrido !== hojeKey) return false;
    if (filtroData === "ontem" && r.dataOcorrido !== ontemKey) return false;
    if (filtroData === "semana" && (!r.dataOcorrido || r.dataOcorrido < semanaKey)) return false;
    if (filtroData === "mes" && r.dataOcorrido?.slice(0, 7) !== mesKey) return false;
    if (filtroData === "mesExato" && filtroMes && r.dataOcorrido?.slice(0, 7) !== filtroMes) return false;
    if (filtroConcluido !== "todos" && r.concluido !== filtroConcluido) return false;
    return true;
  }), [registros, filtroTecnico, filtroCategoria, filtroData, filtroMes, filtroConcluido, hojeKey, ontemKey, semanaKey, mesKey]);

  const limparFiltros = () => {
    setFiltroData("todas");
    setFiltroMes("");
    setFiltroCategoria(null);
    setFiltroTecnico(null);
    setFiltroConcluido("todos");
  };

  const filtrosAtivos = [filtroData !== "todas", !!filtroCategoria, !!filtroTecnico, filtroConcluido !== "todos"].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/security/rdr")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Registros RDR</h1>
          <p className="text-sm text-muted-foreground">{filtrados.length} de {registros.length} registro(s)</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <div className="flex flex-wrap gap-2">
              {PERIODOS.map((p) => (
                <button key={p.id} className={chipClass(filtroData === p.id)} onClick={() => setFiltroData(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {filtroData === "mesExato" && (
              <input
                type="month"
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="mt-2 w-full max-w-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Combobox
                options={RDR_CATEGORIAS.map((c) => ({ value: c, label: c }))}
                value={filtroCategoria}
                onChange={setFiltroCategoria}
                placeholder="Todas"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">TST / Responsável</Label>
              <Combobox
                options={tecnicos}
                value={filtroTecnico}
                onChange={setFiltroTecnico}
                placeholder="Todos"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-2">
              <button className={chipClass(filtroConcluido === "todos")} onClick={() => setFiltroConcluido("todos")}>Todos</button>
              <button className={chipClass(filtroConcluido === "SIM")} onClick={() => setFiltroConcluido("SIM")}>Concluído</button>
              <button className={chipClass(filtroConcluido === "NÃO")} onClick={() => setFiltroConcluido("NÃO")}>Pendente</button>
            </div>
          </div>

          {filtrosAtivos > 0 && (
            <Button variant="outline" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>TST</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Categorias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
                )}
                {!loading && filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
                )}
                {filtrados.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {r.dataOcorrido?.split("-").reverse().join("/") ?? "—"}
                      {r.hora && <div className="text-xs text-muted-foreground">{r.hora}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.autorNome ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.local ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.categorias ?? []).map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.concluido === "SIM" ? (
                        <Badge className="bg-green-600 hover:bg-green-600">Concluído</Badge>
                      ) : r.concluido === "NÃO" ? (
                        <Badge variant="destructive">Pendente</Badge>
                      ) : (
                        <Badge variant="outline">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.nomeColaborador ?? "—"}</TableCell>
                    <TableCell className="min-w-[240px] max-w-[420px] whitespace-normal text-sm text-muted-foreground">{r.descricao ?? "—"}</TableCell>
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
