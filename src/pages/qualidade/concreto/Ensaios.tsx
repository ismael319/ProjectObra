import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useRastreabilidadeCargas,
  buscarCargaIdsPorPeca,
  statusGeralCarga,
  type RastreabilidadeCarga,
} from "./lib/ensaios-catalog";
import { FichaRastreabilidade } from "./components/FichaRastreabilidade";

function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS = [
  { value: "nao_conforme", label: "Não conforme" },
  { value: "atrasado", label: "Ensaio atrasado" },
  { value: "pendente", label: "Pendente" },
  { value: "conforme", label: "Conforme" },
  { value: "sem_cps", label: "Sem corpos de prova" },
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
    default:
      return <Badge variant="secondary">Pendente</Badge>;
  }
}

export default function ConcretoEnsaios() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const { data: cargas = [], isLoading } = useRastreabilidadeCargas(organizacaoId);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string | null>(null);
  const [cargaIdsPeca, setCargaIdsPeca] = useState<Set<string> | null>(null);
  const [cargaSelecionada, setCargaSelecionada] = useState<RastreabilidadeCarga | null>(null);

  // Peça concretada é texto livre por corpo de prova (não agregado na view
  // de cargas) — busca separada, mesclada por OR com os campos que já vêm
  // prontos na linha da carga (código, nota fiscal, número, traço, fornecedor).
  useEffect(() => {
    const texto = busca.trim();
    if (!texto || !organizacaoId) {
      setCargaIdsPeca(null);
      return;
    }
    let cancelado = false;
    buscarCargaIdsPorPeca(organizacaoId, texto).then((ids) => {
      if (!cancelado) setCargaIdsPeca(ids);
    });
    return () => {
      cancelado = true;
    };
  }, [busca, organizacaoId]);

  const filtradas = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return cargas.filter((c) => {
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
  }, [cargas, busca, statusFiltro, cargaIdsPeca]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-xl">Ensaios / Rastreabilidade</CardTitle>
            <Button variant="outline" asChild>
              <Link to="/dashboard/qualidade/concreto/ensaios/importar">
                <Upload className="h-4 w-4" /> Importar resultados
              </Link>
            </Button>
          </div>
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
          <div className="mt-3 text-sm text-muted-foreground">{filtradas.length} carga(s)</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Traço</TableHead>
                  <TableHead className="text-right">Vol. (m³)</TableHead>
                  <TableHead className="text-right">CPs</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma carga encontrada</TableCell></TableRow>
                )}
                {filtradas.map((c) => (
                  <TableRow key={c.carga_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setCargaSelecionada(c)}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{c.codigo_rastreabilidade}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatBR(c.data)}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.fornecedor_nome}</TableCell>
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
