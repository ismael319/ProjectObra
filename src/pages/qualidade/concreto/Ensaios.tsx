import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { X } from "lucide-react";
import {
  useRastreabilidadeCargas,
  buscarCargaIdsPorPeca,
  statusGeralCarga,
  cargaEstaEmDia,
  type RastreabilidadeCarga,
} from "./lib/ensaios-catalog";
import { FichaRastreabilidade } from "./components/FichaRastreabilidade";
import { formatBR } from "@/lib/utils";


const STATUS_OPTIONS = [
  { value: "nao_conforme", label: "Não conforme" },
  { value: "atrasado", label: "Ensaio atrasado" },
  { value: "pendente", label: "Pendente" },
  { value: "conforme", label: "Conforme" },
  { value: "sem_cps", label: "Sem corpos de prova" },
  { value: "dispensado", label: "Dispensado de ensaio" },
];

function StatusBadge({ status }: { status: ReturnType<typeof statusGeralCarga> }) {
  switch (status) {
    case "nao_conforme":
      return <Badge variant="destructive">Não conforme</Badge>;
    case "atrasado":
      return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Ensaio atrasado</Badge>;
    case "conforme":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Conforme</Badge>;
    case "sem_cps":
      return <Badge variant="outline">Sem CPs</Badge>;
    case "dispensado":
      return <Badge variant="outline">Dispensado</Badge>;
    default:
      return <Badge variant="secondary">Pendente</Badge>;
  }
}

export default function ConcretoEnsaios() {
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;

  const { data: cargas = [], isLoading } = useRastreabilidadeCargas(organizacaoId, projetoId);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string | null>(null);
  const [cargaIdsPeca, setCargaIdsPeca] = useState<Set<string> | null>(null);
  const [cargaSelecionada, setCargaSelecionada] = useState<RastreabilidadeCarga | null>(null);
  const [diaFiltro, setDiaFiltro] = useState<string | null>(null);

  // Verde = toda carga do dia já tem corpo de prova vinculado (ou foi
  // dispensada de ensaio); vermelho = falta relacionar pelo menos uma —
  // mesmo padrão de calendário de "Aguardando validação" da Validação
  // (Distribuição Efetivo), ver src/pages/apontamento/Validacao.tsx.
  const statusPorDia = useMemo(() => {
    const map = new Map<string, "ok" | "pendente">();
    for (const c of cargas) {
      if (map.get(c.data) === "pendente") continue;
      map.set(c.data, cargaEstaEmDia(c) ? "ok" : "pendente");
    }
    return map;
  }, [cargas]);

  // Peça concretada é texto livre por corpo de prova (não agregado na view
  // de cargas) — busca separada, mesclada por OR com os campos que já vêm
  // prontos na linha da carga (código, nota fiscal, número, traço, fornecedor).
  useEffect(() => {
    const texto = busca.trim();
    if (!texto || !organizacaoId || !projetoId) {
      setCargaIdsPeca(null);
      return;
    }
    let cancelado = false;
    buscarCargaIdsPorPeca(organizacaoId, projetoId, texto).then((ids) => {
      if (!cancelado) setCargaIdsPeca(ids);
    });
    return () => {
      cancelado = true;
    };
  }, [busca, organizacaoId, projetoId]);

  const filtradas = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return cargas.filter((c) => {
      if (diaFiltro && c.data !== diaFiltro) return false;
      if (statusFiltro && statusGeralCarga(c) !== statusFiltro) return false;
      if (!texto) return true;
      const bateCampoDireto =
        c.codigo_rastreabilidade.toLowerCase().includes(texto) ||
        (c.nota_fiscal ?? "").toLowerCase().includes(texto) ||
        (c.numero_carga ?? "").toLowerCase().includes(texto) ||
        c.traco_nome.toLowerCase().includes(texto) ||
        c.fornecedor_nome.toLowerCase().includes(texto);
      return bateCampoDireto || (cargaIdsPeca?.has(c.carga_id) ?? false);
    });
  }, [cargas, busca, statusFiltro, cargaIdsPeca, diaFiltro]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">Ensaios / Rastreabilidade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Buscar</Label>
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Código de rastreabilidade, nota fiscal ou peça concretada"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Combobox options={STATUS_OPTIONS} value={statusFiltro} onChange={setStatusFiltro} placeholder="Todos" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filtradas.length} carga(s)</span>
              {diaFiltro && (
                <button
                  type="button"
                  onClick={() => setDiaFiltro(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:text-foreground"
                >
                  {formatBR(diaFiltro)} <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendário de rastreabilidade</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-2">
            <Calendar
              mode="single"
              selected={diaFiltro ? new Date(diaFiltro + "T12:00:00") : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = d.toISOString().slice(0, 10);
                setDiaFiltro((atual) => (atual === iso ? null : iso));
              }}
              // scale sem origin explícito usa o centro por padrão — com
              // origin-top-left (como estava) o encolhimento empurrava tudo
              // pro canto superior esquerdo, deixando o quadro visivelmente
              // fora de centro dentro do card.
              className="rounded-md border scale-[0.9]"
              components={{
                DayButton: (props) => {
                  const dateStr = props.day.date.toISOString().slice(0, 10);
                  const status = statusPorDia.get(dateStr);
                  return (
                    <div className="relative">
                      <CalendarDayButton {...props} />
                      {status && (
                        <span
                          className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full ${
                            status === "ok" ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                      )}
                    </div>
                  );
                },
              }}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Toda carga relacionada</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Falta relacionar</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cod. Lab.</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Traço</TableHead>
                  <TableHead className="text-right">Vol. (m³)</TableHead>
                  <TableHead className="text-right">CPs</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma carga encontrada</TableCell></TableRow>
                )}
                {filtradas.map((c) => (
                  <TableRow key={c.carga_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setCargaSelecionada(c)}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{c.codigo_rastreabilidade}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{c.cod_laboratorio ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatBR(c.data)}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.fornecedor_nome}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{[c.setor_nome, c.area_nome, c.etapa_nome].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.traco_nome}</TableCell>
                    <TableCell className="text-right">{c.quantidade_m3.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{c.cps_pendentes}/{c.total_cps}</TableCell>
                    <TableCell><StatusBadge status={statusGeralCarga(c)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <FichaRastreabilidade carga={cargaSelecionada} onClose={() => setCargaSelecionada(null)} />
    </div>
  );
}
