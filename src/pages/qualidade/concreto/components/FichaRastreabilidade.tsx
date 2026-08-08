import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { usePapelModulo } from "@/lib/auth-context";
import { useEnsaiosDaCarga, type EnsaioCorpoProva, type RastreabilidadeCarga } from "../lib/ensaios-catalog";
import { LancarResultadoModal } from "./LancarResultadoModal";

function formatBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ConformidadeBadge({ status, atrasado }: { status: EnsaioCorpoProva["status_conformidade"]; atrasado: boolean }) {
  if (status === "dispensado") return <Badge variant="outline" className="text-[10px]">Dispensado</Badge>;
  if (status === "nao_aplica") return <Badge variant="outline" className="text-[10px]">Acompanhamento</Badge>;
  if (status === "conforme") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">Conforme</Badge>;
  if (status === "nao_conforme") return <Badge variant="destructive" className="text-[10px]">Não conforme</Badge>;
  if (atrasado) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px]">Atrasado</Badge>;
  return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
}

export function FichaRastreabilidade({ carga, onClose }: { carga: RastreabilidadeCarga | null; onClose: () => void }) {
  const { data: cps = [], isLoading } = useEnsaiosDaCarga(carga?.carga_id ?? null);
  const { podeInserir } = usePapelModulo("qualidade");
  const [cpEmEdicao, setCpEmEdicao] = useState<EnsaioCorpoProva | null>(null);

  return (
    <>
      <Dialog open={!!carga} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{carga?.codigo_rastreabilidade}</span>
              <span className="text-sm font-normal text-muted-foreground">{carga && formatBR(carga.data)}</span>
            </DialogTitle>
          </DialogHeader>

          {carga && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground rounded-md border bg-muted/30 p-3">
              <span>Fornecedor: <strong className="text-foreground">{carga.fornecedor_nome}</strong></span>
              <span>Traço: <strong className="text-foreground">{carga.traco_nome} ({carga.fck_mpa} MPa)</strong></span>
              <span>Volume: <strong className="text-foreground">{carga.quantidade_m3} m³</strong></span>
              <span>Nota fiscal: <strong className="text-foreground">{carga.nota_fiscal ?? "—"}</strong></span>
              <span>Cod. Laboratório: <strong className="text-foreground">{carga.cod_laboratorio ?? "—"}</strong></span>
              <span>Local: <strong className="text-foreground">{[carga.setor_nome, carga.area_nome, carga.etapa_nome].filter(Boolean).join(" / ") || "—"}</strong></span>
            </div>
          )}

          {podeInserir && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/qualidade/concreto/ensaios/importar">
                <Upload className="h-4 w-4" /> Importar resultados
              </Link>
            </Button>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Idade</TableHead>
                  <TableHead>Laboratório</TableHead>
                  <TableHead>Nº lab.</TableHead>
                  <TableHead>Peça concretada</TableHead>
                  <TableHead>Ruptura prevista</TableHead>
                  <TableHead className="text-right">Fcj (MPa)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!isLoading && cps.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum corpo de prova cadastrado pra esta carga.</TableCell></TableRow>
                )}
                {cps.map((cp) => (
                  <TableRow key={cp.corpo_prova_id}>
                    <TableCell className="whitespace-nowrap">{cp.idade_prevista_dias} dias</TableCell>
                    <TableCell className="whitespace-nowrap">{cp.laboratorio_nome ?? "—"}</TableCell>
                    <TableCell>{cp.numero_lab ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={cp.peca_concretada ?? undefined}>{cp.peca_concretada ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatBR(cp.data_ruptura_prevista)}</TableCell>
                    <TableCell className="text-right">{cp.resultado_mpa ?? "—"}</TableCell>
                    <TableCell><ConformidadeBadge status={cp.status_conformidade} atrasado={cp.ensaio_atrasado} /></TableCell>
                    <TableCell>
                      {podeInserir && cp.status_conformidade !== "dispensado" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCpEmEdicao(cp)}>
                          {cp.status === "rompido" ? "Editar" : "Lançar resultado"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <LancarResultadoModal corpoProva={cpEmEdicao} onClose={() => setCpEmEdicao(null)} />
    </>
  );
}
